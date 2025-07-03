class MegaTicTacToe {
    constructor(io) {
      this.io = io;
      this.rooms = new Map();
      this.activeConnections = new Map();
  
      io.on('connection', (socket) => {
        // Prevent duplicate connections
        if (this.activeConnections.has(socket.id)) {
          socket.disconnect(true);
          return;
        }
  
        this.activeConnections.set(socket.id, {
          ip: socket.handshake.address,
          connectedAt: new Date(),
        });
  
        console.log(`[SERVER] New connection: ${socket.id} from ${socket.handshake.address}`);
  
        // Note: index.js already emits 'connection_ack', so this might be redundant.
        // Consider aligning the event names (e.g., change to 'connection_ack' or update client to expect 'connection_verified')
      });
    }
  
    createRoom(socket, roomId, callback = () => {}) {
      try {
        if (this.rooms.has(roomId)) {
          callback({ error: 'Room already exists' });
          return;
        }
  
        const gameState = this.initializeGameState();
        this.rooms.set(roomId, {
          players: [socket.id],
          gameState,
          currentPlayer: 'X',
        });
  
        socket.join(roomId);
        console.log(`[SERVER] Room ${roomId} created by ${socket.id}`);
  
        callback({
          success: true,
          roomId,
          player: 'X',
          gameState,
        });
  
        socket.emit('game_start', {
          gameState,
          currentPlayer: 'X',
        });
      } catch (error) {
        callback({ error: error.message });
        console.error('[CREATE ROOM ERROR]', error);
      }
    }
  
    joinRoom(socket, roomId, callback = () => {}) {
      try {
        const room = this.rooms.get(roomId);
  
        if (!room) {
          callback({ error: 'Room does not exist' });
          return;
        }
        if (room.players.length >= 2) {
          callback({ error: 'Room is full' });
          return;
        }
  
        room.players.push(socket.id);
        socket.join(roomId);
        console.log(`[SERVER] Player ${socket.id} joined room ${roomId}`);
  
        callback({
          success: true,
          roomId,
          player: 'O',
          gameState: room.gameState,
        });
  
        this.io.to(roomId).emit('game_start', {
          gameState: room.gameState,
          currentPlayer: room.currentPlayer,
        });
      } catch (error) {
        callback({ error: error.message });
        console.error('[JOIN ROOM ERROR]', error);
      }
    }
  
    handleMove(socket, { roomId, boardIndex, cellIndex }) {
      const room = this.rooms.get(roomId);
      if (
        !room ||
        room.gameState.gameOver ||
        room.currentPlayer !== (room.players[0] === socket.id ? 'X' : 'O')
      ) {
        socket.emit('moveError', { message: 'Invalid move' });
        return;
      }
  
      const { gameState } = room;
      if (gameState.board[boardIndex][cellIndex] || gameState.boardWinners[boardIndex]) {
        socket.emit('moveError', { message: 'Cell already taken or board won' });
        return;
      }
  
      // Update board
      gameState.board[boardIndex][cellIndex] = room.currentPlayer;
  
      // Check for small board win
      const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6], // Diagonals
      ];
  
      const smallBoard = gameState.board[boardIndex];
      let smallWinner = null;
      for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (smallBoard[a] && smallBoard[a] === smallBoard[b] && smallBoard[a] === smallBoard[c]) {
          smallWinner = smallBoard[a];
          break;
        }
      }
      if (smallWinner) {
        gameState.boardWinners[boardIndex] = smallWinner;
      }
  
      // Check for mega win
      let megaWinner = null;
      let winningPattern = null;
      for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (
          gameState.boardWinners[a] &&
          gameState.boardWinners[a] === gameState.boardWinners[b] &&
          gameState.boardWinners[a] === gameState.boardWinners[c]
        ) {
          megaWinner = gameState.boardWinners[a];
          winningPattern = pattern;
          break;
        }
      }
  
      if (megaWinner) {
        gameState.gameOver = true;
        gameState.megaWinner = megaWinner;
        gameState.winningPattern = winningPattern;
      } else if (
        gameState.board.every(
          (small, index) => gameState.boardWinners[index] || small.every(cell => cell !== null)
        )
      ) {
        gameState.gameOver = true;
      }
  
      // Determine next grid
      let nextGrid = cellIndex;
      const isNextGridFull = gameState.board[nextGrid].every(cell => cell !== null);
      if (gameState.boardWinners[nextGrid] || isNextGridFull) {
        nextGrid = null;
      }
      gameState.currentGrid = nextGrid;
      room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
  
      // Broadcast updated game state
      this.io.to(roomId).emit('gameUpdate', {
        gameState,
        currentPlayer: room.currentPlayer,
      });
  
      console.log(`[MOVE] Move made in room ${roomId}: ${boardIndex}, ${cellIndex}`);
    }
  
    handleRestart(socket, { roomId }) {
      const room = this.rooms.get(roomId);
      if (!room) return;
  
      room.gameState = this.initializeGameState();
      room.currentPlayer = 'X';
  
      this.io.to(roomId).emit('gameRestarted', {
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
      });
  
      console.log(`[RESTART] Room ${roomId} restarted`);
    }
  
    handleDisconnect(socket) {
      this.activeConnections.delete(socket.id);
      for (const [roomId, room] of this.rooms.entries()) {
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            this.rooms.delete(roomId);
            console.log(`[ROOM DELETED] Room ${roomId} deleted due to all players disconnecting`);
          } else {
            this.io.to(roomId).emit('playerDisconnected', {
              message: 'Opponent disconnected',
            });
            console.log(`[DISCONNECT] Player ${socket.id} disconnected from room ${roomId}`);
          }
          break;
        }
      }
    }
  
    initializeGameState() {
      return {
        board: Array(9).fill(null).map(() => Array(9).fill(null)),
        boardWinners: Array(9).fill(null),
        currentGrid: null,
        currentPlayer: 'X',
        gameOver: false,
        megaWinner: null,
        winningPattern: null,
      };
    }
  }
  
  module.exports = MegaTicTacToe;