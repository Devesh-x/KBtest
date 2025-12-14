
const {v4: uuidv4} = require('uuid');

// --- Game Logic ---
const gameChoices = {
  classic: {
    rock: {emoji: '✊', beats: ['scissors']},
    paper: {emoji: '✋', beats: ['rock']},
    scissors: {emoji: '✌', beats: ['paper']},
  },
  extended: {
    rock: {emoji: '✊', beats: ['scissors', 'lizard']},
    paper: {emoji: '✋', beats: ['rock', 'spock']},
    scissors: {emoji: '✌', beats: ['paper', 'lizard']},
    lizard: {emoji: '🦎', beats: ['paper', 'spock']},
    spock: {emoji: '🖖', beats: ['rock', 'scissors']},
  },
};

function getChoices(mode) {
  return gameChoices[mode] || gameChoices.classic;
}

function determineWinner(playerChoice, opponentChoice, mode = 'classic') {
  if (playerChoice === opponentChoice) {
    return 'tie';
  }
  const choices = getChoices(mode);
  // Optional chaining check in case of invalid input
  if (choices[playerChoice]?.beats.includes(opponentChoice)) {
    return 'player';
  }
  return 'opponent';
}

class RPS {
  constructor(io) {
    this.io = io;
    this.rooms = {}; // { roomId: { players: [], gameState: {} } }
  }

  // --- Socket Connection Handlers ---
  handleConnection(socket) {
    console.log(`[RPS] Socket ${socket.id} connected.`);

    // 1. LISTEN FOR EVENTS (This was missing!)
    // We use arrow functions to keep 'this' bound to the Class instance
    socket.on('rps:createRoom', data => this.createRoom(socket, data));
    socket.on('rps:joinRoom', data => this.joinRoom(socket, data));
    socket.on('rps:makeChoice', data => this.handleMakeChoice(socket, data));

    // Allow manual leaving if needed
    socket.on('rps:leaveGame', ({roomId}) => this._leaveRoom(socket, roomId));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  handleDisconnect(socket) {
    // Find the room this socket was in
    const roomId = Object.keys(this.rooms).find(id =>
      this.rooms[id].players.some(p => p.socketId === socket.id),
    );

    if (roomId) {
      this._leaveRoom(socket, roomId);
    }
  }

  // --- Room Management ---

  createRoom(socket, data = {}) {
    // FIX: Generate a 4-digit numeric code for easier typing on mobile
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    const {playerName = 'Player 1', mode = 'classic'} = data;

    const player = {
      socketId: socket.id,
      playerName,
      isCreator: true,
      choice: null,
    };

    this.rooms[roomId] = {
      roomId,
      players: [player],
      gameMode: mode,
      maxRounds: 5,
      gameState: null,
    };

    socket.join(roomId);
    console.log(`[RPS CREATE] Room ${roomId} created by ${socket.id}`);

    // FIX: Emit the exact event the React Native client is waiting for
    socket.emit('rps:roomJoined', {roomId, isHost: true});
  }

  joinRoom(socket, {roomId, playerName = 'Player 2'}) {
    const room = this.rooms[roomId];

    if (!room) {
      socket.emit('rps:error', 'Room not found.');
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('rps:error', 'Room is full.');
      return;
    }

    const player = {
      socketId: socket.id,
      playerName,
      isCreator: false,
      choice: null,
    };

    room.players.push(player);
    socket.join(roomId);
    console.log(`[RPS JOIN] ${socket.id} joined room ${roomId}.`);

    // FIX: Emit event to the joiner so they enter the game screen
    socket.emit('rps:roomJoined', {roomId, isHost: false});

    // FIX: Notify the host that someone joined
    this.io
      .to(roomId)
      .emit('rps:playerJoined', {playerCount: room.players.length});

    // If room is full, start the game logic
    if (room.players.length === 2) {
      this._startGame(roomId);
    }
  }

  _leaveRoom(socket, roomId) {
    const room = this.rooms[roomId];
    if (!room) {
      return;
    }

    console.log(`[RPS LEAVE] ${socket.id} left room ${roomId}`);

    // Notify opponent
    this.io.to(roomId).emit('rps:opponentLeft');

    // Clean up
    delete this.rooms[roomId];
  }

  // --- Game State Management ---

  _startGame(roomId) {
    const room = this.rooms[roomId];
    if (!room || room.players.length !== 2) {
      return;
    }

    room.gameState = {
      round: 1,
      scores: {
        [room.players[0].socketId]: 0,
        [room.players[1].socketId]: 0,
      },
      history: [],
    };

    console.log(`[RPS START] Game starting in room ${roomId}.`);
    // Optional: You can emit 'gameStarted' if you want a specific animation
    // But the current client relies on 'rps:playerJoined' to remove the "Waiting" text
  }

  handleMakeChoice(socket, {roomId, choice}) {
    const room = this.rooms[roomId];
    if (!room || !room.gameState) {
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.choice) {
      return;
    } // Prevent double choice

    player.choice = choice;
    console.log(`[RPS CHOICE] ${socket.id} chose ${choice}`);

    // Notify opponent (without revealing choice)
    const opponent = room.players.find(p => p.socketId !== socket.id);
    if (opponent) {
      this.io.to(opponent.socketId).emit('rps:opponentChose');
    }

    // Check if both have chosen
    const allChosen = room.players.every(p => p.choice !== null);
    if (allChosen) {
      this._evaluateRound(roomId);
    }
  }

  _evaluateRound(roomId) {
    const room = this.rooms[roomId];
    if (!room || !room.gameState) {
      return;
    }

    const [p1, p2] = room.players;
    const result = determineWinner(p1.choice, p2.choice, room.gameMode);

    let winnerSocketId = null;
    if (result === 'player') {
      room.gameState.scores[p1.socketId]++;
      winnerSocketId = p1.socketId;
    } else if (result === 'opponent') {
      room.gameState.scores[p2.socketId]++;
      winnerSocketId = p2.socketId;
    }

    const roundResult = {
      round: room.gameState.round,
      p1: {socketId: p1.socketId, choice: p1.choice},
      p2: {socketId: p2.socketId, choice: p2.choice},
      winner: winnerSocketId,
      scores: room.gameState.scores,
    };

    // Send results
    this.io.to(roomId).emit('rps:roundResult', roundResult);

    // Check Win Condition (First to 3 wins in a best of 5)
    const p1Score = room.gameState.scores[p1.socketId];
    const p2Score = room.gameState.scores[p2.socketId];
    const roundsToWin = Math.ceil(room.maxRounds / 2); // usually 3

    if (
      p1Score >= roundsToWin ||
      p2Score >= roundsToWin ||
      room.gameState.round >= room.maxRounds
    ) {
      setTimeout(() => this._endGame(roomId), 2000);
    } else {
      setTimeout(() => {
        room.gameState.round++;
        this._resetRound(roomId);
      }, 2500);
    }
  }

  _resetRound(roomId) {
    const room = this.rooms[roomId];
    if (!room || !room.gameState) {
      return;
    }

    room.players.forEach(p => (p.choice = null));
    this.io.to(roomId).emit('rps:nextRound', {
      round: room.gameState.round,
      scores: room.gameState.scores,
    });
  }

  _endGame(roomId) {
    const room = this.rooms[roomId];
    if (!room || !room.gameState) {
      return;
    }

    const [p1, p2] = room.players;
    const p1Score = room.gameState.scores[p1.socketId];
    const p2Score = room.gameState.scores[p2.socketId];

    let winnerSocketId = null;
    if (p1Score > p2Score) {
      winnerSocketId = p1.socketId;
    } else if (p2Score > p1Score) {
      winnerSocketId = p2.socketId;
    }

    this.io.to(roomId).emit('rps:gameEnd', {
      winnerSocketId,
      scores: room.gameState.scores,
    });

    // We don't delete the room immediately in case they want to chat or see scores,
    // but usually, we clear game state.
    room.gameState = null;
    room.players.forEach(p => (p.choice = null));
  }
}

module.exports = RPS;