let wordListObj = require('../../src/games/letterquest/assets/words.js');

// --- FIX: Handle CJS/ESM module default export ---
if (wordListObj && wordListObj.default) {
  wordListObj = wordListObj.default;
}
// --- END FIX ---

// --- Game Constants ---
const GRID_SIZE = 4;
const GAME_DURATION = 60; // 60 seconds
const SCRABBLE_SCORES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5,
  L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4,
  W: 4, X: 8, Y: 4, Z: 10,
};

// --- Server-Side Word Validation ---
let flatWordList;
if (Array.isArray(wordListObj)) {
  flatWordList = wordListObj;
} else if (typeof wordListObj === 'object' && wordListObj !== null) {
  flatWordList = Object.values(wordListObj).flat();
} else {
  flatWordList = [];
}

const localWordSet = new Set(
  flatWordList.map(w => {
    if (typeof w !== 'string') {
      console.error('[WordWorm] ERROR: Non-string item in word list:', w);
      return ''; // Return empty string to avoid crash
    }
    return w.toUpperCase();
  }).filter(Boolean) // Remove any empty strings
);
console.log(`[WordWorm] Local word set initialized with ${localWordSet.size} words.`);

// --- FIX: Implement server-side cache and API fallback ---
const serverWordCache = new Map();

async function isValidWord(word) {
  const up = word.toUpperCase();
  if (up.length < 3) return false;

  // 1. Check server cache first
  if (serverWordCache.has(up)) {
    return serverWordCache.get(up);
  }

  // 2. Check our fast local set
  if (localWordSet.has(up)) {
    serverWordCache.set(up, true); // Add to cache
    return true;
  }

  // 3. Not in local set, check DataMuse API (just like the client)
  console.log(`[WordWorm] Word "${up}" not in local set. Checking API...`);
  try {
    // Node.js 18+ has fetch built-in
    const response = await fetch(
      `https://api.datamuse.com/words?sp=${up}&max=1`,
    );
    if (!response.ok) throw new Error('API response not OK');

    const data = await response.json();
    const isValid = data.length > 0 && data[0].word.toUpperCase() === up;

    console.log(`[WordWorm] API result for "${up}": ${isValid}`);
    serverWordCache.set(up, isValid); // Cache the API result
    return isValid;
  } catch (error) {
    console.error(`[WordWorm] API validation failed for "${up}":`, error.message);
    // If API fails, we can only trust our local set (which was false)
    serverWordCache.set(up, false);
    return false;
  }
}
// --- END FIX ---


// --- Game Logic Helpers ---

function generateRandomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[Math.floor(Math.random() * letters.length)];
}

function generateGrid() {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, generateRandomLetter);
}

function scoreWord(word) {
  return word
    .toUpperCase()
    .split('')
    .reduce((sum, l) => sum + (SCRABBLE_SCORES[l] || 0), 0);
}

class WordWorm {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.timers = new Map(); // To store game loop intervals
    console.log('[WordWorm] Class instantiated');
  }

  // Initialize a new game state
  initializeGameState() {
    return {
      grid: generateGrid(),
      scores: { player1: 0, player2: 0 },
      completedWords: {}, // Use an object as a Set for fast lookups
      timeLeft: GAME_DURATION,
      gameState: 'playing', // 'playing', 'finished'
      winner: null,
    };
  }

  // --- Game Loop Timer ---
  startGameTimer(roomId) {
    let room = this.rooms.get(roomId);
    if (!room) return;

    const timerId = setInterval(() => {
      room = this.rooms.get(roomId); // Get fresh room data
      if (!room || room.gameState.gameState !== 'playing') {
        clearInterval(this.timers.get(roomId));
        this.timers.delete(roomId);
        return;
      }

      room.gameState.timeLeft -= 1;

      if (room.gameState.timeLeft <= 0) {
        // --- Game Over ---
        clearInterval(this.timers.get(roomId));
        this.timers.delete(roomId);

        room.gameState.gameState = 'finished';
        const p1Score = room.gameState.scores.player1;
        const p2Score = room.gameState.scores.player2;
        const p1Name = room.players.find(p => p.role === 'player1')?.playerName || 'Player 1';
        const p2Name = room.players.find(p => p.role === 'player2')?.playerName || 'Player 2';

        if (p1Score > p2Score) {
          room.gameState.winner = p1Name;
        } else if (p2Score > p1Score) {
          room.gameState.winner = p2Name;
        } else {
          room.gameState.winner = 'draw'; // It's a draw
        }

        console.log(`[WordWorm] Game finished in room ${roomId}. Winner: ${room.gameState.winner}`);

      }

      // Broadcast the time tick and new state
      this.io.to(roomId).emit('gameUpdate', room.gameState);

    }, 1000);

    this.timers.set(roomId, timerId);
  }

  // --- Socket Event Handlers ---

  createRoom(socket, { playerName }, callback = () => {}) {
    try {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const gameState = this.initializeGameState();

      this.rooms.set(roomId, {
        players: [{ socketId: socket.id, playerName: playerName || 'Player 1', role: 'player1' }],
        gameState,
      });

      socket.join(roomId);
      console.log(`[WordWorm] Room ${roomId} created by ${socket.id} (${playerName})`);

      callback({
        success: true,
        roomId,
        playerRole: 'player1',
        gameState,
      });
    } catch (error) {
      console.error('[WordWorm CREATE ROOM ERROR]', error);
      callback({ error: error.message });
    }
  }

  joinRoom(socket, { roomId, playerName }, callback = () => {}) {
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

      const opponent = room.players[0];
      room.players.push({ socketId: socket.id, playerName: playerName || 'Player 2', role: 'player2' });
      socket.join(roomId);

      console.log(`[WordWorm] Player ${socket.id} (${playerName}) joined room ${roomId}`);

      // Respond to the joiner
      callback({
        success: true,
        roomId,
        playerRole: 'player2',
        gameState: room.gameState,
        opponentName: opponent.playerName,
      });

      // Tell everyone the game is starting
      this.io.to(roomId).emit('game_start', {
        gameState: room.gameState,
        players: room.players,
      });

      // Start the game timer now that both players are in
      this.startGameTimer(roomId);

    } catch (error) {
      console.error('[WordWorm JOIN ROOM ERROR]', error);
      callback({ error: error.message });
    }
  }

  // --- THIS IS THE CORRECT handleWordSubmit FUNCTION (now async) ---
  async handleWordSubmit(socket, { roomId, selectedIndices }) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.gameState !== 'playing') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const { gameState } = room;

    // Reconstruct the word from indices
    const word = selectedIndices.map(i => gameState.grid[i]).join('');
    const wordUpper = word.toUpperCase();

    // --- Validate Word ---
    if (word.length < 3) {
      socket.emit('wordError', { message: 'Word must be 3+ letters' });
      return;
    }
    if (gameState.completedWords[wordUpper]) {
      socket.emit('wordError', { message: 'Word already found' });
      return;
    }

    // --- FIX: Await the async validation function ---
    const isValid = await isValidWord(wordUpper);
    if (!isValid) {
      socket.emit('wordError', { message: `"${word}" is not a valid word` });
      return;
    }
    // --- END FIX ---

    // --- Word is Valid: Update State ---
    const wordScore = scoreWord(wordUpper);
    gameState.scores[player.role] += wordScore;
    gameState.completedWords[wordUpper] = true; // Add to completed list

    // Replace used letters in the grid
    selectedIndices.forEach(i => {
      gameState.grid[i] = generateRandomLetter();
    });

    // Broadcast the new state to everyone in the room
    this.io.to(roomId).emit('gameUpdate', gameState);
  }

  handleDisconnect(socket) {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        console.log(`[WordWorm] Player ${socket.id} (${player.playerName}) disconnected from room ${roomId}`);

        room.players.splice(playerIndex, 1);

        // Stop the game timer
        if (this.timers.has(roomId)) {
          clearInterval(this.timers.get(roomId));
          this.timers.delete(roomId);
        }

        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          console.log(`[WordWorm] Room ${roomId} deleted.`);
        } else {
          // The other player wins by default
          const remainingPlayer = room.players[0];
          if (room.gameState.gameState === 'playing') {
            room.gameState.gameState = 'finished';
            room.gameState.winner = remainingPlayer.playerName;
          }

          // Emit the final state
          this.io.to(roomId).emit('playerDisconnected', {
            message: `Player ${player.playerName} disconnected. You win!`,
            gameState: room.gameState,
          });
        }
        break;
      }
    }
  }
}

module.exports = WordWorm;
