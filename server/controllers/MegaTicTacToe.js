const { v4: uuidv4 } = require('uuid');

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

            console.log(`[MegaTicTacToe] New connection: ${socket.id} from ${socket.handshake.address}`);
        });
    }

    createRoom(socket, data, callback = () => {}) {
        try {
            const { roomId: clientRoomId, playerName } = data || {};
            
            // Use client-provided roomId or generate a new one
            const roomId = clientRoomId || uuidv4();
            
            if (this.rooms.has(roomId)) {
                callback({ error: 'Room already exists' });
                return;
            }

            const gameState = this.initializeGameState();
            this.rooms.set(roomId, {
                players: [{ socketId: socket.id, playerName: playerName || 'Player 1' }],
                gameState,
                currentPlayer: 'X',
            });

            socket.join(roomId);
            console.log(`[MegaTicTacToe] Room ${roomId} created by ${socket.id} (${playerName})`);

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
            console.error('[MegaTicTacToe CREATE ROOM ERROR]', error);
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
            console.log(`[MegaTicTacToe] Player ${socket.id} (${playerName}) joined room ${roomId}`);

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
            console.error('[MegaTicTacToe JOIN ROOM ERROR]', error);
        }
    }

    handleMove(socket, { roomId, boardIndex, cellIndex }, callback = () => {}) {
    console.log(`[MegaTicTacToe] Handling move for socket ${socket.id} in room ${roomId}: boardIndex ${boardIndex}, cellIndex ${cellIndex}`);
    try {
        const room = this.rooms.get(roomId);
        if (!room) {
            const errorMsg = 'Room not found';
            console.log(`[MegaTicTacToe] Invalid move by ${socket.id}: ${errorMsg}`);
            socket.emit('moveError', { message: errorMsg });
            callback({ error: errorMsg });
            return;
        }
        if (room.gameState.gameOver) {
            const errorMsg = 'Game over';
            console.log(`[MegaTicTacToe] Invalid move by ${socket.id}: ${errorMsg}`);
            socket.emit('moveError', { message: errorMsg });
            callback({ error: errorMsg });
            return;
        }
        const playerRole = room.players[0].socketId === socket.id ? 'X' : 'O';
        if (room.currentPlayer !== playerRole) {
            const errorMsg = 'Not your turn';
            console.log(`[MegaTicTacToe] Invalid move by ${socket.id}: ${errorMsg}`);
            socket.emit('moveError', { message: errorMsg });
            callback({ error: errorMsg });
            return;
        }

        if (boardIndex < 0 || boardIndex >= 9 || cellIndex < 0 || cellIndex >= 9) {
            const errorMsg = `Invalid indices ${boardIndex}, ${cellIndex}`;
            console.log(`[MegaTicTacToe] Invalid move by ${socket.id}: ${errorMsg}`);
            socket.emit('moveError', { message: errorMsg });
            callback({ error: errorMsg });
            return;
        }

        const { gameState } = room;
        if (gameState.board[boardIndex]?.[cellIndex] || gameState.boardWinners[boardIndex]) {
            const errorMsg = 'Cell already taken or board won';
            console.log(`[MegaTicTacToe] Invalid move by ${socket.id}: ${errorMsg}`);
            socket.emit('moveError', { message: errorMsg });
            callback({ error: errorMsg });
            return;
        }

        gameState.board[boardIndex][cellIndex] = room.currentPlayer;

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

        let nextGrid = cellIndex;
        const isNextGridFull = gameState.board[nextGrid]?.every(cell => cell !== null);
        if (gameState.boardWinners[nextGrid] || isNextGridFull) {
            nextGrid = null;
        }
        gameState.currentGrid = nextGrid;
        room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';

        this.io.to(roomId).emit('gameUpdate', {
            gameState,
            currentPlayer: room.currentPlayer,
        });

        console.log(`[MegaTicTacToe] Move made in room ${roomId}: ${boardIndex}, ${cellIndex}`);
        callback({ success: true, gameState, currentPlayer: room.currentPlayer });
    } catch (error) {
        console.error('[MegaTicTacToe HANDLE MOVE ERROR]', error);
        socket.emit('moveError', { message: 'Server error' });
        callback({ error: 'Server error' });
    }
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

        console.log(`[MegaTicTacToe] Room ${roomId} restarted`);
    }

    handleDisconnect(socket) {
        this.activeConnections.delete(socket.id);
        for (const [roomId, room] of this.rooms.entries()) {
            const playerIndex = room.players.findIndex(player => player.socketId === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                    console.log(`[MegaTicTacToe] Room ${roomId} deleted due to all players disconnecting`);
                } else {
                    this.io.to(roomId).emit('playerDisconnected', {
                        message: 'Opponent disconnected',
                    });
                    console.log(`[MegaTicTacToe] Player ${socket.id} disconnected from room ${roomId}`);
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
