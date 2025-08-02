const { v4: uuidv4 } = require('uuid');

// Path Definitions (from frontend)
const RED_PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [3, 6], [2, 6],
  [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14], [8, 13],
  [8, 12], [8, 11], [8, 10], [8, 9], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8],
  [13, 8], [14, 8], [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], // Home stretch
];

const GREEN_PATH = [
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12],
  [6, 13], [6, 14], [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2],
  [8, 1], [8, 0], [7, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], // Home stretch
];

const YELLOW_PATH = [
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8], [9, 8], [10, 8], [11, 8],
  [12, 8], [13, 8], [14, 8], [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6],
  [9, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [3, 6], [2, 6],
  [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14],
  [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8], [7, 7], // Home stretch
];

const BLUE_PATH = [
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2],
  [8, 1], [8, 0], [7, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8], [1, 8], [2, 8],
  [3, 8], [4, 8], [5, 8], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8], [9, 8], [10, 8],
  [11, 8], [12, 8], [13, 8], [14, 8], [14, 7],
  [13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7], // Home stretch
];

const COLOR_PATHS = {
  0: RED_PATH,
  1: GREEN_PATH,
  2: YELLOW_PATH,
  3: BLUE_PATH,
};

const PLAYER_COLORS = ['#FF5252', '#4CAF50', '#FFC107', '#2196F3'];
const COLOR_NAMES = {
  '#FF5252': 'Red',
  '#4CAF50': 'Green',
  '#FFC107': 'Yellow',
  '#2196F3': 'Blue',
};
const PLAYER_START_CELLS = {
  0: [6, 1], // Red
  1: [1, 8], // Green
  2: [8, 13], // Yellow
  3: [13, 6], // Blue
};
const HOME_POSITIONS = [
  // Red
  [[1, 1], [1, 4], [4, 1], [4, 4]],
  // Green
  [[1, 10], [1, 13], [4, 10], [4, 13]],
  // Yellow
  [[10, 10], [10, 13], [13, 10], [13, 13]],
  // Blue
  [[10, 1], [10, 4], [13, 1], [13, 4]],
];
const INVINCIBLE_POSITIONS = [
  // Entry points
  [6, 1], [1, 8], [8, 13], [13, 6],
  // Red home stretch
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7],
  // Green home stretch
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7],
  // Yellow home stretch
  [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8], [7, 7],
  // Blue home stretch
  [13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7],
  // Special colored circles
  [8, 3], [3, 6], [6, 11], [11, 8],
];

class Ludo {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.activeConnections = new Map();

    io.on('connection', (socket) => {
      if (this.activeConnections.has(socket.id)) {
        socket.disconnect(true);
        return;
      }

      this.activeConnections.set(socket.id, {
        ip: socket.handshake.address,
        connectedAt: new Date(),
      });

      console.log(`[Ludo] New connection: ${socket.id} from ${socket.handshake.address}`);

      //socket.on('createRoom', (data, callback) => this.createRoom(socket, data, callback));
      socket.on('joinRoom', (data, callback) => this.joinRoom(socket, data.roomId, data.playerName, callback));
      socket.on('rollDice', (data, callback) => this.handleRollDice(socket, data, callback));
      socket.on('movePiece', (data, callback) => this.handleMovePiece(socket, data, callback));
      socket.on('restartGame', (data) => this.handleRestart(socket, data));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  initializeGameState() {
    const players = PLAYER_COLORS.map((color, index) => ({
      id: index,
      color,
      type: 'human',
      pieces: Array(4).fill(null).map((_, i) => ({ id: i, pathIndex: 0, isFinished: false })),
      startingPosition: [1, 14, 40, 27][index],
    }));

    return {
      players,
      currentTurn: 0,
      diceRoll: null,
      consecutiveSixes: 0,
      gameOver: false,
      winner: null,
      selectedPiece: null,
      message: "Game started! Red player's turn.",
      winners: [],
      loser: null,
      skipPending: false,
    };
  }

  createRoom(socket, data, callback = () => {}) {
    try {
      const { roomId: clientRoomId, playerName } = data || {};
      const roomId = clientRoomId || uuidv4();

      if (this.rooms.has(roomId)) {
        callback({ error: 'Room already exists' });
        return;
      }

      const gameState = this.initializeGameState();
      this.rooms.set(roomId, {
        players: [{ socketId: socket.id, playerName: playerName || `Player ${COLOR_NAMES[PLAYER_COLORS[0]]}` }],
        gameState,
        currentPlayer: 0,
      });

      socket.join(roomId);
      console.log(`[Ludo] Room ${roomId} created by ${socket.id} (${playerName})`);

      callback({
        success: true,
        roomId,
        playerId: 0,
        color: PLAYER_COLORS[0],
        gameState,
      });

      socket.emit('gameStart', {
        gameState,
        currentPlayer: 0,
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[Ludo CREATE ROOM ERROR]', error);
    }
  }

  joinRoom(socket, roomId, playerName, callback = () => {}) {
    try {
      const room = this.rooms.get(roomId);

      if (!room) {
        callback({ error: 'Room does not exist' });
        return;
      }

      if (room.players.length >= 4) {
        callback({ error: 'Room is full' });
        return;
      }

      const playerId = room.players.length;
      room.players.push({ socketId: socket.id, playerName: playerName || `Player ${COLOR_NAMES[PLAYER_COLORS[playerId]]}` });
      socket.join(roomId);
      console.log(`[Ludo] Player ${socket.id} (${playerName}) joined room ${roomId} as player ${playerId}`);

      if (room.players.length === 4) {
        room.gameState.players = room.players.map((p, i) => ({
          ...room.gameState.players[i],
          type: 'human',
        }));
        this.io.to(roomId).emit('gameStart', {
          gameState: room.gameState,
          currentPlayer: room.currentPlayer,
        });
      }

      callback({
        success: true,
        roomId,
        playerId,
        color: PLAYER_COLORS[playerId],
        gameState: room.gameState,
      });

      this.io.to(roomId).emit('playerJoined', {
        playerCount: room.players.length,
        message: `${playerName || `Player ${COLOR_NAMES[PLAYER_COLORS[playerId]]}`} joined the game`,
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[Ludo JOIN ROOM ERROR]', error);
    }
  }

  getPlayerPathPosition(playerId, pathIndex, pieceId) {
    if (pathIndex === 0) {
      return HOME_POSITIONS[playerId][pieceId] || null;
    }
    const path = COLOR_PATHS[playerId];
    if (!path || pathIndex - 1 < 0 || pathIndex - 1 >= path.length) return null;
    return path[pathIndex - 1];
  }

  isInvincible(row, col) {
    return INVINCIBLE_POSITIONS.some(([r, c]) => r === row && c === col);
  }

  getPossibleMoves(player, roll) {
    const moves = [];
    const path = COLOR_PATHS[player.id];
    player.pieces.forEach(piece => {
      if (piece.isFinished) return;
      if (piece.pathIndex === 0) {
        if (roll === 6) {
          moves.push({ pieceId: piece.id, newPathIndex: 1 });
        }
      } else {
        const newPathIndex = piece.pathIndex + roll;
        if (newPathIndex <= path.length) {
          moves.push({ pieceId: piece.id, newPathIndex });
        }
      }
    });
    return moves;
  }

  getGlobalPosition(player, pathIndex) {
    if (pathIndex < 1 || pathIndex > 50) return null;
    return (player.startingPosition + pathIndex - 2) % 52;
  }

  handleRollDice(socket, { roomId }, callback = () => {}) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        socket.emit('moveError', { message: 'Room not found' });
        callback({ error: 'Room not found' });
        return;
      }

      if (room.gameState.gameOver || room.gameState.skipPending) {
        socket.emit('moveError', { message: 'Game over or turn skipped' });
        callback({ error: 'Game over or turn skipped' });
        return;
      }

      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== room.currentPlayer) {
        socket.emit('moveError', { message: 'Not your turn' });
        callback({ error: 'Not your turn' });
        return;
      }

      const result = Math.floor(Math.random() * 6) + 1;
      const currentPlayer = room.gameState.players[playerIndex];
      const colorName = COLOR_NAMES[currentPlayer.color] || currentPlayer.color;
      const possibleMoves = this.getPossibleMoves(currentPlayer, result);

      if (possibleMoves.length === 0) {
        room.gameState.diceRoll = result;
        room.gameState.message = `${colorName} rolled a ${result} but has no moves. Turn skipped.`;
        room.gameState.skipPending = true;

        setTimeout(() => {
          room.gameState.currentTurn = (room.gameState.currentTurn + 1) % room.gameState.players.length;
          room.gameState.diceRoll = null;
          room.gameState.message = `${COLOR_NAMES[room.gameState.players[room.gameState.currentTurn].color] || room.gameState.players[room.gameState.currentTurn].color}'s turn.`;
          room.gameState.skipPending = false;
          this.io.to(roomId).emit('gameUpdate', {
            gameState: room.gameState,
            currentPlayer: room.currentPlayer,
          });
        }, 2000);

        this.io.to(roomId).emit('gameUpdate', {
          gameState: room.gameState,
          currentPlayer: room.currentPlayer,
        });

        callback({ success: true, gameState: room.gameState });
        return;
      }

      room.gameState.diceRoll = result;
      room.gameState.message = `${colorName} rolled a ${result}`;
      room.currentPlayer = playerIndex;

      this.io.to(roomId).emit('gameUpdate', {
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
      });

      callback({ success: true, gameState: room.gameState });
    } catch (error) {
      socket.emit('moveError', { message: 'Server error' });
      callback({ error: 'Server error' });
      console.error('[Ludo ROLL DICE ERROR]', error);
    }
  }

  handleMovePiece(socket, { roomId, pieceId }, callback = () => {}) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        socket.emit('moveError', { message: 'Room not found' });
        callback({ error: 'Room not found' });
        return;
      }

      if (room.gameState.gameOver || room.gameState.diceRoll === null || room.gameState.skipPending) {
        socket.emit('moveError', { message: 'Invalid move: Game over or no dice roll' });
        callback({ error: 'Invalid move: Game over or no dice roll' });
        return;
      }

      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== room.currentPlayer) {
        socket.emit('moveError', { message: 'Not your turn' });
        callback({ error: 'Not your turn' });
        return;
      }

      const currentPlayer = room.gameState.players[playerIndex];
      const path = COLOR_PATHS[currentPlayer.id];
      const moves = this.getPossibleMoves(currentPlayer, room.gameState.diceRoll);
      const move = moves.find(m => m.pieceId === pieceId);

      if (!move) {
        socket.emit('moveError', { message: 'Invalid move' });
        callback({ error: 'Invalid move' });
        return;
      }

      const newPlayers = room.gameState.players.map(p => {
        if (p.id === currentPlayer.id) {
          return {
            ...p,
            pieces: p.pieces.map(piece =>
              piece.id === pieceId
                ? {
                    ...piece,
                    pathIndex: move.newPathIndex,
                    isFinished: move.newPathIndex === path.length,
                  }
                : piece,
            ),
          };
        }
        return p;
      });

      let didCapture = false;
      const newPos = path[move.newPathIndex - 1];
      if (newPos && move.newPathIndex <= path.length - 7 && !this.isInvincible(newPos[0], newPos[1])) {
        newPlayers.forEach(opponent => {
          if (opponent.id !== currentPlayer.id) {
            const oppPath = COLOR_PATHS[opponent.id];
            opponent.pieces.forEach((piece, index) => {
              if (
                piece.pathIndex > 0 &&
                piece.pathIndex <= oppPath.length - 7 &&
                oppPath[piece.pathIndex - 1][0] === newPos[0] &&
                oppPath[piece.pathIndex - 1][1] === newPos[1] &&
                !piece.isFinished
              ) {
                newPlayers[opponent.id].pieces[index].pathIndex = 0;
                didCapture = true;
              }
            });
          }
        });
      }

      let winners = room.gameState.winners ? [...room.gameState.winners] : [];
      let loser = room.gameState.loser || null;
      newPlayers.forEach(p => {
        if (!winners.some(w => w.id === p.id) && p.pieces.every(piece => piece.isFinished)) {
          winners.push(p);
        }
      });

      if (winners.length === 3 && !loser) {
        const loserPlayer = newPlayers.find(p => !winners.some(w => w.id === p.id));
        if (loserPlayer) loser = loserPlayer;
      }

      const gameOver = winners.length === 4 || (winners.length === 3 && loser);
      let nextTurn;
      let message;
      const reachedCenter = move.newPathIndex === path.length;

      if (gameOver) {
        nextTurn = room.gameState.currentTurn;
        const first = winners[0] ? COLOR_NAMES[winners[0].color] || winners[0].color : '-';
        const second = winners[1] ? COLOR_NAMES[winners[1].color] || winners[1].color : '-';
        const third = winners[2] ? COLOR_NAMES[winners[2].color] || winners[2].color : '-';
        const last = loser ? COLOR_NAMES[loser.color] || loser.color : '-';
        message = `Results: 1st: ${first}, 2nd: ${second}, 3rd: ${third}, Loser: ${last}`;
      } else if (reachedCenter) {
        nextTurn = room.gameState.currentTurn;
        message = `${COLOR_NAMES[currentPlayer.color] || currentPlayer.color} reached the center! Roll again.`;
      } else if (didCapture && room.gameState.diceRoll !== 6) {
        nextTurn = room.gameState.currentTurn;
        message = `${COLOR_NAMES[currentPlayer.color] || currentPlayer.color} captured a piece! Roll again.`;
      } else if (room.gameState.diceRoll === 6 && !gameOver) {
        nextTurn = room.gameState.currentTurn;
        message = `${COLOR_NAMES[currentPlayer.color] || currentPlayer.color} rolled a 6! Roll again.`;
      } else {
        nextTurn = (room.gameState.currentTurn + 1) % room.gameState.players.length;
        message = `${COLOR_NAMES[room.gameState.players[nextTurn].color] || room.gameState.players[nextTurn].color}'s turn.`;
      }

      room.gameState = {
        ...room.gameState,
        players: newPlayers,
        currentTurn: nextTurn,
        diceRoll: null,
        selectedPiece: null,
        gameOver,
        winner: winners[0] || null,
        winners,
        loser,
        message,
        skipPending: false,
      };

      room.currentPlayer = nextTurn;

      this.io.to(roomId).emit('gameUpdate', {
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
      });

      callback({ success: true, gameState: room.gameState });
    } catch (error) {
      socket.emit('moveError', { message: 'Server error' });
      callback({ error: 'Server error' });
      console.error('[Ludo MOVE PIECE ERROR]', error);
    }
  }

  handleRestart(socket, { roomId }) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) return;

      room.gameState = this.initializeGameState();
      room.currentPlayer = 0;

      this.io.to(roomId).emit('gameRestarted', {
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
      });

      console.log(`[Ludo] Room ${roomId} restarted`);
    } catch (error) {
      console.error('[Ludo RESTART ERROR]', error);
    }
  }

  handleDisconnect(socket) {
    this.activeConnections.delete(socket.id);
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(player => player.socketId === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          console.log(`[Ludo] Room ${roomId} deleted due to all players disconnecting`);
        } else {
          this.io.to(roomId).emit('playerDisconnected', {
            message: 'A player disconnected',
            playerCount: room.players.length,
          });
          console.log(`[Ludo] Player ${socket.id} disconnected from room ${roomId}`);
        }
        break;
      }
    }
  }
}

module.exports = Ludo;