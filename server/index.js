const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Game controllers
const TowerOfHanoi = require('./controllers/TowerOfHanoi');
const SnakesAndLadders = require('./controllers/SnakesAndLadders');
const MegaTicTacToe = require('./controllers/MegaTicTacToe');
const MathSudoku = require('./controllers/MathSudoku');
const CheckersController = require('./controllers/Checkers');
const Ludo = require('./controllers/Ludo');
const Sudoku = require('./controllers/Sudoku');
const LetterQuest = require('./controllers/LetterQuest');

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
  allowEIO3: true,
});

// Initialize game controllers
const towerOfHanoi = new TowerOfHanoi(io);
const snakesAndLadders = new SnakesAndLadders(io);
const megaTicTacToe = new MegaTicTacToe(io);
const mathSudoku = new MathSudoku(io);
const checkers = new CheckersController(io);
const ludo = new Ludo(io);
const sudoku = new Sudoku(io);
const letterQuest = new LetterQuest(io);

// Error handling
io.engine.on('connection_error', (err) => {
  console.error(`[SERVER] Connection error:`, err.req, err.code, err.message, err.context);
});

// Routes
app.get('/', (req, res) => {
  res.send('Game Server is running');
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`[CONNECT] Socket ${socket.id} connected from ${socket.handshake.address}`);

  // Verify connection
  socket.emit('connection_verified', {
    status: 'authenticated',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });
  console.log(`[EMIT] connection_verified sent to ${socket.id}`);

  // Error handlers
  socket.on('error', (error) => {
    console.error(`[SOCKET ERROR] ${socket.id}:`, error);
  });

  socket.on('connect_timeout', () => {
    console.warn(`[CONNECT TIMEOUT] Socket ${socket.id}`);
    socket.emit('connectionError', { message: 'Connection timed out' });
    console.log(`[EMIT] connectionError sent to ${socket.id} for timeout`);
  });

  // Game room creation
  socket.on('createRoom', (data, callback = () => {}) => {
    try {
      console.log('[CREATE ROOM RAW] Received raw data:', data);
      const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
      const { game, playerName, size, level, color, difficulty, numDisks, letters, tries } = 
        typeof eventData === 'object' ? eventData : {};

      if (!game || !playerName) {
        const errorMsg = 'game and playerName are required';
        console.error(`[CREATE ROOM ERROR] ${errorMsg} for socket ${socket.id}`);
        socket.emit('error', { message: errorMsg });
        return callback({ error: errorMsg });
      }

      console.log(`[CREATE ROOM] Socket ${socket.id} creating ${game} room as ${playerName}`);

      // Game-specific room creation
      const gameHandlers = {
        TowerOfHanoi: () => towerOfHanoi.createRoom(socket, { numDisks: numDisks || 3, playerName }, callback),
        SnakesAndLadders: () => snakesAndLadders.createRoom(socket, {}, playerName, callback),
        MegaTicTacToe: () => megaTicTacToe.createRoom(socket, { playerName }, callback),
        MathSudoku: () => mathSudoku.createRoom(
          socket, 
          { roomId: uuidv4(), size: size || 9, level: level || 'medium', playerName }, 
          callback
        ),
        Checkers: () => checkers.createRoom(
          socket, 
          { size: size || 8, difficulty: level || 'medium', playerName, color: color || 'red' }, 
          callback
        ),
        Ludo: () => ludo.createRoom(socket, { playerName }, callback),
        Sudoku: () => sudoku.createRoom(socket, { playerName, difficulty: difficulty || 'Medium' }, callback),
        LetterQuest: () => letterQuest.createRoom(
          socket, 
          { playerName, letters: letters || 5, tries: tries || 6 }, 
          callback
        )
      };

      if (gameHandlers[game]) {
        gameHandlers[game]();
      } else {
        const errorMsg = `Unknown game: ${game}`;
        console.error(`[CREATE ROOM ERROR] ${errorMsg} for socket ${socket.id}`);
        socket.emit('error', { message: errorMsg });
        callback({ error: errorMsg });
      }
    } catch (error) {
      console.error(`[CREATE ROOM ERROR] Unexpected error for socket ${socket.id}:`, error);
      socket.emit('error', { message: 'Internal server error' });
      callback({ error: 'Internal server error' });
    }
  });

  // Game room joining
  socket.on('joinRoom', (data, callback = () => {}) => {
    try {
      console.log('[JOIN ROOM RAW] Received raw data:', data);
      const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
      const { roomId, playerName, game } = typeof eventData === 'object' ? eventData : {};

      if (!roomId || !playerName || !game) {
        const errorMsg = 'roomId, game, and playerName are required';
        console.error(`[JOIN ROOM ERROR] ${errorMsg} for socket ${socket.id}`);
        socket.emit('error', { message: errorMsg });
        return callback({ error: errorMsg });
      }

      console.log(`[JOIN ROOM] Socket ${socket.id} joining ${game} room ${roomId} as ${playerName}`);

      // Game-specific room joining
      const gameHandlers = {
        TowerOfHanoi: () => towerOfHanoi.joinRoom(socket, { roomId, playerName }, callback),
        SnakesAndLadders: () => snakesAndLadders.joinRoom(socket, roomId, playerName, callback),
        MegaTicTacToe: () => megaTicTacToe.joinRoom(socket, { roomId, playerName }, callback),
        MathSudoku: () => mathSudoku.joinRoom(socket, { roomId, playerName }, callback),
        Checkers: () => checkers.joinRoom(socket, { roomId, playerName }, callback),
        Ludo: () => ludo.joinRoom(socket, roomId, playerName, callback),
        Sudoku: () => sudoku.joinRoom(socket, roomId, playerName, callback),
        LetterQuest: () => letterQuest.joinRoom(socket, roomId, playerName, callback)
      };

      if (gameHandlers[game]) {
        gameHandlers[game]();
      } else {
        const errorMsg = `Unknown game: ${game}`;
        console.error(`[JOIN ROOM ERROR] ${errorMsg} for socket ${socket.id}`);
        socket.emit('error', { message: errorMsg });
        callback({ error: errorMsg });
      }
    } catch (error) {
      console.error(`[JOIN ROOM ERROR] Unexpected error for socket ${socket.id}:`, error);
      socket.emit('error', { message: 'Internal server error' });
      callback({ error: 'Internal server error' });
    }
  });

  // Other game event handlers (makeMove, rollDice, resetGame, etc.)
  // ... [rest of your existing event handlers]

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Socket ${socket.id} disconnected`);
    
    // Notify all game controllers about disconnection
    const controllers = [
      towerOfHanoi, snakesAndLadders, megaTicTacToe, 
      mathSudoku, checkers, ludo, sudoku, letterQuest
    ];
    
    controllers.forEach(controller => {
      if (controller.handleDisconnect) {
        controller.handleDisconnect(socket);
      }
    });
    
    console.log(`[DISCONNECT] Handled disconnect for ${socket.id} across all games`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});