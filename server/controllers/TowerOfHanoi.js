const { v4: uuidv4 } = require('uuid');

class TowerOfHanoi {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.activeConnections = new Map();


    }

    // Helper function to create initial towers with the given number of disks
    initializeTowers(numDisks) {
        const tower1 = [];
        for (let i = numDisks; i >= 1; i--) {
            tower1.push(i);
        }
        return [tower1, [], []];
    }

    createRoom(socket, data, callback = () => { }) {
        try {
            const { roomId: clientRoomId, numDisks = 3, playerName } = data;
            if (numDisks < 3 || numDisks > 10) {
                callback({ error: 'Number of disks must be between 3 and 10' });
                return;
            }

            const roomId = clientRoomId || uuidv4();
            if (this.rooms.has(roomId)) {
                callback({ error: 'Room ID collision (unlikely)' });
                return;
            }

            const gameState = {
                towers: this.initializeTowers(numDisks),
                moves: 0,
                currentPlayer: 'Player1',
                numDisks,
                gameOver: false,
                winner: null,
                playerNames: { Player1: playerName || 'Player1' },
                history: [], // Added to store move history for undo
            };

            this.rooms.set(roomId, {
                players: [socket.id],
                gameState,
            });

            socket.join(roomId);
            console.log(`[TowerOfHanoi] Room ${roomId} created by ${socket.id}`);

            callback({
                success: true,
                roomId,
                player: 'Player1',
                gameState,
            });

            // Notify only the creator
            this.io.to(socket.id).emit('start game', {
                gameState,
                roomId,
                player: 'Player1',
            });
        } catch (error) {
            callback({ error: error.message });
            console.error('[TowerOfHanoi CREATE ROOM ERROR]', error);
        }
    }

    joinRoom(socket, data, callback = () => { }) {
        try {
            const { roomId, playerName } = data;
            const room = this.rooms.get(roomId);

            if (!room) {
                callback({ error: 'Room does not exist' });
                return;
            }
            if (room.players.length >= 2) {
                callback({ error: 'Room is full' });
                return;
            }

            const playerRole = room.players[0] === socket.id ? 'Player1' : 'Player2';
            if (playerRole === 'Player2' && room.players.length === 1) {
                room.players.push(socket.id);
                room.gameState.playerNames.Player2 = playerName || 'Player2';
            } else if (playerRole === 'Player1' && room.players.length === 1 && room.players[0] === socket.id) {
                // Already in room, ignore join request, proceed to callback
            } else {
                // Fallback for rejoining logic, assumes the player is either P1 or P2 socket ID
                if (room.players.length === 1) {
                    room.players.push(socket.id);
                    room.gameState.playerNames.Player2 = playerName || 'Player2';
                }
            }

            socket.join(roomId);
            console.log(`[TowerOfHanoi] Player ${socket.id} joined room ${roomId}`);

            const assignedRole = room.players.indexOf(socket.id) === 0 ? 'Player1' : 'Player2';

            callback({
                success: true,
                roomId,
                player: assignedRole,
                gameState: room.gameState,
            });

            // Fix: Send specific events to each player so roles don't get overwritten
            const [p1Socket, p2Socket] = room.players;

            if (p1Socket) {
                this.io.to(p1Socket).emit('start game', {
                    gameState: room.gameState,
                    roomId,
                    player: 'Player1',
                });
            }
            if (p2Socket) {
                this.io.to(p2Socket).emit('start game', {
                    gameState: room.gameState,
                    roomId,
                    player: 'Player2',
                });
            }
        } catch (error) {
            callback({ error: error.message });
            console.error('[TowerOfHanoi JOIN ROOM ERROR]', error);
        }
    }

    makeMove(socket, { roomId, fromTower, toTower }, callback = () => { }) {
        console.log(`[TowerOfHanoi] Handling move for socket ${socket.id} in room ${roomId}: fromTower ${fromTower}, toTower ${toTower}`);
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                const errorMsg = 'Room not found';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            if (room.gameState.gameOver) {
                const errorMsg = 'Game over';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const playerRole = room.players[0] === socket.id ? 'Player1' : (room.players[1] === socket.id ? 'Player2' : null);
            if (!playerRole) {
                const errorMsg = 'Player not in room';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            if (room.gameState.currentPlayer !== playerRole) {
                const errorMsg = 'Not your turn';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const { towers } = room.gameState;
            if (fromTower < 0 || fromTower >= 3 || toTower < 0 || toTower >= 3) {
                const errorMsg = 'Invalid tower indices';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const fromTowerDisks = [...towers[fromTower]];
            const toTowerDisks = [...towers[toTower]];
            if (fromTowerDisks.length === 0) {
                const errorMsg = 'Source tower is empty';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const movingDisk = fromTowerDisks[fromTowerDisks.length - 1];
            if (toTowerDisks.length > 0 && movingDisk > toTowerDisks[toTowerDisks.length - 1]) {
                const errorMsg = 'Cannot place larger disk on smaller disk';
                console.log(`[TowerOfHanoi] Invalid move by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            // Store current state in history before making the move
            room.gameState.history.push({
                towers: towers.map(tower => [...tower]),
                moves: room.gameState.moves,
                currentPlayer: room.gameState.currentPlayer,
            });

            // Perform the move
            fromTowerDisks.pop();
            toTowerDisks.push(movingDisk);
            const newTowers = towers.map((tower, index) => {
                if (index === fromTower) return fromTowerDisks;
                if (index === toTower) return toTowerDisks;
                return tower;
            });

            room.gameState.towers = newTowers;
            room.gameState.moves += 1;
            room.gameState.currentPlayer = room.gameState.currentPlayer === 'Player1' ? 'Player2' : 'Player1';

            // Check for win condition
            if (newTowers[2].length === room.gameState.numDisks) {
                room.gameState.gameOver = true;
                room.gameState.winner = playerRole;
            }

            this.io.to(roomId).emit('update game', {
                gameState: room.gameState,
                currentPlayer: room.gameState.currentPlayer,
            });

            if (room.gameState.gameOver) {
                this.io.to(roomId).emit('show result', {
                    winner: room.gameState.winner,
                    moves: room.gameState.moves,
                });
            }

            console.log(`[TowerOfHanoi] Move made in room ${roomId}: from ${fromTower} to ${toTower}`);
            callback({ success: true, gameState: room.gameState, currentPlayer: room.gameState.currentPlayer });
        } catch (error) {
            console.error('[TowerOfHanoi HANDLE MOVE ERROR]', error);
            socket.emit('moveError', { message: 'Server error' });
            callback({ error: 'Server error' });
        }
    }

    handleRestart(socket, { roomId }) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.gameState = {
            towers: this.initializeTowers(room.gameState.numDisks),
            moves: 0,
            currentPlayer: 'Player1',
            numDisks: room.gameState.numDisks,
            gameOver: false,
            winner: null,
            playerNames: room.gameState.playerNames,
            history: [], // Reset history
        };

        this.io.to(roomId).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.gameState.currentPlayer,
        });

        console.log(`[TowerOfHanoi] Room ${roomId} restarted`);
    }

    handleUndo(socket, { roomId }, callback = () => { }) {
        console.log(`[TowerOfHanoi] Handling undo for socket ${socket.id} in room ${roomId}`);
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                const errorMsg = 'Room not found';
                console.log(`[TowerOfHanoi] Invalid undo by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }
            if (room.gameState.moves === 0 || !room.gameState.history || room.gameState.history.length === 0) {
                const errorMsg = 'No moves to undo';
                console.log(`[TowerOfHanoi] Invalid undo by ${socket.id}: ${errorMsg}`);
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const previousState = room.gameState.history.pop();
            room.gameState.towers = previousState.towers;
            room.gameState.moves = previousState.moves;
            room.gameState.currentPlayer = previousState.currentPlayer;
            room.gameState.gameOver = false;
            room.gameState.winner = null;

            this.io.to(roomId).emit('update game', {
                gameState: room.gameState,
                currentPlayer: room.gameState.currentPlayer,
            });

            console.log(`[TowerOfHanoi] Undo successful in room ${roomId}`);
            callback({ success: true, gameState: room.gameState, currentPlayer: room.gameState.currentPlayer });
        } catch (error) {
            console.error('[TowerOfHanoi UNDO ERROR]', error);
            socket.emit('moveError', { message: 'Server error' });
            callback({ error: 'Server error' });
        }
    }

    handleReconnect(socket, { roomId, playerId }, callback = () => { }) {
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                callback({ error: 'Room not found' });
                return;
            }
            // Check if the reconnecting player is P1 or P2 (by their original ID)
            const playerIndex = room.players.indexOf(playerId);
            if (playerIndex === -1) {
                // If playerId is not the current socket.id in the array, check the other player's old ID
                const potentialIndex = room.players.findIndex(id => id === playerId);
                if (potentialIndex !== -1) {
                    room.players[potentialIndex] = socket.id; // Update socket ID
                    socket.join(roomId);
                    const playerRole = potentialIndex === 0 ? 'Player1' : 'Player2';

                    console.log(`[TowerOfHanoi] Player ${socket.id} reconnected to room ${roomId} as ${playerId} (${playerRole})`);

                    callback({
                        success: true,
                        roomId,
                        player: playerRole,
                        gameState: room.gameState,
                    });

                    this.io.to(roomId).emit('update game', { // Use update game for passive reconnect
                        gameState: room.gameState,
                        currentPlayer: room.gameState.currentPlayer,
                    });
                    return;
                }

                callback({ error: 'Player not in room' });
                return;
            }

            // Update socket ID for the reconnecting player (if socket.id is different from playerId)
            if (room.players[playerIndex] !== socket.id) {
                room.players[playerIndex] = socket.id;
            }

            socket.join(roomId);
            const playerRole = playerIndex === 0 ? 'Player1' : 'Player2';

            console.log(`[TowerOfHanoi] Player ${socket.id} reconnected to room ${roomId} as ${playerId} (${playerRole})`);

            callback({
                success: true,
                roomId,
                player: playerRole,
                gameState: room.gameState,
            });

            this.io.to(roomId).emit('update game', {
                gameState: room.gameState,
                currentPlayer: room.gameState.currentPlayer,
            });
        } catch (error) {
            callback({ error: error.message });
            console.error('[TowerOfHanoi RECONNECT ERROR]', error);
        }
    }

    handleLeaveGame(socket, { roomId, playerId }, callback = () => { }) {
        try {
            const room = this.rooms.get(roomId);
            if (!room) {
                callback({ error: 'Room not found' });
                return;
            }

            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex === -1) {
                // Check if the player is identified by the playerId (original ID)
                const originalPlayerIndex = room.players.findIndex(id => id === playerId);
                if (originalPlayerIndex === -1) {
                    callback({ error: 'Player not in room' });
                    return;
                }
            }

            // Determine which index to remove (using socket.id is safer)
            const indexToRemove = room.players.indexOf(socket.id);
            if (indexToRemove === -1) {
                // If the socket is somehow gone but we still have the original ID, remove by original ID
                const originalIndexToRemove = room.players.findIndex(id => id === playerId);
                if (originalIndexToRemove !== -1) {
                    room.players.splice(originalIndexToRemove, 1);
                } else {
                    callback({ error: 'Player not found by socket.id or playerId' });
                    return;
                }
            } else {
                room.players.splice(indexToRemove, 1);
            }

            socket.leave(roomId);
            console.log(`[TowerOfHanoi] Player ${playerId} (socket ${socket.id}) left room ${roomId}`);

            if (room.players.length === 0) {
                this.rooms.delete(roomId);
                console.log(`[TowerOfHanoi] Room ${roomId} deleted due to all players leaving`);
            } else {
                // Determine who left to announce the winner
                const playerRoleThatLeft = indexToRemove === 0 ? 'Player1' : 'Player2';
                const winnerRole = playerRoleThatLeft === 'Player1' ? 'Player2' : 'Player1';

                room.gameState.gameOver = true;
                room.gameState.winner = winnerRole;
                this.io.to(roomId).emit('show result', {
                    winner: room.gameState.winner,
                    moves: room.gameState.moves,
                });
                this.io.to(roomId).emit('opponentDisconnected', {
                    message: `Opponent (${playerRoleThatLeft}) left the game. You win!`,
                });
            }

            callback({ success: true });
        } catch (error) {
            callback({ error: error.message });
            console.error('[TowerOfHanoi LEAVE GAME ERROR]', error);
        }
    }

    handleDisconnect(socket) {
        this.activeConnections.delete(socket.id);
        for (const [roomId, room] of this.rooms.entries()) {
            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                // If P1 disconnects, we need to shift P2 to P1's index if P2 exists, or just remove P1.
                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                    console.log(`[TowerOfHanoi] Room ${roomId} deleted due to all players disconnecting`);
                } else {
                    // Announce the winner if the opponent disconnected
                    const playerRoleThatLeft = playerIndex === 0 ? 'Player1' : 'Player2';
                    const winnerRole = playerRoleThatLeft === 'Player1' ? 'Player2' : 'Player1';

                    room.gameState.gameOver = true;
                    room.gameState.winner = winnerRole;
                    this.io.to(roomId).emit('show result', {
                        winner: room.gameState.winner,
                        moves: room.gameState.moves,
                    });
                    this.io.to(roomId).emit('opponentDisconnected', {
                        message: `Opponent (${playerRoleThatLeft}) disconnected. You win!`,
                    });
                    console.log(`[TowerOfHanoi] Player ${socket.id} disconnected from room ${roomId}`);
                }
                break;
            }
        }
    }
}

module.exports = TowerOfHanoi;