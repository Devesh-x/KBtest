const { v4: uuidv4 } = require('uuid');

class TowerOfHanoi {
  constructor(io) {
    this.io = io;
    this.queues = {};
    this.gameStates = {}; // Store game states
    this.activePlayers = {}; // Add this
    this.disconnectedPlayers = {}; // Track disconnected players by playerId
    this.gameResults=new Map(); 

    // Initialize queues for difficulties 3 to 10
    for (let i = 3; i <= 10; i++) {
      this.queues[i] = [];
    }
  }

  createTowers(numDisks) {
    const towers = [[], [], []];
    for (let i = numDisks; i >= 1; i--) {
      towers[0].push(i);
    }
    return towers;
  }

  // Lightweight validation for moves
  isPlausibleMove(oldTowers, newTowers, oldMoves, newMoves) {
    if (newMoves !== oldMoves + 1) {
      return false;
    }
    let changes = 0;
    for (let i = 0; i < 3; i++) {
      if (JSON.stringify(oldTowers[i]) !== JSON.stringify(newTowers[i])) {
        changes++;
      }
    }
    return changes === 2; // One tower loses a disk, one gains it
  }

  // Validate undo
  isValidUndo(oldTowers, newTowers, oldMoves, newMoves, history, newHistory) {
    if (newMoves !== oldMoves - 1 || history.length === 0) {
      return false;
    }
    const lastHistory = history[history.length - 1];
    return (
      JSON.stringify(lastHistory.towers) === JSON.stringify(newTowers) &&
      lastHistory.moves === newMoves &&
      JSON.stringify(history.slice(0, -1)) === JSON.stringify(newHistory)
    );
  }

  // Validate reset
  isValidReset(newTowers, newMoves, newHistory, difficulty) {
    const expectedTowers = this.createTowers(difficulty);
    return (
      JSON.stringify(newTowers) === JSON.stringify(expectedTowers) &&
      newMoves === 0 &&
      newHistory.length === 0
    );
  }

  joinQueue(player_id, socket, difficulty) {
    if (!this.queues[difficulty]) {
      console.log(`[ERROR] Invalid difficulty ${difficulty} for player ${player_id}`);
      socket.emit("error", { message: "Invalid difficulty" });
      return;
    }
  
    // Check if player is already in a game or queue using a tracking object
    if (this.activePlayers[player_id]) {
      console.log(`[ERROR] Player ${player_id} is already in a game or queue`);
      socket.emit("error", { message: "Already in a game or queue" });
      const queue = this.queues[difficulty];
      const index = queue.findIndex((entry) => entry.player_id === player_id);
      if (index !== -1) {
        clearTimeout(queue[index].timeout);
        queue.splice(index, 1);
      }
      return;
    }
  
    const queue = this.queues[difficulty];
    const alreadyQueued = queue.some((entry) => entry.player_id === player_id);
    if (alreadyQueued) {
      console.log(`[QUEUE] Player ${player_id} is already in the queue for difficulty ${difficulty}`);
      socket.emit("error", { message: "Already queued for a game" });
      const index = queue.findIndex((entry) => entry.player_id === player_id);
      if (index !== -1) {
        clearTimeout(queue[index].timeout);
        queue.splice(index, 1);
      }
      return;
    }
  
    if (queue.length > 0) {
      const opponent = queue.shift();
      clearTimeout(opponent.timeout);
      const roomId = `room-${player_id}-${opponent.player_id}-${uuidv4()}`;
      socket.join(roomId);
      opponent.socket.join(roomId);
  
      // Track players in the room
      this.activePlayers[player_id] = { roomId, socket };
      this.activePlayers[opponent.player_id] = { roomId, socket: opponent.socket };
  
      this.gameStates[roomId] = {
        playerA: {
          id: player_id,
          socketId: socket.id,
          towers: this.createTowers(difficulty),
          moves: 0,
          history: [],
        },
        playerB: {
          id: opponent.player_id,
          socketId: opponent.socket.id,
          towers: this.createTowers(difficulty),
          moves: 0,
          history: [],
        },
        difficulty,
      };
  
      console.log(`[MATCH] ${player_id} vs ${opponent.player_id} in room ${roomId}`);
      this.io.to(roomId).emit("start game", {
        players: [player_id, opponent.player_id],
        roomId,
        difficulty,
        gameState: {
          playerA: {
            id: this.gameStates[roomId].playerA.id,
            towers: this.gameStates[roomId].playerA.towers,
            moves: this.gameStates[roomId].playerA.moves,
            history: this.gameStates[roomId].playerA.history,
          },
          playerB: {
            id: this.gameStates[roomId].playerB.id,
            towers: this.gameStates[roomId].playerB.towers,
            moves: this.gameStates[roomId].playerB.moves,
            history: this.gameStates[roomId].playerB.history,
          },
        },
      });
    } else {
      const timeout = setTimeout(() => {
        const index = this.queues[difficulty].findIndex(
          (entry) => entry.player_id === player_id
        );
        if (index !== -1) {
          this.queues[difficulty].splice(index, 1);
          socket.emit("no players online");
          console.log(`[TIMEOUT] Removed ${player_id} from queue after waiting`);
        }
      }, 10000);
      queue.push({ player_id, socket, timeout });
      this.activePlayers[player_id] = { socket, inQueue: true };
      console.log(`[QUEUE] Added ${player_id} to queue at difficulty ${difficulty}`);
    }
  }

  handleMove(room_id, player_id, player_moves, player_towers, socket) {
    console.log(`[MOVE REQUEST] Room ${room_id}, Player ${player_id}`);

    if (!room_id || !player_id || !player_moves || !player_towers) {
      console.log(`[ERROR] Invalid move data for player ${player_id}`);
      socket.emit("error", { message: "Invalid move data" });
      return;
    }

    const room = this.gameStates[room_id];
    if (!room || !room.playerA || !room.playerB) {
      console.log(`[ERROR] Room ${room_id} or players not found`);
      socket.emit("error", { message: "Room or players not found" });
      return;
    }

    const playerKey = player_id === room.playerA.id ? "playerA" : player_id === room.playerB.id ? "playerB" : null;
    if (!playerKey) {
      console.log(`[ERROR] Player ${player_id} not in room ${room_id}`);
      socket.emit("error", { message: "Player not in room" });
      return;
    }

    if (!this.isPlausibleMove(room[playerKey].towers, player_towers, room[playerKey].moves, player_moves)) {
      console.log(`[ERROR] Invalid move for player ${player_id}`);
      socket.emit("error", { message: "Invalid move" });
      return;
    }

    // Update history
    room[playerKey].history.push({
      towers: room[playerKey].towers.map((t) => [...t]), // Deep copy
      moves: room[playerKey].moves,
    });

    // Update state
    room[playerKey].towers = player_towers.map((t) => [...t]); // Deep copy
    room[playerKey].moves = player_moves;
    room[playerKey].socketId = socket.id; // Update socketId in case of reconnect

    console.log(`[MOVE] Player ${player_id} made move in room ${room_id}: moves=${player_moves}`);

    this.io.to(room_id).emit("update game", {
      newTowers: {
        playerA: { id: room.playerA.id, towers: room.playerA.towers },
        playerB: { id: room.playerB.id, towers: room.playerB.towers },
      },
      newMoves: {
        playerA: room.playerA.moves,
        playerB: room.playerB.moves,
      },
      newHistory: {
        playerA: room.playerA.history,
        playerB: room.playerB.history,
      },
    });
  }

  handleUndo(room_id, player_id, newTowers, newMoves, newHistory, socket) {
    console.log(`[UNDO REQUEST] Room ${room_id}, Player ${player_id}`);

    if (!room_id || !player_id || !newTowers || newMoves === undefined || !newHistory) {
      console.log(`[ERROR] Invalid undo data for player ${player_id}`);
      socket.emit("error", { message: "Invalid undo data" });
      return;
    }

    const room = this.gameStates[room_id];
    if (!room) {
      console.log(`[ERROR] Room ${room_id} does not exist`);
      socket.emit("error", { message: "Room does not exist" });
      return;
    }

    const playerKey = player_id === room.playerA.id ? "playerA" : player_id === room.playerB.id ? "playerB" : null;
    if (!playerKey) {
      console.log(`[ERROR] Player ${player_id} not in room ${room_id}`);
      socket.emit("error", { message: "Player not in room" });
      return;
    }

    if (!this.isValidUndo(room[playerKey].towers, newTowers, room[playerKey].moves, newMoves, room[playerKey].history, newHistory)) {
      console.log(`[ERROR] Invalid undo state for player ${player_id}`);
      socket.emit("error", { message: "Invalid undo state" });
      return;
    }

    room[playerKey].towers = newTowers.map((t) => [...t]); // Deep copy
    room[playerKey].moves = newMoves;
    room[playerKey].history = newHistory.map((h) => ({ towers: h.towers.map((t) => [...t]), moves: h.moves })); // Deep copy
    room[playerKey].socketId = socket.id; // Update socketId

    console.log(`[UNDO] Player ${player_id} undid move in room ${room_id}: moves=${newMoves}`);

    this.io.to(room_id).emit("update game", {
      newTowers: {
        playerA: { id: room.playerA.id, towers: room.playerA.towers },
        playerB: { id: room.playerB.id, towers: room.playerB.towers },
      },
      newMoves: {
        playerA: room.playerA.moves,
        playerB: room.playerB.moves,
      },
      newHistory: {
        playerA: room.playerA.history,
        playerB: room.playerB.history,
      },
    });
  }

  handleReset(room_id, player_id, newTowers, newMoves, newHistory, socket) {
    console.log(`[RESET REQUEST] Room ${room_id}, Player ${player_id}`);

    if (!room_id || !player_id || !newTowers || newMoves === undefined || !newHistory) {
      console.log(`[ERROR] Invalid reset data for player ${player_id}`);
      socket.emit("error", { message: "Invalid reset data" });
      return;
    }

    const room = this.gameStates[room_id];
    if (!room) {
      console.log(`[ERROR] Room ${room_id} does not exist`);
      socket.emit("error", { message: "Room does not exist" });
      return;
    }

    const playerKey = player_id === room.playerA.id ? "playerA" : player_id === room.playerB.id ? "playerB" : null;
    if (!playerKey) {
      console.log(`[ERROR] Player ${player_id} not in room ${room_id}`);
      socket.emit("error", { message: "Player not in room" });
      return;
    }

    if (!this.isValidReset(newTowers, newMoves, newHistory, room.difficulty)) {
      console.log(`[ERROR] Invalid reset state for player ${player_id}`);
      socket.emit("error", { message: "Invalid reset state" });
      return;
    }

    room[playerKey].towers = newTowers.map((t) => [...t]); // Deep copy
    room[playerKey].moves = newMoves;
    room[playerKey].history = newHistory.map((h) => ({ towers: h.towers.map((t) => [...t]), moves: h.moves })); // Deep copy
    room[playerKey].socketId = socket.id; // Update socketId

    console.log(`[RESET] Player ${player_id} reset game in room ${room_id}`);

    this.io.to(room_id).emit("update game", {
      newTowers: {
        playerA: { id: room.playerA.id, towers: room.playerA.towers },
        playerB: { id: room.playerB.id, towers: room.playerB.towers },
      },
      newMoves: {
        playerA: room.playerA.moves,
        playerB: room.playerB.moves,
      },
      newHistory: {
        playerA: room.playerA.history,
        playerB: room.playerB.history,
      },
    });
  }

  handleGameWon(roomId, playerId) {
    console.log(`[GAME WON] Room ${roomId}, Winner ${playerId}`);
    const room = this.gameStates[roomId];
    if (!room) {
      console.log(`[ERROR] Room ${roomId} does not exist`);
      return;
    }
  
    const opponentKey = room.playerA.id === playerId ? "playerB" : "playerA";
    const opponentId = room[opponentKey].id;
  
    // Store the game result for both players
    this.gameResults.set(playerId, { winner: playerId, roomId });
    this.gameResults.set(opponentId, { winner: playerId, roomId });
  
    this.io.to(roomId).emit("show result", { winner: playerId, roomId });
  
    // Do not delete the room here; let handleLeaveGame handle cleanup
    // delete this.gameStates[roomId];
    // delete this.activePlayers[playerId];
    // delete this.activePlayers[opponentId];
  }

  handleDisconnect(socket) {
    let playerId = null;
    for (let pid in this.activePlayers) {
      if (this.activePlayers[pid].socket === socket) {
        playerId = pid;
        break;
      }
    }
  
    if (!playerId) {
      console.log(`[DISCONNECT] No player associated with socket ${socket.id}`);
      return;
    }
  
    const roomId = this.activePlayers[playerId]?.roomId;
    console.log(`[DISCONNECT] Player ${playerId} (socket ${socket.id}) disconnected from room ${roomId}`);
  
    // Remove from queue if present
    for (let difficulty in this.queues) {
      const queue = this.queues[difficulty];
      const index = queue.findIndex((entry) => entry.player_id === playerId);
      if (index !== -1) {
        clearTimeout(queue[index].timeout);
        queue.splice(index, 1);
        console.log(`[QUEUE] Removed ${playerId} from queue for difficulty ${difficulty}`);
      }
    }
  
    if (roomId && this.gameStates[roomId]) {
      const room = this.gameStates[roomId];
      const opponentKey = room.playerA.id === playerId ? "playerB" : room.playerB.id === playerId ? "playerA" : null;
      if (!opponentKey) {
        console.log(`[ERROR] Player ${playerId} not found in room ${roomId}`);
        return;
      }
  
      const opponent = room[opponentKey];
      this.io.to(roomId).emit("opponentDisconnected", {
        message: `Player ${playerId} disconnected. Waiting for reconnection...`,
        disconnectedPlayerId: playerId,
      });
  
      this.disconnectedPlayers[playerId] = setTimeout(() => {
        console.log(`[TIMEOUT] Player ${playerId} did not reconnect in room ${roomId}`);
        if (!this.gameStates[roomId]) {
          console.log(`[INFO] Room ${roomId} already deleted, skipping timeout cleanup`);
          delete this.disconnectedPlayers[playerId];
          return;
        }
        this.io.to(roomId).emit("opponent left", {
          message: `Player ${playerId} has left the game.`,
          disconnectedPlayerId: playerId,
        });
        // Store game result: opponent wins due to disconnection
        this.gameResults.set(playerId, { winner: opponent.id, roomId, reason: "disconnected" });
        this.gameResults.set(opponent.id, { winner: opponent.id, roomId, reason: "disconnected" });
        // Call handleLeaveGame to clean up the room properly
        this.handleLeaveGame(roomId, playerId, socket);
        delete this.disconnectedPlayers[playerId];
      }, 60000);
    }
  
    delete this.activePlayers[playerId];
  }

  handleReconnect(roomId, playerId, socket) {
    console.log(`[RECONNECT REQUEST] Room ${roomId}, Player ${playerId}, Socket ${socket.id}`);
  
    // Check if the game has ended
    if (this.gameResults.has(playerId) && this.gameResults.get(playerId).roomId === roomId) {
      const { winner, reason } = this.gameResults.get(playerId);
      socket.emit("game ended", { winner, message: `Game ended. Winner: ${winner}${reason ? ` (${reason})` : ''}` });
      this.gameResults.delete(playerId); // Clean up
      const room = this.gameStates[roomId];
      if (room) {
        const opponentKey = room.playerA.id === playerId ? "playerB" : "playerA";
        const opponentId = room[opponentKey].id;
        this.gameResults.delete(opponentId); // Clean up for opponent
      }
      return;
    }
  
    const room = this.gameStates[roomId];
    if (!room) {
      console.log(`[ERROR] Reconnect failed for player ${playerId}: Room ${roomId} not found`);
      socket.emit("error", { message: "Room not found or reconnection timeout" });
      return;
    }
    const playerKey = room.playerA.id === playerId ? "playerA" : room.playerB.id === playerId ? "playerB" : null;
    if (!playerKey) {
      console.log(`[ERROR] Player ${playerId} not in room ${roomId}`);
      socket.emit("error", { message: "Invalid player for this room" });
      return;
    }
  
    if (this.disconnectedPlayers[playerId]) {
      clearTimeout(this.disconnectedPlayers[playerId]);
      delete this.disconnectedPlayers[playerId];
    }
  
    socket.join(roomId);
    this.activePlayers[playerId] = { roomId, socket };
  
    room[playerKey].socketId = socket.id;
    setTimeout(() => {
      const opponentKey = playerKey === "playerA" ? "playerB" : "playerA";
      const opponentSocketId = room[opponentKey].socketId;
      // Emit to the opponent's socket only
      this.io.to(opponentSocketId).emit("playerRejoined", { playerId });
      socket.emit("update game", {
        newTowers: {
          playerA: { id: room.playerA.id, towers: room.playerA.towers },
          playerB: { id: room.playerB.id, towers: room.playerB.towers },
        },
        newMoves: {
          playerA: room.playerA.moves,
          playerB: room.playerB.moves,
        },
        newHistory: {
          playerA: room.playerA.history,
          playerB: room.playerB.history,
        },
      });
      console.log(`[RECONNECT] Player ${playerId} rejoined room ${roomId}`);
    }, 500);
  }


  handleLeaveGame(roomId, playerId, socket) {
    console.log(`[LEAVE GAME] Player ${playerId} leaving room ${roomId}`);
    const room = this.gameStates[roomId];
    if (!room) {
      console.log(`[INFO] Room ${roomId} already deleted, ignoring leave request for player ${playerId}`);
      // Do not emit an error to the client
      return;
    }
    const opponentKey = room.playerA.id === playerId ? "playerB" : room.playerB.id === playerId ? "playerA" : null;
    if (!opponentKey) {
      console.log(`[ERROR] Player ${playerId} not in room ${roomId}`);
      socket.emit("error", { message: "Player not in room" });
      return;
    }
    if (this.disconnectedPlayers[playerId]) {
      clearTimeout(this.disconnectedPlayers[playerId]);
      delete this.disconnectedPlayers[playerId];
    }
  
    const opponentId = room[opponentKey].id;
    // Only emit opponent left if the game hasn't already ended for the opponent
    if (!this.gameResults.has(opponentId) || this.gameResults.get(opponentId).roomId !== roomId) {
      this.gameResults.set(playerId, { winner: opponentId, roomId, reason: "opponent left" });
      this.gameResults.set(opponentId, { winner: opponentId, roomId, reason: "opponent left" });
  
      this.io.to(roomId).emit("opponent left", {
        message: `Player ${playerId} has left the game.`,
        disconnectedPlayerId: playerId,
      });
    }
  
    // Clean up the room and player states
    delete this.gameStates[roomId];
    delete this.activePlayers[playerId];
    delete this.activePlayers[opponentId];
    console.log(`[LEAVE GAME] Room ${roomId} deleted`);
  }
}

module.exports = TowerOfHanoi;