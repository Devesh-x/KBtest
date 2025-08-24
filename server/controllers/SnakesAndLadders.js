const {v4: uuidv4} = require('uuid');

// Board Configuration
const snakes = [
  {start: 16, end: 6, color: '#FF5252'},
  {start: 47, end: 26, color: '#8BC34A'},
  {start: 49, end: 11, color: '#9C27B0'},
  {start: 56, end: 53, color: '#FF9800'},
  {start: 62, end: 19, color: '#E91E63'},
  {start: 64, end: 60, color: '#3F51B5'},
  {start: 87, end: 24, color: '#009688'},
  {start: 93, end: 73, color: '#673AB7'},
  {start: 95, end: 75, color: '#4CAF50'},
  {start: 98, end: 78, color: '#F44336'},
];

const ladders = [
  {start: 1, end: 38, color: '#FFC107'},
  {start: 4, end: 14, color: '#2196F3'},
  {start: 9, end: 31, color: '#CDDC39'},
  {start: 21, end: 42, color: '#00BCD4'},
  {start: 28, end: 84, color: '#FF5722'},
  {start: 36, end: 44, color: '#795548'},
  {start: 51, end: 67, color: '#607D8B'},
  {start: 71, end: 91, color: '#9E9E9E'},
  {start: 80, end: 100, color: '#FFEB3B'},
];

const boardSquares = Array.from({length: 100}, (_, i) => ({
  id: i + 1,
  target: null,
  isSnakeHead: false,
  isSnakeTail: false,
  isLadderBottom: false,
  isLadderTop: false,
}));

snakes.forEach(snake => {
  boardSquares[snake.start - 1].target = snake.end;
  boardSquares[snake.start - 1].isSnakeHead = true;
  boardSquares[snake.end - 1].isSnakeTail = true;
});

ladders.forEach(ladder => {
  boardSquares[ladder.start - 1].target = ladder.end;
  boardSquares[ladder.start - 1].isLadderBottom = true;
  boardSquares[ladder.end - 1].isLadderTop = true;
});

const playerColors = ['#F44336', '#2196F3', '#4CAF50', '#FFC107'];
const playerAvatars = ['👨', '👩', '👦', '👧'];

class SnakesAndLadders {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.activeConnections = new Map();
    io.on('connection', socket => {
      if (this.activeConnections.has(socket.id)) {
        socket.disconnect(true);
        return;
      }
      this.activeConnections.set(socket.id, {
        ip: socket.handshake.address,
        connectedAt: new Date(),
      });
      console.log(
        `[SnakesAndLadders] New connection: ${socket.id} from ${socket.handshake.address}`,
      );
    });
  }

  createRoom(socket, data, callback = () => {}) {
    try {
      const {roomId: clientRoomId, playerName} = data || {};
      const roomId = clientRoomId || uuidv4();
      if (this.rooms.has(roomId)) {
        callback({error: 'Room already exists'});
        return;
      }
      const gameState = this.initializeGameState(playerName, socket.id);
      this.rooms.set(roomId, {
        players: [socket.id],
        gameState,
      });
      socket.join(roomId);
      console.log(
        `[SnakesAndLadders] Room ${roomId} created by ${socket.id} (${playerName})`,
      );
      callback({
        success: true,
        roomId,
        playerId: socket.id,
        gameState,
      });
      socket.emit('game_start', {
        gameState,
        currentTurn: gameState.currentTurn,
      });
    } catch (error) {
      callback({error: error.message});
      console.error('[SnakesAndLadders CREATE ROOM ERROR]', error);
    }
  }

  joinRoom(socket, data, callback = () => {}) {
    try {
      const {roomId, playerName} = data || {};
      const room = this.rooms.get(roomId);
      if (!room) {
        callback({error: 'Room does not exist'});
        return;
      }
      if (room.players.length >= 4) {
        callback({error: 'Room is full'});
        return;
      }
      const playerIndex = room.players.length;
      const newPlayer = {
        id: socket.id,
        name: playerName || `Player ${playerIndex + 1}`,
        color: playerColors[playerIndex],
        position: 1,
        avatar: playerAvatars[playerIndex],
      };
      room.players.push(socket.id);
      room.gameState.players.push(newPlayer);
      socket.join(roomId);
      console.log(
        `[SnakesAndLadders] Player ${socket.id} (${playerName}) joined room ${roomId}`,
      );
      callback({
        success: true,
        roomId,
        playerId: socket.id,
        gameState: room.gameState,
      });
      this.io.to(roomId).emit('game_start', {
        gameState: room.gameState,
        currentTurn: room.gameState.currentTurn,
      });
    } catch (error) {
      callback({error: error.message});
      console.error('[SnakesAndLadders JOIN ROOM ERROR]', error);
    }
  }

  handleRollDice(socket, {roomId}) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.winner || room.gameState.isRolling) {
      socket.emit('rollError', {message: 'Invalid roll attempt'});
      return;
    }
    const currentPlayerIndex = room.gameState.currentTurn;
    const currentPlayer = room.gameState.players[currentPlayerIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('rollError', {message: 'Not your turn'});
      return;
    }
    room.gameState.isRolling = true;
    room.gameState.message = {
      text: `${currentPlayer.name} is rolling the dice...`,
      type: 'info',
      timeout: 1000,
    };
    this.io.to(roomId).emit('game_update', {
      gameState: room.gameState,
      currentTurn: room.gameState.currentTurn,
    });
    setTimeout(() => {
      const diceRoll = Math.floor(Math.random() * 6) + 1;
      let newPosition = currentPlayer.position + diceRoll;
      let message = {
        text: `${currentPlayer.name} rolled a ${diceRoll}!`,
        type: 'info',
        timeout: 2000,
      };
      if (newPosition > 100) {
        newPosition = 100 - (newPosition - 100);
        message = {
          text: `${currentPlayer.name} overshot 100! Bouncing back to ${newPosition}.`,
          type: 'warning',
          timeout: 3000,
        };
      }
      const target = room.gameState.board[newPosition - 1].target;
      if (target) {
        const isLadder = target > newPosition;
        newPosition = target;
        message = {
          text: isLadder
            ? `${currentPlayer.name} climbed a ladder to ${newPosition}!`
            : `${currentPlayer.name} slid down a snake to ${newPosition}!`,
          type: isLadder ? 'success' : 'warning',
          timeout: 3000,
        };
      }
      const newPlayers = room.gameState.players.map(p => {
        if (p.id !== currentPlayer.id && p.position === newPosition) {
          message = {
            text: `${currentPlayer.name} captured ${p.name}!`,
            type: 'success',
            timeout: 3000,
          };
          return {...p, position: 1};
        }
        return p;
      });
      newPlayers[currentPlayerIndex] = {
        ...currentPlayer,
        position: newPosition,
      };
      const winner =
        newPosition === 100 ? newPlayers[currentPlayerIndex] : null;
      if (winner) {
        message = {
          text: `${winner.name} wins the game!`,
          type: 'success',
          timeout: 0,
        };
      }
      room.gameState.players = newPlayers;
      room.gameState.diceRoll = diceRoll;
      room.gameState.isRolling = false;
      room.gameState.winner = winner;
      room.gameState.message = message;
      if (!winner) {
        room.gameState.currentTurn =
          (currentPlayerIndex + 1) % room.gameState.players.length;
        room.gameState.message = {
          text: `${room.gameState.players[room.gameState.currentTurn].name}'s turn`,
          type: 'info',
          timeout: 2000,
        };
      }
      this.io.to(roomId).emit('game_update', {
        gameState: room.gameState,
        currentTurn: room.gameState.currentTurn,
      });
      console.log(
        `[SnakesAndLadders] ${currentPlayer.name} rolled ${diceRoll} in room ${roomId}`,
      );
    }, 1000);
  }

  handleReset(socket, {roomId}) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.gameState = this.initializeGameState(
      room.gameState.players[0].name,
      room.gameState.players[0].id,
      room.gameState.players.slice(1),
    );
    this.io.to(roomId).emit('game_reset', {
      gameState: room.gameState,
      currentTurn: room.gameState.currentTurn,
    });
    console.log(`[SnakesAndLadders] Room ${roomId} reset`);
  }

  handleDisconnect(socket) {
    this.activeConnections.delete(socket.id);
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        room.gameState.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          console.log(
            `[SnakesAndLadders] Room ${roomId} deleted due to all players disconnecting`,
          );
        } else {
          room.gameState.message = {
            text: 'A player has disconnected',
            type: 'warning',
            timeout: 3000,
          };
          if (
            playerIndex <= room.gameState.currentTurn &&
            room.gameState.currentTurn > 0
          ) {
            room.gameState.currentTurn--;
          }
          this.io.to(roomId).emit('player_disconnected', {
            gameState: room.gameState,
            currentTurn: room.gameState.currentTurn,
            message: 'A player has disconnected',
          });
          console.log(
            `[SnakesAndLadders] Player ${socket.id} disconnected from room ${roomId}`,
          );
        }
        break;
      }
    }
  }

  initializeGameState(firstPlayerName, firstPlayerId, additionalPlayers = []) {
    const players = [
      {
        id: firstPlayerId,
        name: firstPlayerName || 'Player 1',
        color: playerColors[0],
        position: 1,
        avatar: playerAvatars[0],
      },
      ...additionalPlayers.map((player, index) => ({
        id: player.id,
        name: player.name,
        color: playerColors[index + 1],
        position: 1,
        avatar: playerAvatars[index + 1],
      })),
    ];
    return {
      players,
      currentTurn: 0,
      diceRoll: null,
      isRolling: false,
      winner: null,
      board: boardSquares,
      message: {
        text: 'Game started! Roll the dice to begin.',
        type: 'info',
        timeout: 3000,
      },
    };
  }
}

module.exports = SnakesAndLadders;
