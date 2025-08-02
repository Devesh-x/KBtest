const { v4: uuidv4 } = require('uuid');

// Reusing helper functions from the React Native Sudoku component
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
    let cellsToRemove = difficulty === 'Easy' ? 30 : difficulty === 'Medium' ? 40 : 50;
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

class Sudoku {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.activeConnections = new Map();

        io.on('connection', (socket) => {
            if (this.activeConnections.has(socket.id)) {
                socket.disconnect(true);
                return;
            }

            this.activeConnections.set(socket.id, {
                ip: socket.handshake.address,
                connectedAt: new Date(),
            });

            console.log(`[Sudoku] New connection: ${socket.id} from ${socket.handshake.address}`);
        });
    }

    createRoom(socket, data, callback = () => {}) {
        try {
            const { roomId: clientRoomId, playerName, difficulty = 'Medium' } = data || {};
            const roomId = clientRoomId || uuidv4();

            if (this.rooms.has(roomId)) {
                callback({ error: 'Room already exists' });
                return;
            }

            const solvedBoard = generateSolvedBoard();
            const puzzleBoard = removeCells(solvedBoard, difficulty);
            const gameState = this.initializeGameState(puzzleBoard, solvedBoard, difficulty);

            this.rooms.set(roomId, {
                players: [{ socketId: socket.id, playerName: playerName || 'Player 1' }],
                gameState,
                currentPlayerIndex: 0,
            });

            socket.join(roomId);
            console.log(`[Sudoku] Room ${roomId} created by ${socket.id} (${playerName}) with ${difficulty} difficulty`);

            callback({
                success: true,
                roomId,
                player: 'Player 1',
                gameState,
            });

            socket.emit('game_start', {
                gameState,
                currentPlayer: gameState.currentPlayer,
            });
        } catch (error) {
            callback({ error: error.message });
            console.error('[Sudoku CREATE ROOM ERROR]', error);
        }
    }

    joinRoom(socket, roomId, playerName, callback = () => {}) {
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

            room.players.push({ socketId: socket.id, playerName: playerName || 'Player 2' });
            socket.join(roomId);
            console.log(`[Sudoku] Player ${socket.id} (${playerName}) joined room ${roomId}`);

            callback({
                success: true,
                roomId,
                player: 'Player 2',
                gameState: room.gameState,
            });

            this.io.to(roomId).emit('game_start', {
                gameState: room.gameState,
                currentPlayer: room.gameState.currentPlayer,
            });
        } catch (error) {
            callback({ error: error.message });
            console.error('[Sudoku JOIN ROOM ERROR]', error);
        }
    }

    handleMove(socket, { roomId, row, col, num }, callback = () => {}) {
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                const errorMsg = 'Room not found';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }
            if (room.gameState.gameOver) {
                const errorMsg = 'Game over';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== room.currentPlayerIndex) {
                const errorMsg = 'Not your turn';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const { gameState } = room;
            if (gameState.puzzleBoard[row][col] !== 0) {
                const errorMsg = 'Cell is prefilled';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const correctNum = gameState.solutionBoard[row][col];
            gameState.board[row][col] = num;

            if (num === correctNum) {
                gameState.errorCells.delete(`${row}-${col}`);
                gameState.lives = Math.min(gameState.lives + 1, 3); // Reward correct move
            } else {
                gameState.errorCells.add(`${row}-${col}`);
                gameState.lives = Math.max(gameState.lives - 1, 0);
            }

            if (gameState.lives <= 0) {
                gameState.gameOver = true;
                gameState.winner = null; // Loss due to no lives
            } else {
                // Check for completion
                let isComplete = true;
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        if (gameState.board[r][c] !== gameState.solutionBoard[r][c]) {
                            isComplete = false;
                            break;
                        }
                    }
                    if (!isComplete) break;
                }
                if (isComplete) {
                    gameState.gameOver = true;
                    gameState.winner = 'Both Players'; // Collaborative win
                }
            }

            room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
            gameState.currentPlayer = room.players[room.currentPlayerIndex].playerName;

            this.io.to(roomId).emit('gameUpdate', {
                gameState,
                currentPlayer: gameState.currentPlayer,
            });

            callback({ success: true, gameState, currentPlayer: gameState.currentPlayer });
        } catch (error) {
            console.error('[Sudoku HANDLE MOVE ERROR]', error);
            socket.emit('moveError', { message: 'Server error' });
            callback({ error: 'Server error' });
        }
    }

    handleRestart(socket, { roomId }) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const { difficulty } = room.gameState;
        const solvedBoard = generateSolvedBoard();
        const puzzleBoard = removeCells(solvedBoard, difficulty);
        room.gameState = this.initializeGameState(puzzleBoard, solvedBoard, difficulty);
        room.currentPlayerIndex = 0;
        room.gameState.currentPlayer = room.players[0].playerName;

        this.io.to(roomId).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.gameState.currentPlayer,
        });

        console.log(`[Sudoku] Room ${roomId} restarted`);
    }

    handleDisconnect(socket) {
        this.activeConnections.delete(socket.id);
        for (const [roomId, room] of this.rooms.entries()) {
            const playerIndex = room.players.findIndex(player => player.socketId === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                    console.log(`[Sudoku] Room ${roomId} deleted due to all players disconnecting`);
                } else {
                    this.io.to(roomId).emit('playerDisconnected', {
                        message: 'Opponent disconnected',
                    });
                    console.log(`[Sudoku] Player ${socket.id} disconnected from room ${roomId}`);
                }
                break;
            }
        }
    }

    initializeGameState(puzzleBoard, solutionBoard, difficulty) {
        return {
            board: puzzleBoard.map(row => row.slice()),
            puzzleBoard: puzzleBoard.map(row => row.slice()),
            solutionBoard: solutionBoard.map(row => row.slice()),
            currentPlayer: null, // Set after player assignment
            gameOver: false,
            winner: null,
            lives: 3,
            errorCells: new Set(),
            difficulty,
        };
    }
}

module.exports = Sudoku;