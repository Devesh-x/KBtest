// File: controllers/MathSudoku.js

class MathSudoku {
  constructor(io) {
    // The constructor now ONLY stores the main 'io' instance.
    this.io = io;
    this.rooms = new Map();
  }

  // --- Puzzle Generation Logic ---
  generateLatinSquare(N) {
    const grid = Array.from({ length: N }, (_, row) =>
      Array.from({ length: N }, (_, col) => ((col + row) % N) + 1)
    );
    for (let i = grid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [grid[i], grid[j]] = [grid[j], grid[i]];
    }
    for (let col = 0; col < N; col++) {
      const swapCol = Math.floor(Math.random() * N);
      for (let row = 0; row < N; row++) {
        [grid[row][col], grid[row][swapCol]] = [grid[row][swapCol], grid[row][col]];
      }
    }
    return grid;
  }

  generateCages(N, probability) {
    const cages = [];
    const assigned = Array.from({ length: N }, () => Array(N).fill(false));
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const growCage = (row, col, cage) => {
        cage.push([row, col]);
        assigned[row][col] = true;
        for (const [dr, dc] of directions) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N && !assigned[nr][nc] && Math.random() < probability) {
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
        else if (cage.operation === "-") cage.target = Math.abs(a - b);
        else if (cage.operation === "*") cage.target = a * b;
        else cage.target = Math.max(a, b) / Math.min(a, b);
      } else {
        cage.operation = Math.random() < 0.5 ? "+" : "*";
        cage.target = cage.operation === "+" ? numbers.reduce((sum, num) => sum + num, 0) : numbers.reduce((prod, num) => prod * num, 1);
      }
    }
  }

  removeCells(grid, level, N) {
    const totalCells = N * N;
    const removePercentage = level === 'easy' ? 0.3 : level === 'medium' ? 0.5 : 0.7;
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

  initializeGameState(size, level) {
    const solution = this.generateLatinSquare(size);
    const cages = this.generateCages(size, 0.5);
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
      lives: { player1: 3, player2: 3 },
      gameState: 'playing',
      winner: null,
    };
  }

  createRoom(socket, { roomId, size, level, playerName }, callback = () => {}) {
    try {
      if (!roomId) {
        return callback({ success: false, error: 'Room ID from client was missing.' });
      }
      if (this.rooms.has(roomId)) {
        return callback({ success: false, error: 'Room already exists' });
      }
      const gameState = this.initializeGameState(size || 4, level || 'medium');
      this.rooms.set(roomId, {
        players: [{ socketId: socket.id, playerName, role: 'player1' }],
        gameState,
      });
      socket.join(roomId);
      callback({ success: true, roomId, playerRole: 'player1', gameState });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  }

  joinRoom(socket, { roomId, playerName }, callback = () => {}) {
    try {
      if (!roomId) return callback({ success: false, error: 'Room ID is required' });
      const room = this.rooms.get(roomId);
      if (!room) return callback({ success: false, error: 'Room does not exist' });
      if (room.players.length >= 2) return callback({ success: false, error: 'Room is full' });

      room.players.push({ socketId: socket.id, playerName, role: 'player2' });
      socket.join(roomId);

      const opponent = room.players.find(p => p.role === 'player1');
      callback({
        success: true,
        roomId,
        playerRole: 'player2',
        gameState: room.gameState,
        opponentName: opponent.playerName,
      });

      this.io.to(roomId).emit('game_start', {
        gameState: room.gameState,
        players: room.players.map(p => ({ role: p.role, playerName: p.playerName })),
      });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  }

  handleMove(socket, { roomId, row, col, num }) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.gameState !== 'playing') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const { gameState } = room;
    const playerGrid = gameState.playerGrids[player.role];
    if (gameState.puzzleGrid[row][col] !== 0) return;

    playerGrid[row][col] = num;

    if (num !== 0) {
        const isCorrect = num === gameState.solution[row][col];
        if (!isCorrect) {
            gameState.lives[player.role] = Math.max(0, gameState.lives[player.role] - 1);
            if (gameState.lives[player.role] === 0) {
                gameState.gameState = 'won';
                const winnerPlayer = room.players.find(p => p.role !== player.role);
                gameState.winner = winnerPlayer ? winnerPlayer.playerName : 'Opponent';
            }
        }
    }

    const isSolved = playerGrid.every((r, rIndex) =>
        r.every((cell, cIndex) => cell === gameState.solution[rIndex][cIndex])
    );

    if (isSolved) {
        gameState.gameState = 'won';
        gameState.winner = player.playerName;
    }

    this.io.to(roomId).emit('gameUpdate', { gameState });
  }

  handleDisconnect(socket) {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];

        if (room.players.length === 2 && room.gameState.gameState === 'playing') {
            const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
            room.gameState.gameState = 'won';
            room.gameState.winner = remainingPlayer.playerName;
            this.io.to(roomId).emit('opponentDisconnected', {
                message: `${disconnectedPlayer.playerName} disconnected. You win!`,
                gameState: room.gameState,
            });
        }

        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
            this.rooms.delete(roomId);
        }
        break;
      }
    }
  }
}

module.exports = MathSudoku;
