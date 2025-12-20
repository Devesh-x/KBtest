const { v4: uuidv4 } = require('uuid');

// MathSudoku class to handle multiplayer game logic
class MathSudoku {
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

      console.log(`[MathSudoku] New connection: ${socket.id} from ${socket.handshake.address}`);
    });
  }

  // Generate a short, user-friendly room code
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.rooms.has(result)) {
      return this.generateRoomCode();
    }
    return result;
  }

  // Generate a Latin square as the solved grid
  generateLatinSquare(N) {
    const grid = Array.from({ length: N }, (_, row) =>
      Array.from({ length: N }, (_, col) => ((col + row) % N) + 1)
    );
    // Shuffle rows
    for (let i = grid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [grid[i], grid[j]] = [grid[j], grid[i]];
    }
    // Shuffle columns
    for (let col = 0; col < N; col++) {
      const swapCol = Math.floor(Math.random() * N);
      for (let row = 0; row < N; row++) {
        [grid[row][col], grid[row][swapCol]] = [grid[row][swapCol], grid[row][col]];
      }
    }
    return grid;
  }

  // Generate cages using recursive growth
  generateCages(N, probability) {
    const cages = [];
    const assigned = Array.from({ length: N }, () => Array(N).fill(false));
    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
    ];

    const growCage = (row, col, cage) => {
      cage.push([row, col]);
      assigned[row][col] = true;
      for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        if (
          nr >= 0 &&
          nr < N &&
          nc >= 0 &&
          nc < N &&
          !assigned[nr][nc] &&
          Math.random() < probability
        ) {
          growCage(nr, nc, cage);
        }
      }
    };

    let id = 0;
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        if (!assigned[row][col]) {
          const cage = [];
          growCage(row, col, cage);
          cages.push({ id, cells: cage, operation: "", target: 0 });
          id++;
        }
      }
    }
    return cages;
  }

  // Assign operations and targets to cages
  assignOperationsAndTargets(cages, solution) {
    for (const cage of cages) {
      const numbers = cage.cells.map(([r, c]) => solution[r][c]);
      if (cage.cells.length === 1) {
        cage.operation = "";
        cage.target = numbers[0];
      } else if (cage.cells.length === 2) {
        const [a, b] = numbers;
        const possibleOps = ["+", "-", "*"];
        if (Math.max(a, b) % Math.min(a, b) === 0) possibleOps.push("/");
        cage.operation = possibleOps[Math.floor(Math.random() * possibleOps.length)];
        if (cage.operation === "+") cage.target = a + b;
        else if (cage.operation === "-") cage.target = Math.max(a, b) - Math.min(a, b);
        else if (cage.operation === "*") cage.target = a * b;
        else cage.target = Math.max(a, b) / Math.min(a, b);
      } else {
        cage.operation = Math.random() < 0.5 ? "+" : "*";
        cage.target = cage.operation === "+" ? numbers.reduce((sum, num) => sum + num, 0) : numbers.reduce((prod, num) => prod * num, 1);
      }
    }
  }

  // Remove cells to create the puzzle based on difficulty
  removeCells(grid, level, N) {
    const totalCells = N * N;
    const removePercentage = level === "easy" ? 0.3 : level === "medium" ? 0.5 : 0.7;
    const cellsToRemove = Math.floor(totalCells * removePercentage);
    const newGrid = grid.map((row) => [...row]);
    let removed = 0;
    while (removed < cellsToRemove) {
      const row = Math.floor(Math.random() * N);
      const col = Math.floor(Math.random() * N);
      if (newGrid[row][col] !== 0) {
        newGrid[row][col] = 0;
        removed++;
      }
    }
    return newGrid;
  }

  // Initialize game state
  initializeGameState(size, level) {
    const solution = this.generateLatinSquare(size);
    const probability = level === "easy" ? 0.3 : level === "medium" ? 0.5 : 0.7;
    const cages = this.generateCages(size, probability);
    this.assignOperationsAndTargets(cages, solution);
    const puzzleGrid = this.removeCells(solution, level, size);
    return {
      solution,
      puzzleGrid,
      cages,
      playerGrids: {
        player1: puzzleGrid.map(row => [...row]),
        player2: puzzleGrid.map(row => [...row]),
      },
      timers: { player1: 0, player2: 0 },
      lives: { player1: 3, player2: 3 },
      hints: { player1: 3, player2: 3 },
      gameState: 'playing',
      winner: null,
      currentPlayer: 'player1', // Player1 (creator) starts first
      playerNames: { player1: '', player2: '' },
    };
  }

  // Create a new game room
  createRoom(socket, { roomId, size, level, playerName }, callback = () => { }) {
    try {
      // Use provided roomId (from client) or generate a new short room code
      // However, if the client is buggy and sends empty string, we want to auto-generate a UUID or short code.
      // The previous implementation used generateRoomCode() which is short (6 chars).
      // Let's stick to generateRoomCode for consistency with existing main server logic, 
      // BUT we must ensure it isn't empty.

      let finalRoomId = roomId;
      if (!finalRoomId || finalRoomId.trim() === '') {
        finalRoomId = this.generateRoomCode(); // Auto-generate if missing
        console.log(`[MathSudoku] Generated new roomId: ${finalRoomId}`);
      } else {
        // If provided, use it
        console.log(`[MathSudoku] Creating room - received roomId: "${roomId}"`);
      }

      if (this.rooms.has(finalRoomId)) {
        callback({ error: 'Room already exists' });
        return;
      }

      const gameState = this.initializeGameState(size, level);
      gameState.playerNames.player1 = playerName || 'Player1';

      this.rooms.set(finalRoomId, {
        players: [{ socketId: socket.id, playerName, role: 'player1' }],
        gameState,
      });

      socket.join(finalRoomId);
      console.log(`[MathSudoku] Room ${finalRoomId} created by ${socket.id} (${playerName})`);

      callback({
        success: true,
        roomId: finalRoomId,
        playerRole: 'player1',
        gameState,
      });

      socket.emit('start game', {
        gameState,
        player: 'player1',
        playerName,
        roomId: finalRoomId,
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[MathSudoku CREATE ROOM ERROR]', error);
    }
  }
  // Join an existing room
  joinRoom(socket, { roomId, playerName }, callback = () => { }) {
    try {
      if (!roomId) {
        callback({ error: 'Room ID is required' });
        return;
      }

      // Make room ID case-insensitive by converting to uppercase
      const normalizedRoomId = roomId.toUpperCase();
      console.log(`[MathSudoku] Looking for room with normalized ID: ${normalizedRoomId}`);

      // Find room with case-insensitive matching
      let room = null;
      let actualRoomId = null;
      for (const [key, value] of this.rooms.entries()) {
        if (key.toUpperCase() === normalizedRoomId) {
          room = value;
          actualRoomId = key;
          break;
        }
      }

      if (!room) {
        console.log(`[MathSudoku] Available rooms: ${Array.from(this.rooms.keys()).join(', ')}`);
        callback({ error: 'Room does not exist' });
        return;
      }
      if (room.players.length >= 2) {
        callback({ error: 'Room is full' });
        return;
      }

      room.players.push({ socketId: socket.id, playerName, role: 'player2' });
      room.gameState.playerNames.player2 = playerName || 'Player2';
      socket.join(actualRoomId);
      console.log(`[MathSudoku] Player ${socket.id} (${playerName}) joined room ${actualRoomId}`);

      callback({
        success: true,
        roomId: actualRoomId,
        playerRole: 'player2',
        gameState: room.gameState,
      });

      // Emit start game to both players - similar to Tower of Hanoi
      this.io.to(actualRoomId).emit('start game', {
        gameState: room.gameState,
        roomId: actualRoomId,
        currentPlayer: room.gameState.currentPlayer,
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[MathSudoku JOIN ROOM ERROR]', error);
    }
  }
  // Handle player move
  handleMove(socket, { roomId, row, col, num }, callback = () => { }) {
    console.log(`[MathSudoku] Handling move for socket ${socket.id} in room ${roomId}: [${row},${col}] = ${num}`);

    const room = this.rooms.get(roomId);
    if (!room || room.gameState.gameState !== 'playing') {
      const errorMsg = 'Invalid move or game not active';
      socket.emit('moveError', { message: errorMsg });
      callback({ error: errorMsg });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      const errorMsg = 'Player not in room';
      socket.emit('moveError', { message: errorMsg });
      callback({ error: errorMsg });
      return;
    }

    const { gameState } = room;

    // Check if it's the player's turn (turn-based like Tower of Hanoi)
    if (gameState.currentPlayer !== player.role) {
      const errorMsg = 'Not your turn';
      console.log(`[MathSudoku] Invalid move by ${socket.id}: ${errorMsg}`);
      socket.emit('moveError', { message: errorMsg });
      callback({ error: errorMsg });
      return;
    }

    const playerGrid = gameState.playerGrids[player.role];

    // Prevent modifying prefilled cells
    if (gameState.puzzleGrid[row][col] !== 0) {
      const errorMsg = 'Cannot modify prefilled cell';
      socket.emit('moveError', { message: errorMsg });
      callback({ error: errorMsg });
      return;
    }

    // Update player grid immediately
    playerGrid[row][col] = num;

    // Switch turns after each move (turn-based like Tower of Hanoi)
    gameState.currentPlayer = gameState.currentPlayer === 'player1' ? 'player2' : 'player1';

    // Check if move is correct against solution grid (for lives deduction)
    const isCorrect = num === 0 || num === gameState.solution[row][col];
    if (!isCorrect && num !== 0) {
      gameState.lives[player.role] = Math.max(0, gameState.lives[player.role] - 1);
      if (gameState.lives[player.role] === 0) {
        gameState.gameState = 'lost';
        gameState.winner = room.players.find(p => p.role !== player.role).playerName;
      }
    }

    // Check if player has solved the puzzle (only if not clearing a cell)
    if (num !== 0) {
      const isSolved = playerGrid.every((row, r) =>
        row.every((cell, c) => cell === gameState.solution[r][c])
      );
      if (isSolved) {
        gameState.gameState = 'won';
        gameState.winner = player.playerName;
      }
    }

    // Broadcast updated game state with current player info
    this.io.to(roomId).emit('update game', {
      gameState,
      currentPlayer: gameState.currentPlayer,
      move: { row, col, num, playerName: player.playerName },
    });

    console.log(`[MathSudoku] Move by ${player.playerName} in room ${roomId}: [${row},${col}] = ${num}, next turn: ${gameState.currentPlayer}`);
    callback({ success: true, gameState, currentPlayer: gameState.currentPlayer });
  }

  // Validate cage constraints
  validateCage(cage, values) {
    // Remove any null or undefined values (in case some cells are not yet filled)
    const filledValues = values.filter(v => v !== 0 && v !== null && v !== undefined);

    // For single-cell cages
    if (cage.operation === '') {
      return filledValues.length === 1 && filledValues[0] === cage.target;
    }

    // For multi-cell cages, check if all cells are filled
    if (filledValues.length !== cage.cells.length) {
      return true; // Allow partial cage filling until all cells are filled
    }

    if (cage.operation === '+') {
      return filledValues.reduce((sum, v) => sum + v, 0) === cage.target;
    }
    if (cage.operation === '*') {
      return filledValues.reduce((prod, v) => prod * v, 1) === cage.target;
    }
    if (cage.operation === '-') {
      return Math.abs(filledValues[0] - filledValues[1]) === cage.target;
    }
    if (cage.operation === '/') {
      return Math.max(...filledValues) / Math.min(...filledValues) === cage.target;
    }
    return true;
  }
  // Handle hint request
  handleHint(socket, { roomId }) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.gameState !== 'playing') {
      socket.emit('hintError', { message: 'Game not active' });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      socket.emit('hintError', { message: 'Player not in room' });
      return;
    }

    if (room.gameState.hints[player.role] <= 0) {
      socket.emit('hintError', { message: 'No hints left' });
      return;
    }

    const N = room.gameState.solution.length;
    const playerGrid = room.gameState.playerGrids[player.role];
    const candidates = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (playerGrid[r][c] === 0) {
          const possible = this.getPossibleValues(playerGrid, r, c, N);
          if (possible.length === 1) {
            candidates.push({ row: r, col: c, num: possible[0] });
          }
        }
      }
    }

    let cellToReveal;
    if (candidates.length > 0) {
      cellToReveal = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const emptyCells = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (playerGrid[r][c] === 0) emptyCells.push({ row: r, col: c });
        }
      }
      if (emptyCells.length === 0) {
        socket.emit('hintError', { message: 'No empty cells for hint' });
        return;
      }
      cellToReveal = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      cellToReveal.num = room.gameState.solution[cellToReveal.row][cellToReveal.col];
    }

    playerGrid[cellToReveal.row][cellToReveal.col] = cellToReveal.num;
    room.gameState.hints[player.role] -= 1;

    // Broadcast updated game state
    this.io.to(roomId).emit('gameUpdate', {
      gameState: room.gameState,
      playerRole: player.role,
      hint: { row: cellToReveal.row, col: cellToReveal.col, num: cellToReveal.num, playerName: player.playerName },
    });

    console.log(`[MathSudoku] Hint used by ${player.playerName} in room ${roomId}`);
  }

  // Get possible values for a cell
  getPossibleValues(grid, row, col, N) {
    const rowValues = new Set(grid[row].filter(v => v !== 0));
    const colValues = new Set(grid.map(r => r[col]).filter(v => v !== 0));
    const possible = [];
    for (let num = 1; num <= N; num++) {
      if (!rowValues.has(num) && !colValues.has(num)) {
        possible.push(num);
      }
    }
    return possible;
  }

  // Handle disconnect
  handleDisconnect(socket) {
    this.activeConnections.delete(socket.id);
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          console.log(`[MathSudoku] Room ${roomId} deleted due to all players disconnecting`);
        } else {
          this.io.to(roomId).emit('playerDisconnected', {
            message: `Player ${player.playerName} disconnected`,
            remainingPlayer: room.players[0].playerName,
          });
          console.log(`[MathSudoku] Player ${socket.id} (${player.playerName}) disconnected from room ${roomId}`);
        }
        break;
      }
    }
  }
}

module.exports = MathSudoku;
