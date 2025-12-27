const { v4: uuidv4 } = require('uuid');

// --- Sudoku Logic (copied from your Sudoku.tsx) ---
// These functions are needed to generate the game on the server.

function createEmptyBoard() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function isSafe(board, row, col, num) {
    for (let x = 0; x < 9; x++) {
        if (board[row][x] === num || board[x][col] === num) return false;
    }
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[startRow + i][startCol + j] === num) return false;
        }
    }
    return true;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function solveSudoku(board) {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (board[row][col] === 0) {
                const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                for (const num of numbers) {
                    if (isSafe(board, row, col, num)) {
                        board[row][col] = num;
                        if (solveSudoku(board)) return true;
                        board[row][col] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

function generateSolvedBoard() {
    const board = createEmptyBoard();
    solveSudoku(board);
    return board;
}

function removeCells(board, difficulty) {
    let cellsToRemove =
        difficulty === 'Easy' ? 30 : difficulty === 'Medium' ? 40 : 50;
    const newBoard = board.map(row => row.slice());
    while (cellsToRemove > 0) {
        const i = Math.floor(Math.random() * 9);
        const j = Math.floor(Math.random() * 9);
        if (newBoard[i][j] !== 0) {
            newBoard[i][j] = 0;
            cellsToRemove--;
        }
    }
    return newBoard;
}

function getCellKey(row, col) {
    return `${row}-${col}`;
}
// --- End of Sudoku Logic ---

class Sudoku {
    constructor(io) {
        this.io = io;
        this.rooms = {}; // Store game states
        this.cleanupTimeouts = {}; // Store timeouts for room deletion (using Object for consistency)

        // Explicit connection handling not needed in constructor if methods are called from index.js
        // but useful if we manage it internally.
        io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
    }

    // Generates a new game state
    _createNewGameState(difficulty) {
        const solutionBoard = generateSolvedBoard();
        const puzzleBoard = removeCells(solutionBoard, difficulty);
        const board = puzzleBoard.map(row => row.slice()); // Working board

        return {
            board: board,
            solutionBoard: solutionBoard,
            puzzleBoard: puzzleBoard,
            lives: 6, // Shared pool of 6 lives for 2 players
            errorCells: [], // Use an array for JSON serializability
            gameOver: false,
            difficulty: difficulty,
        };
    }

    // Attaches disconnect listener
    handleConnection(socket) {
        socket.on('disconnect', () => {
            this.handleDisconnect(socket);
        });
    }

    // Handles player leaving
    handleDisconnect(socket) {
        console.log(`[SUDOKU] Socket ${socket.id} disconnected.`);
        // Find the room this socket was in
        const roomId = Object.keys(this.rooms).find(roomId =>
            this.rooms[roomId].players.some(p => p.id === socket.id),
        );

        if (roomId && this.rooms[roomId]) {
            // Remove the player
            this.rooms[roomId].players = this.rooms[roomId].players.filter(
                p => p.id !== socket.id,
            );

            if (this.rooms[roomId].players.length === 0) {
                // Grace period: Wait 60s before deleting the room
                console.log(`[SUDOKU] Room ${roomId} is empty. Scheduling deletion in 60s...`);
                // Clear any existing timeout just in case
                if (this.cleanupTimeouts[roomId]) clearTimeout(this.cleanupTimeouts[roomId]);

                this.cleanupTimeouts[roomId] = setTimeout(() => {
                    if (this.rooms[roomId] && this.rooms[roomId].players.length === 0) {
                        console.log(`[SUDOKU] Deleting empty room ${roomId}`);
                        delete this.rooms[roomId];
                        delete this.cleanupTimeouts[roomId];
                    }
                }, 60000);
            } else {
                // Notify remaining player
                console.log(`[SUDOKU] Player left room ${roomId}`);
                this.io
                    .to(roomId)
                    .emit('playerDisconnected', {
                        message: 'The other player has disconnected.',
                    });
            }
        }
    }

    // Creates a new room
    createRoom(socket, data, callback) {
        let { roomId, playerName, difficulty = 'Medium' } = data;

        // Auto-generate Room ID if missing (Robustness Fix)
        if (!roomId) {
            roomId = uuidv4();
            console.log(`[SUDOKU] Auto-generated Room ID: ${roomId}`);
        }

        if (this.rooms[roomId]) {
            return callback({ error: 'Room already exists' });
        }

        console.log(
            `[SUDOKU] Creating room ${roomId} for ${playerName} (Difficulty: ${difficulty})`,
        );

        const gameState = this._createNewGameState(difficulty);

        this.rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: playerName }],
            gameState: gameState,
        };

        socket.join(roomId);
        callback({ success: true, roomId, gameState });
    }

    // Joins an existing room
    joinRoom(socket, data, callback) {
        const { roomId, playerName } = data;

        if (!roomId) {
            return callback({ error: 'Room ID is required' });
        }

        const room = this.rooms[roomId];

        if (!room) {
            return callback({ error: 'Room not found' });
        }

        // CONNECTED: Cancel any pending deletion logic
        if (this.cleanupTimeouts[roomId]) {
            console.log(`[SUDOKU] Room ${roomId} deletion cancelled (player joined)`);
            clearTimeout(this.cleanupTimeouts[roomId]);
            delete this.cleanupTimeouts[roomId];
        }

        if (room.players.length >= 2) {
            return callback({ error: 'Room is full' });
        }

        console.log(`[SUDOKU] ${playerName} joining room ${roomId}`);

        room.players.push({ id: socket.id, name: playerName });
        socket.join(roomId);

        // 1. Send success and game state to the joining player
        callback({ success: true, roomId, gameState: room.gameState });

        // 2. Notify all players (including creator) that game is starting
        // This is what SudokuWaiting.tsx listens for
        this.io.to(roomId).emit('player_joined', {
            message: `${playerName} has joined. The game is starting!`,
            players: room.players.map(p => p.name),
            gameState: room.gameState, // Send the state to the creator
        });
    }

    // Handles a player's move
    makeMove(socket, data, callback) {
        const { roomId, row, col, num } = data;
        const room = this.rooms[roomId];

        if (!room) {
            return callback({ error: 'Room not found' });
        }

        const { gameState } = room;

        if (gameState.gameOver) {
            return callback({ error: 'Game is already over' });
        }

        // --- Update Game State ---
        const correctNum = gameState.solutionBoard[row][col];
        const cellKey = getCellKey(row, col);

        gameState.board[row][col] = num;

        const errorSet = new Set(gameState.errorCells);

        if (num === correctNum) {
            // Correct move
            errorSet.delete(cellKey);
        } else {
            // Incorrect move
            errorSet.add(cellKey);
            gameState.lives = Math.max(0, gameState.lives - 1);
        }

        gameState.errorCells = Array.from(errorSet); // Convert back to array

        // --- Check for Win/Loss ---
        let isComplete = true;
        if (gameState.lives <= 0) {
            gameState.gameOver = true;
        } else {
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (
                        gameState.board[r][c] === 0 ||
                        gameState.board[r][c] !== gameState.solutionBoard[r][c]
                    ) {
                        isComplete = false;
                        break;
                    }
                }
                if (!isComplete) break;
            }
        }

        if (isComplete) {
            gameState.gameOver = true;
        }

        // --- Broadcast updated state ---
        // Acknowledge the move
        callback({ success: true });

        // Send the new state to everyone in the room
        this.io.to(roomId).emit('gameUpdate', { gameState: room.gameState });

        if (gameState.gameOver) {
            console.log(`[SUDOKU] Game over in room ${roomId}`);
            // You could emit a specific 'game_over' event here if needed
        }
    }
}

module.exports = Sudoku;