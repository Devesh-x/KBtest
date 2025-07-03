const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const MegaTicTacToe = require('./controllers/MegaTicTacToe.js');
const SnakesAndLadders = require('./controllers/SnakesAndLadders.js');
const TowerOfHanoi = require('./controllers/TowerOfHanoi.js');

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

io.engine.on('connection_error', (err) => {
  console.log(`[SERVER] Connection error:`, err.req, err.code, err.message, err.context);
});

const megaTicTacToe = new MegaTicTacToe(io);
const snakesAndLadders = new SnakesAndLadders(io); // Functional, no 'new'
const towerOfHanoi = new TowerOfHanoi(io);

app.get('/', (req, res) => {
  res.send('Hi');
});

io.on('connection', (socket) => {
  console.log(`[CONNECT] Socket ${socket.id} connected from ${socket.handshake.address}`);

  socket.emit('connection_verified', {
    status: 'authenticated',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  socket.on('error', (error) => {
    console.error(`[SOCKET ERROR] ${socket.id}:`, error);
  });

  socket.conn.on('upgrade', (transport) => {
    console.log(`[UPGRADE] ${socket.id} upgraded to ${transport.name}`);
  });

  socket.on('connect_timeout', () => {
    console.warn(`[CONNECT TIMEOUT] Socket ${socket.id}`);
    socket.emit('connectionError', { message: 'Connection timed out' });
  });

  // MegaTicTacToe and SnakesAndLadders room creation
  socket.on('createRoom', ({ roomId, game, playerName }) => {
    if (game === 'snakes-and-ladders') {
      snakesAndLadders.createRoom(socket, roomId, playerName);
    } else if (game === 'mega-tic-tac-toe') {
      megaTicTacToe.createRoom(socket, roomId);
    } else {
      socket.emit('error', { message: `Unknown game: ${game}` });
    }
  });

  // MegaTicTacToe and SnakesAndLadders room joining
  socket.on('joinRoom', ({ roomId, playerName, game }) => {
    if (game === 'snakes-and-ladders') {
      snakesAndLadders.joinRoom(socket, roomId, playerName);
    } else if (game === 'mega-tic-tac-toe') {
      megaTicTacToe.joinRoom(socket, roomId);
    } else {
      socket.emit('error', { message: `Unknown game: ${game}` });
    }
  });

  // SnakesAndLadders dice roll
  socket.on('rollDice', ({ roomId }) => {
    snakesAndLadders.handleRollDice(socket, { roomId });
  });

  // MegaTicTacToe move
  socket.on('makeMove', ({ roomId, boardIndex, cellIndex }) => {
    megaTicTacToe.handleMove(socket, { roomId, boardIndex, cellIndex });
  });

  // MegaTicTacToe and SnakesAndLadders reset
  socket.on('resetGame', ({ roomId, game }) => {
    if (game === 'snakes-and-ladders') {
      snakesAndLadders.handleReset(socket, { roomId });
    } else if (game === 'mega-tic-tac-toe') {
      megaTicTacToe.handleRestart(socket, { roomId });
    } else {
      socket.emit('error', { message: `Unknown game: ${game}` });
    }
  });

  // MegaTicTacToe restart
  socket.on('restartGame', ({ roomId }) => {
    megaTicTacToe.handleRestart(socket, { roomId });
  });

  // TowerOfHanoi join game
  socket.on('join game', ({ player_id, difficulty }) => {
    console.log(`[JOIN] Player ${player_id} joining with difficulty ${difficulty}`);
    towerOfHanoi.joinQueue(player_id, socket, difficulty);
  });

  // TowerOfHanoi move
  socket.on('make move', ({ room_id, player_id, player_moves, player_towers }) => {
    towerOfHanoi.handleMove(room_id, player_id, player_moves, player_towers, socket);
  });

  // TowerOfHanoi undo move
  socket.on('undo move', ({ room_id, player_id, newTowers, newMoves, newHistory }) => {
    towerOfHanoi.handleUndo(room_id, player_id, newTowers, newMoves, newHistory, socket);
  });

  // TowerOfHanoi reset game
  socket.on('reset game', ({ room_id, player_id, newTowers, newMoves, newHistory }) => {
    towerOfHanoi.handleReset(room_id, player_id, newTowers, newMoves, newHistory, socket);
  });

  // TowerOfHanoi game won
  socket.on('game won', ({ winner, roomID }) => {
    towerOfHanoi.handleGameWon(roomID, winner, socket);
  });

  // TowerOfHanoi leave game
  socket.on('leave game', ({ roomId, playerId }) => {
    towerOfHanoi.handleLeaveGame(roomId, playerId, socket);
  });

  // TowerOfHanoi reconnect
  socket.on('reconnect', ({ roomId, playerId }) => {
    towerOfHanoi.handleReconnect(roomId, playerId, socket);
  });

  // Disconnect handling for all games
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Socket ${socket.id} disconnected`);
    megaTicTacToe.handleDisconnect(socket);
    snakesAndLadders.handleDisconnect(socket);
    towerOfHanoi.handleDisconnect(socket);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});