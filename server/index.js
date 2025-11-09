const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
// const { v4: uuidv4 } = require('uuid'); // <-- REMOVED (no longer needed here)
const TowerOfHanoi = require('./controllers/TowerOfHanoi');
const SnakesAndLadders = require('./controllers/SnakesAndLadders');
const MegaTicTacToe = require('./controllers/MegaTicTacToe');
const MathSudoku = require('./controllers/MathSudoku');
const CheckersController = require('./controllers/Checkers');
const Ludo = require('./controllers/Ludo');

const app = express();
const server = http.createServer(app);
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

io.engine.on('connection_error', err => {
  console.log(
    `[SERVER] Connection error:`,
    err.req,
    err.code,
    err.message,
    err.context,
  );
});

const towerOfHanoi = new TowerOfHanoi(io);
const snakesAndLadders = new SnakesAndLadders(io);
const megaTicTacToe = new MegaTicTacToe(io);
const mathSudoku = new MathSudoku(io);
const checkers = new CheckersController(io);
const ludo = new Ludo(io);

app.get('/', (req, res) => {
  res.send('Hi');
});

io.on('connection', socket => {
  console.log(
    `[CONNECT] Socket ${socket.id} connected from ${socket.handshake.address}`,
  );

  socket.emit('connection_verified', {
    status: 'authenticated',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });
  console.log(`[EMIT] connection_verified sent to ${socket.id}`);

  socket.on('error', error => {
    console.error(`[SOCKET ERROR] ${socket.id}:`, error);
  });

  socket.conn.on('upgrade', transport => {
    console.log(`[UPGRADE] ${socket.id} upgraded to ${transport.name}`);
  });

  socket.on('connect_timeout', () => {
    console.warn(`[CONNECT TIMEOUT] Socket ${socket.id}`);
    socket.emit('connectionError', {message: 'Connection timed out'});
    console.log(`[EMIT] connectionError sent to ${socket.id} for timeout`);
  });

  socket.on('createRoom', (data, callback = () => {}) => {
    console.log('[CREATE ROOM RAW] Received raw data:', data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { game, playerName, size, level, color, difficulty, numDisks, roomId } = typeof eventData === 'object' ? eventData : {};

    if (!game || !playerName) {
      console.error(`[CREATE ROOM ERROR] Missing required parameters for socket ${socket.id}`);
      socket.emit('error', { message: 'game and playerName are required' });
      callback({ error: 'game and playerName are required' });
      return;
    }

    console.log(`[CREATE ROOM] Socket ${socket.id} attempting to create room for game ${game} as ${playerName}`);

    if (game === 'TowerOfHanoi') {
      towerOfHanoi.createRoom(socket, { numDisks: numDisks || 3, playerName }, (response) => {
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for TowerOfHanoi by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in TowerOfHanoi:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'SnakesAndLadders') {
      snakesAndLadders.createRoom(socket, { roomId: roomId || '', playerName }, playerName, (response) => {
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for SnakesAndLadders by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in SnakesAndLadders:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'MegaTicTacToe') {
      megaTicTacToe.createRoom(socket, { roomId: roomId || '', playerName }, (response) => {
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for MegaTicTacToe by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in MegaTicTacToe:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'MathSudoku') {
      // --- FIX: Generate 6-char ID ---
      const newRoomId = roomId || Math.random().toString(36).substring(2, 8).toUpperCase();
      mathSudoku.createRoom(socket, { roomId: newRoomId, size: size || 4, level: level || 'medium', playerName }, (response) => {
      // --- END FIX ---
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for MathSudoku by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in MathSudoku:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'Checkers') {
      // This line is now correct and matches your log
      checkers.createRoom(socket, {roomId, size: size || 8, difficulty: level || 'medium', playerName, color: color || 'red' }, (response) => {
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for Checkers by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in Checkers:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'Ludo') {
      ludo.createRoom(socket, { roomId: roomId || '', playerName }, (response) => {
        if (response.success) {
          console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for Ludo by ${playerName}`);
        } else {
          console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in Ludo:`, response.error);
        }
        callback(response);
      });
    } else {
      console.error(`[CREATE ROOM ERROR] Unknown game: ${game} for socket ${socket.id}`);
      socket.emit('error', { message: `Unknown game: ${game}` });
      callback({ error: `Unknown game: ${game}` });
    }
  });

  socket.on('joinRoom', (data, callback = () => {}) => {
    console.log('[JOIN ROOM RAW] Received raw data:', data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, playerName, game } = typeof eventData === 'object' ? eventData : {};

    if (!roomId || !playerName || !game) {
      console.error(`[JOIN ROOM ERROR] Missing required parameters for socket ${socket.id}`);
      socket.emit('error', { message: 'roomId, game, and playerName are required' });
      callback({ error: 'roomId, game, and playerName are required' });
      return;
    }

    console.log(`[JOIN ROOM] Socket ${socket.id} attempting to join room ${roomId} for game ${game} as ${playerName}`);

    if (game === 'TowerOfHanoi') {
      towerOfHanoi.joinRoom(socket, { roomId, playerName }, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for TowerOfHanoi as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'SnakesAndLadders') {
      snakesAndLadders.joinRoom(socket, roomId, playerName, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for SnakesAndLadders as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'MegaTicTacToe') {
      megaTicTacToe.joinRoom(socket, roomId, playerName, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for MegaTicTacToe as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'MathSudoku') {
      mathSudoku.joinRoom(socket, { roomId, playerName }, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for MathSudoku as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'Checkers') {
      checkers.joinRoom(socket, { roomId, playerName }, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for Checkers as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else if (game === 'Ludo') {
      ludo.joinRoom(socket, roomId, playerName, (response) => {
        if (response.success) {
          console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for Ludo as ${playerName}`);
        } else {
          console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
        }
        callback(response);
      });
    } else {
      console.error(`[JOIN ROOM ERROR] Unknown game: ${game} for socket ${socket.id}`);
      socket.emit('error', { message: `Unknown game: ${game}` });
      callback({ error: `Unknown game: ${game}` });
    }
  });

  socket.on('makeMove', (data, callback = () => {}) => {
    console.log(`[MAKE MOVE] Socket ${socket.id} making move in room ${data.roomId || (Array.isArray(data) && data[1]?.roomId)}:`, data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, ...moveData } = typeof eventData === 'object' ? eventData : {};

    if (!roomId) {
      console.error(`[MAKE MOVE ERROR] Missing roomId for socket ${socket.id}`);
      socket.emit('error', { message: 'roomId is required' });
      callback({ error: 'roomId is required' });
      return;
    }

    console.log(`[MAKE MOVE] Socket ${socket.id} making move in room ${roomId}:`, moveData);
    const { game } = moveData;
    if (game === 'TowerOfHanoi') {
      const { fromTower, toTower } = moveData;
      if (fromTower === undefined || toTower === undefined) {
        console.error(`[MAKE MOVE ERROR] Missing fromTower or toTower for socket ${socket.id} in room ${roomId}`);
        socket.emit('error', { message: 'fromTower and toTower are required' });
        callback({ error: 'fromTower and toTower are required' });
        return;
      }
      towerOfHanoi.handleMove(socket, { roomId, fromTower, toTower }, (response) => {
        console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, response);
        if (response.error) {
          socket.emit('moveError', { message: response.error });
        } else if (response.success) {
          socket.emit('update game', { gameState: response.gameState, currentPlayer: response.currentPlayer });
        }
        callback(response);
      });
    } else if (game === 'MegaTicTacToe') {
      const { boardIndex, cellIndex } = moveData;
      if (boardIndex === undefined || cellIndex === undefined) {
        console.error(`[MAKE MOVE ERROR] Missing boardIndex or cellIndex for socket ${socket.id} in room ${roomId}`);
        socket.emit('error', { message: 'boardIndex and cellIndex are required' });
        callback({ error: 'boardIndex and cellIndex are required' });
        return;
      }
      megaTicTacToe.handleMove(socket, { roomId, boardIndex, cellIndex }, (result) => {
        console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, result);
        if (result.error) {
          socket.emit('moveError', { message: result.error });
        } else if (result.success) {
          socket.emit('gameUpdate', { gameState: result.gameState, currentPlayer: result.currentPlayer });
        }
        callback(result);
      });
    } else if (game === 'MathSudoku') {
      const { row, col, num } = moveData;
      mathSudoku.handleMove(socket, { roomId, row, col, num }, callback);

    // *** THIS IS THE FIX ***
    } else if (game === 'Checkers') {
      const { move } = moveData; // 1. Get the 'move' object from the data
      if (!move) {
        console.error(`[MAKE MOVE ERROR] Missing 'move' object for Checkers in room ${roomId}`);
        callback({ error: "Missing 'move' object" });
        return;
      }
      // 2. Call 'makeMove' (which exists in Checkers.js)
      // 3. Pass the 'move' object to it
      checkers.makeMove(socket, { roomId, move }, callback);
    // *** END OF FIX ***

    } else if (game === 'Ludo') {
      const { pieceId } = moveData;
      if (pieceId === undefined) {
        console.error(`[MAKE MOVE ERROR] Missing pieceId for socket ${socket.id} in room ${roomId}`);
        socket.emit('error', { message: 'pieceId is required' });
        callback({ error: 'pieceId is required' });
        return;
      }
      ludo.handleMovePiece(socket, { roomId, pieceId }, (response) => {
        console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, response);
        if (response.error) {
          socket.emit('moveError', { message: response.error });
        } else if (response.success) {
          socket.emit('gameUpdate', { gameState: response.gameState, currentPlayer: response.currentPlayer });
        }
        callback(response);
      });
    } else {
      console.error(`[MAKE MOVE ERROR] Unknown game for move in room ${roomId}`);
      socket.emit('error', { message: `Unknown game for move` });
      callback({ error: `Unknown game for move` });
    }
  });

  socket.on('rollDice', (data, callback = () => {}) => {
    console.log('[ROLL DICE RAW] Received raw data:', data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, game } = typeof eventData === 'object' ? eventData : {};
    console.log(`[ROLL DICE] Socket ${socket.id} rolling dice in room ${roomId}`);
    if (!roomId || !game) {
      console.error(`[ROLL DICE ERROR] Missing roomId or game for socket ${socket.id}`);
      socket.emit('error', { message: 'roomId and game are required' });
      callback({ error: 'roomId and game are required' });
      return;
    }
    if (game === 'SnakesAndLadders') {
      snakesAndLadders.handleRollDice(socket, { roomId }, callback);
    } else if (game === 'Ludo') {
      ludo.handleRollDice(socket, { roomId }, callback);
    } else {
      console.error(`[ROLL DICE ERROR] Dice rolling not supported for game ${game} in room ${roomId}`);
      socket.emit('error', { message: `Dice rolling not supported for ${game}` });
      callback({ error: `Dice rolling not supported for ${game}` });
    }
  });

  socket.on('resetGame', (data, callback = () => {}) => {
    console.log(`[RESET GAME] Socket ${socket.id} resetting game in room ${data.roomId}:`, data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, game } = typeof eventData === 'object' ? eventData : {};
    if (!roomId || !game) {
      console.error(
        `[RESET GAME ERROR] Missing required parameters for socket ${socket.id}`,
      );
      socket.emit('error', {message: 'roomId and game are required'});
      callback({error: 'roomId and game are required'});
      return;
    }
    if (game === 'TowerOfHanoi') {
      towerOfHanoi.handleRestart(socket, { roomId }, callback);
    } else if (game === 'SnakesAndLadders') {
      snakesAndLadders.handleReset(socket, {roomId}, callback);
    } else if (game === 'MegaTicTacToe') {
      megaTicTacToe.handleRestart(socket, {roomId}, callback);
    } else if (game === 'MathSudoku') {
      // Note: MathSudoku doesn't have a direct reset; this is a placeholder
      mathSudoku.handleMove(socket, {roomId, row: 0, col: 0, num: 0}, callback); // Adjust as needed
    } else if (game === 'Checkers') {
      checkers.handleRematch(socket, { roomId }, callback);
    } else if (game === 'Ludo') {
      ludo.handleRestart(socket, { roomId }, callback);
    } else {
      console.error(
        `[RESET GAME ERROR] Unknown game: ${game} for socket ${socket.id}`,
      );
      socket.emit('error', {message: `Unknown game: ${game}`});
      callback({error: `Unknown game: ${game}`});
    }
  });

  socket.on('undoMove', (data, callback = () => {}) => {
    console.log(`[UNDO MOVE] Socket ${socket.id} undoing move in room ${data.roomId}:`, data);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, game } = typeof eventData === 'object' ? eventData : {};
    if (!roomId || !game) {
      console.error(`[UNDO MOVE ERROR] Missing roomId or game for socket ${socket.id}`);
      socket.emit('error', { message: 'roomId and game are required' });
      callback({ error: 'roomId and game are required' });
      return;
    }
    if (game === 'TowerOfHanoi') {
      towerOfHanoi.handleUndo(socket, { roomId }, callback);
    } else {
      console.error(
        `[UNDO MOVE ERROR] Undo not supported for game ${game} in room ${roomId}`,
      );
      socket.emit('error', {message: `Undo not supported for ${game}`});
      callback({error: `Undo not supported for ${game}`});
    }
  });

  socket.on('selectPiece', (data, callback = () => {}) => {
    console.log(`[SELECT PIECE] Socket ${socket.id} selecting piece at [${data.row},${data.col}] in room ${data.roomId}`);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, row, col } = typeof eventData === 'object' ? eventData : {};
    if (!roomId) {
      console.error(
        `[SELECT PIECE ERROR] Missing roomId for socket ${socket.id}`,
      );
      socket.emit('error', {message: 'roomId is required'});
      callback({error: 'roomId is required'});
      return;
    }
    checkers.handleSelectPiece(socket, {roomId, row, col}, callback);
  });

  socket.on('hintRequest', (data, callback = () => {}) => {
    console.log(`[HINT REQUEST] Socket ${socket.id} requesting hint in room ${data.roomId}`);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;

    // --- FIX 3: ADDED GAME ROUTING ---
    const { roomId, game } = typeof eventData === 'object' ? eventData : {};

    if (!roomId || !game) {
      console.error(
        `[HINT REQUEST ERROR] Missing roomId or game for socket ${socket.id}`,
      );
      socket.emit('error', {message: 'roomId and game are required'});
      callback({error: 'roomId and game are required'});
      return;
    }

    if (game === 'MathSudoku') {
      mathSudoku.handleHint(socket, {roomId}, callback);
    } else {
      console.error(`[HINT REQUEST ERROR] Hint request not supported for ${game}`);
      callback({ error: `Hint request not supported for ${game}`});
    }
    // --- END OF FIX 3 ---
  });

  socket.on('surrender', (data, callback = () => {}) => {
    console.log(`[SURRENDER] Socket ${socket.id} surrendering in room ${data.roomId}`);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId } = typeof eventData === 'object' ? eventData : {};
    if (!roomId) {
      console.error(`[SURRENDER ERROR] Missing roomId for socket ${socket.id}`);
      socket.emit('error', {message: 'roomId is required'});
      callback({error: 'roomId is required'});
      return;
    }
    checkers.handleSurrender(socket, {roomId}, callback);
  });

  socket.on('reconnect', (data, callback = () => {}) => {
    console.log(`[RECONNECT] Socket ${socket.id} reconnecting to room ${data.roomId} as ${data.playerId}`);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, playerId } = typeof eventData === 'object' ? eventData : {};
    if (!roomId || !playerId) {
      console.error(
        `[RECONNECT ERROR] Missing roomId or playerId for socket ${socket.id}`,
      );
      socket.emit('error', {message: 'roomId and playerId are required'});
      callback({error: 'roomId and playerId are required'});
      return;
    }
    towerOfHanoi.handleReconnect(socket, { roomId, playerId }, callback);
  });

  socket.on('leaveGame', (data, callback = () => {}) => {
    console.log(`[LEAVE GAME] Socket ${socket.id} leaving room ${data.roomId} as ${data.playerId}`);
    // Handle both array-wrapped and direct object data
    const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    const { roomId, playerId } = typeof eventData === 'object' ? eventData : {};
    if (!roomId || !playerId) {
      console.error(
        `[LEAVE GAME ERROR] Missing roomId or playerId for socket ${socket.id}`,
      );
      socket.emit('error', {message: 'roomId and playerId are required'});
      callback({error: 'roomId and playerId are required'});
      return;
    }
    towerOfHanoi.handleLeaveGame(socket, { roomId, playerId }, callback);
  });

  // Disconnect handling for all games
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Socket ${socket.id} disconnected`);
    towerOfHanoi.handleDisconnect(socket);
    snakesAndLadders.handleDisconnect(socket);
    megaTicTacToe.handleDisconnect(socket);
    mathSudoku.handleDisconnect(socket);
    checkers.handleDisconnect(socket);
    ludo.handleDisconnect(socket);
    console.log(`[DISCONNECT] Handled disconnect for ${socket.id} across all games`);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT} at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`,
  );
});
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const TowerOfHanoi = require('./controllers/TowerOfHanoi');
// const SnakesAndLadders = require('./controllers/SnakesAndLadders');
// const MegaTicTacToe = require('./controllers/MegaTicTacToe');
// const MathSudoku = require('./controllers/MathSudoku');
// const CheckersController = require('./controllers/Checkers');
// const Ludo = require('./controllers/Ludo');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
//   pingTimeout: 60000,
//   pingInterval: 25000,
//   cookie: false,
//   allowEIO3: true,
// });

// io.engine.on('connection_error', err => {
//   console.log(
//     `[SERVER] Connection error:`,
//     err.req,
//     err.code,
//     err.message,
//     err.context,
//   );
// });

// const towerOfHanoi = new TowerOfHanoi(io);
// const snakesAndLadders = new SnakesAndLadders(io);
// const megaTicTacToe = new MegaTicTacToe(io);
// const mathSudoku = new MathSudoku(io);
// const checkers = new CheckersController(io);
// const ludo = new Ludo(io);

// app.get('/', (req, res) => {
//   res.send('Hi');
// });

// io.on('connection', socket => {
//   console.log(
//     `[CONNECT] Socket ${socket.id} connected from ${socket.handshake.address}`,
//   );

//   socket.emit('connection_verified', {
//     status: 'authenticated',
//     socketId: socket.id,
//     timestamp: new Date().toISOString(),
//   });
//   console.log(`[EMIT] connection_verified sent to ${socket.id}`);

//   socket.on('error', error => {
//     console.error(`[SOCKET ERROR] ${socket.id}:`, error);
//   });

//   socket.conn.on('upgrade', transport => {
//     console.log(`[UPGRADE] ${socket.id} upgraded to ${transport.name}`);
//   });

//   socket.on('connect_timeout', () => {
//     console.warn(`[CONNECT TIMEOUT] Socket ${socket.id}`);
//     socket.emit('connectionError', {message: 'Connection timed out'});
//     console.log(`[EMIT] connectionError sent to ${socket.id} for timeout`);
//   });

//   socket.on('createRoom', (data, callback = () => {}) => {
//     console.log('[CREATE ROOM RAW] Received raw data:', data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
    

//     //previous
//     const { game, playerName, size, level, color, difficulty, numDisks, roomId } = typeof eventData === 'object' ? eventData : {};

//     if (!game || !playerName) {
//       console.error(`[CREATE ROOM ERROR] Missing required parameters for socket ${socket.id}`);
//       socket.emit('error', { message: 'game and playerName are required' });
//       callback({ error: 'game and playerName are required' });
//       return;
//     }

//     console.log(`[CREATE ROOM] Socket ${socket.id} attempting to create room for game ${game} as ${playerName}`);

//     if (game === 'TowerOfHanoi') {
//       towerOfHanoi.createRoom(socket, { numDisks: numDisks || 3, playerName }, (response) => {
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for TowerOfHanoi by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in TowerOfHanoi:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'SnakesAndLadders') {

//       //previous
//      // snakesAndLadders.createRoom(socket, { roomId: '', playerName }, playerName, (response) => {
//           snakesAndLadders.createRoom(socket, { roomId: roomId || '', playerName }, playerName, (response) => {
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for SnakesAndLadders by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in SnakesAndLadders:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'MegaTicTacToe') {
//       megaTicTacToe.createRoom(socket, { roomId: roomId || '', playerName }, (response) => {
        
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for MegaTicTacToe by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in MegaTicTacToe:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'MathSudoku') {
//       // mathSudoku.createRoom(socket, { roomId: uuidv4(), size: size || 9, level: level || 'medium', playerName }, (response) => {
//          mathSudoku.createRoom(socket, { roomId: roomId || uuidv4(), size: size || 9, level: level || 'medium', playerName }, (response) => {
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for MathSudoku by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in MathSudoku:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'Checkers') {
//       checkers.createRoom(socket, { size: size || 8, difficulty: level || 'medium', playerName, color: color || 'red' }, (response) => {
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for Checkers by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in Checkers:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'Ludo') {
//       // ludo.createRoom(socket, { roomId: '', playerName }, (response) => {
//         ludo.createRoom(socket, { roomId: roomId || '', playerName }, (response) => {
//         if (response.success) {
//           console.log(`[CREATE ROOM SUCCESS] Room ${response.roomId} created for Ludo by ${playerName}`);
//         } else {
//           console.log(`[CREATE ROOM FAILURE] Failed for ${playerName} in Ludo:`, response.error);
//         }
//         callback(response);
//       });
//     } else {
//       console.error(`[CREATE ROOM ERROR] Unknown game: ${game} for socket ${socket.id}`);
//       socket.emit('error', { message: `Unknown game: ${game}` });
//       callback({ error: `Unknown game: ${game}` });
//     }
//   });

//   socket.on('joinRoom', (data, callback = () => {}) => {
//     console.log('[JOIN ROOM RAW] Received raw data:', data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, playerName, game } = typeof eventData === 'object' ? eventData : {};

//     if (!roomId || !playerName || !game) {
//       console.error(`[JOIN ROOM ERROR] Missing required parameters for socket ${socket.id}`);
//       socket.emit('error', { message: 'roomId, game, and playerName are required' });
//       callback({ error: 'roomId, game, and playerName are required' });
//       return;
//     }

//     console.log(`[JOIN ROOM] Socket ${socket.id} attempting to join room ${roomId} for game ${game} as ${playerName}`);

//     if (game === 'TowerOfHanoi') {
//       towerOfHanoi.joinRoom(socket, { roomId, playerName }, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for TowerOfHanoi as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'SnakesAndLadders') {
//       snakesAndLadders.joinRoom(socket, roomId, playerName, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for SnakesAndLadders as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'MegaTicTacToe') {
//       megaTicTacToe.joinRoom(socket, roomId, playerName, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for MegaTicTacToe as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'MathSudoku') {
//       mathSudoku.joinRoom(socket, { roomId, playerName }, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for MathSudoku as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'Checkers') {
//       checkers.joinRoom(socket, { roomId, playerName }, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for Checkers as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else if (game === 'Ludo') {
//       ludo.joinRoom(socket, roomId, playerName, (response) => {
//         if (response.success) {
//           console.log(`[JOIN ROOM SUCCESS] Socket ${socket.id} joined room ${roomId} for Ludo as ${playerName}`);
//         } else {
//           console.log(`[JOIN ROOM FAILURE] Failed for ${playerName} in room ${roomId}:`, response.error);
//         }
//         callback(response);
//       });
//     } else {
//       console.error(`[JOIN ROOM ERROR] Unknown game: ${game} for socket ${socket.id}`);
//       socket.emit('error', { message: `Unknown game: ${game}` });
//       callback({ error: `Unknown game: ${game}` });
//     }
//   });

//   socket.on('makeMove', (data, callback = () => {}) => {
//     console.log(`[MAKE MOVE] Socket ${socket.id} making move in room ${data.roomId || (Array.isArray(data) && data[1]?.roomId)}:`, data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, ...moveData } = typeof eventData === 'object' ? eventData : {};

//     if (!roomId) {
//       console.error(`[MAKE MOVE ERROR] Missing roomId for socket ${socket.id}`);
//       socket.emit('error', { message: 'roomId is required' });
//       callback({ error: 'roomId is required' });
//       return;
//     }

//     console.log(`[MAKE MOVE] Socket ${socket.id} making move in room ${roomId}:`, moveData);
//     const { game } = moveData;
//     if (game === 'TowerOfHanoi') {
//       const { fromTower, toTower } = moveData;
//       if (fromTower === undefined || toTower === undefined) {
//         console.error(`[MAKE MOVE ERROR] Missing fromTower or toTower for socket ${socket.id} in room ${roomId}`);
//         socket.emit('error', { message: 'fromTower and toTower are required' });
//         callback({ error: 'fromTower and toTower are required' });
//         return;
//       }
//       towerOfHanoi.handleMove(socket, { roomId, fromTower, toTower }, (response) => {
//         console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, response);
//         if (response.error) {
//           socket.emit('moveError', { message: response.error });
//         } else if (response.success) {
//           socket.emit('update game', { gameState: response.gameState, currentPlayer: response.currentPlayer });
//         }
//         callback(response);
//       });
//     } else if (game === 'MegaTicTacToe') {
//       const { boardIndex, cellIndex } = moveData;
//       if (boardIndex === undefined || cellIndex === undefined) {
//         console.error(`[MAKE MOVE ERROR] Missing boardIndex or cellIndex for socket ${socket.id} in room ${roomId}`);
//         socket.emit('error', { message: 'boardIndex and cellIndex are required' });
//         callback({ error: 'boardIndex and cellIndex are required' });
//         return;
//       }
//       megaTicTacToe.handleMove(socket, { roomId, boardIndex, cellIndex }, (result) => {
//         console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, result);
//         if (result.error) {
//           socket.emit('moveError', { message: result.error });
//         } else if (result.success) {
//           socket.emit('gameUpdate', { gameState: result.gameState, currentPlayer: result.currentPlayer });
//         }
//         callback(result);
//       });
//     } else if (game === 'MathSudoku') {
//       const { row, col, num } = moveData;
//       mathSudoku.handleMove(socket, { roomId, row, col, num }, callback);
//     } else if (game === 'Checkers') {
//       const { toRow, toCol } = moveData;
//       checkers.handleMove(socket, { roomId, toRow, toCol }, callback);
//     } else if (game === 'Ludo') {
//       const { pieceId } = moveData;
//       if (pieceId === undefined) {
//         console.error(`[MAKE MOVE ERROR] Missing pieceId for socket ${socket.id} in room ${roomId}`);
//         socket.emit('error', { message: 'pieceId is required' });
//         callback({ error: 'pieceId is required' });
//         return;
//       }
//       ludo.handleMovePiece(socket, { roomId, pieceId }, (response) => {
//         console.log(`[MAKE MOVE CALLBACK] Socket ${socket.id} in room ${roomId}:`, response);
//         if (response.error) {
//           socket.emit('moveError', { message: response.error });
//         } else if (response.success) {
//           socket.emit('gameUpdate', { gameState: response.gameState, currentPlayer: response.currentPlayer });
//         }
//         callback(response);
//       });
//     } else {
//       console.error(`[MAKE MOVE ERROR] Unknown game for move in room ${roomId}`);
//       socket.emit('error', { message: `Unknown game for move` });
//       callback({ error: `Unknown game for move` });
//     }
//   });

//   socket.on('rollDice', (data, callback = () => {}) => {
//     console.log('[ROLL DICE RAW] Received raw data:', data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, game } = typeof eventData === 'object' ? eventData : {};
//     console.log(`[ROLL DICE] Socket ${socket.id} rolling dice in room ${roomId}`);
//     if (!roomId || !game) {
//       console.error(`[ROLL DICE ERROR] Missing roomId or game for socket ${socket.id}`);
//       socket.emit('error', { message: 'roomId and game are required' });
//       callback({ error: 'roomId and game are required' });
//       return;
//     }
//     if (game === 'SnakesAndLadders') {
//       snakesAndLadders.handleRollDice(socket, { roomId }, callback);
//     } else if (game === 'Ludo') {
//       ludo.handleRollDice(socket, { roomId }, callback);
//     } else {
//       console.error(`[ROLL DICE ERROR] Dice rolling not supported for game ${game} in room ${roomId}`);
//       socket.emit('error', { message: `Dice rolling not supported for ${game}` });
//       callback({ error: `Dice rolling not supported for ${game}` });
//     }
//   });

//   socket.on('resetGame', (data, callback = () => {}) => {
//     console.log(`[RESET GAME] Socket ${socket.id} resetting game in room ${data.roomId}:`, data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, game } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId || !game) {
//       console.error(
//         `[RESET GAME ERROR] Missing required parameters for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: 'roomId and game are required'});
//       callback({error: 'roomId and game are required'});
//       return;
//     }
//     if (game === 'TowerOfHanoi') {
//       towerOfHanoi.handleRestart(socket, { roomId }, callback);
//     } else if (game === 'SnakesAndLadders') {
//       snakesAndLadders.handleReset(socket, {roomId}, callback);
//     } else if (game === 'MegaTicTacToe') {
//       megaTicTacToe.handleRestart(socket, {roomId}, callback);
//     } else if (game === 'MathSudoku') {
//       // Note: MathSudoku doesn't have a direct reset; this is a placeholder
//       mathSudoku.handleMove(socket, {roomId, row: 0, col: 0, num: 0}, callback); // Adjust as needed
//     } else if (game === 'Checkers') {
//       checkers.handleRematch(socket, { roomId }, callback);
//     } else if (game === 'Ludo') {
//       ludo.handleRestart(socket, { roomId }, callback);
//     } else {
//       console.error(
//         `[RESET GAME ERROR] Unknown game: ${game} for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: `Unknown game: ${game}`});
//       callback({error: `Unknown game: ${game}`});
//     }
//   });

//   socket.on('undoMove', (data, callback = () => {}) => {
//     console.log(`[UNDO MOVE] Socket ${socket.id} undoing move in room ${data.roomId}:`, data);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, game } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId || !game) {
//       console.error(`[UNDO MOVE ERROR] Missing roomId or game for socket ${socket.id}`);
//       socket.emit('error', { message: 'roomId and game are required' });
//       callback({ error: 'roomId and game are required' });
//       return;
//     }
//     if (game === 'TowerOfHanoi') {
//       towerOfHanoi.handleUndo(socket, { roomId }, callback);
//     } else {
//       console.error(
//         `[UNDO MOVE ERROR] Undo not supported for game ${game} in room ${roomId}`,
//       );
//       socket.emit('error', {message: `Undo not supported for ${game}`});
//       callback({error: `Undo not supported for ${game}`});
//     }
//   });

//   socket.on('selectPiece', (data, callback = () => {}) => {
//     console.log(`[SELECT PIECE] Socket ${socket.id} selecting piece at [${data.row},${data.col}] in room ${data.roomId}`);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, row, col } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId) {
//       console.error(
//         `[SELECT PIECE ERROR] Missing roomId for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: 'roomId is required'});
//       callback({error: 'roomId is required'});
//       return;
//     }
//     checkers.handleSelectPiece(socket, {roomId, row, col}, callback);
//   });

//   socket.on('hintRequest', (data, callback = () => {}) => {
//     console.log(`[HINT REQUEST] Socket ${socket.id} requesting hint in room ${data.roomId}`);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId) {
//       console.error(
//         `[HINT REQUEST ERROR] Missing roomId for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: 'roomId is required'});
//       callback({error: 'roomId is required'});
//       return;
//     }
//     mathSudoku.handleHint(socket, {roomId}, callback);
//   });

//   socket.on('surrender', (data, callback = () => {}) => {
//     console.log(`[SURRENDER] Socket ${socket.id} surrendering in room ${data.roomId}`);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId) {
//       console.error(`[SURRENDER ERROR] Missing roomId for socket ${socket.id}`);
//       socket.emit('error', {message: 'roomId is required'});
//       callback({error: 'roomId is required'});
//       return;
//     }
//     checkers.handleSurrender(socket, {roomId}, callback);
//   });

//   socket.on('reconnect', (data, callback = () => {}) => {
//     console.log(`[RECONNECT] Socket ${socket.id} reconnecting to room ${data.roomId} as ${data.playerId}`);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, playerId } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId || !playerId) {
//       console.error(
//         `[RECONNECT ERROR] Missing roomId or playerId for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: 'roomId and playerId are required'});
//       callback({error: 'roomId and playerId are required'});
//       return;
//     }
//     towerOfHanoi.handleReconnect(socket, { roomId, playerId }, callback);
//   });

//   socket.on('leaveGame', (data, callback = () => {}) => {
//     console.log(`[LEAVE GAME] Socket ${socket.id} leaving room ${data.roomId} as ${data.playerId}`);
//     // Handle both array-wrapped and direct object data
//     const eventData = Array.isArray(data) && data.length > 1 ? data[1] : data;
//     const { roomId, playerId } = typeof eventData === 'object' ? eventData : {};
//     if (!roomId || !playerId) {
//       console.error(
//         `[LEAVE GAME ERROR] Missing roomId or playerId for socket ${socket.id}`,
//       );
//       socket.emit('error', {message: 'roomId and playerId are required'});
//       callback({error: 'roomId and playerId are required'});
//       return;
//     }
//     towerOfHanoi.handleLeaveGame(socket, { roomId, playerId }, callback);
//   });

//   // Disconnect handling for all games
//   socket.on('disconnect', () => {
//     console.log(`[DISCONNECT] Socket ${socket.id} disconnected`);
//     towerOfHanoi.handleDisconnect(socket);
//     snakesAndLadders.handleDisconnect(socket);
//     megaTicTacToe.handleDisconnect(socket);
//     mathSudoku.handleDisconnect(socket);
//     checkers.handleDisconnect(socket);
//     ludo.handleDisconnect(socket);
//     console.log(`[DISCONNECT] Handled disconnect for ${socket.id} across all games`);
//   });
// });

// const PORT = 3000;
// server.listen(PORT, () => {
//   console.log(
//     `Server running on port ${PORT} at ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`,
//   );
// });
