const { v4: uuidv4 } = require('uuid');

// Reusing helper functions from the React Native LetterQuest component
const wordsDictionary = {
    5: ['table', 'chair', 'apple', 'house', 'water'],
    6: ['coffee', 'garden', 'window', 'pencil', 'camera'],
    7: ['diamond', 'emerald', 'crystal', 'morning', 'evening'],
    8: ['computer', 'keyboard', 'internet', 'software', 'mountain'],
    9: ['breakfast', 'furniture', 'vegetable', 'apartment', 'telephone'],
    10: ['basketball', 'volleyball', 'technology', 'university', 'government'],
};

function checkGuess(guess, target) {
    const result = [];
    const targetLetters = target.split('');
    const guessLetters = guess.split('');

    const letterCount = {};
    for (const c of targetLetters) {
        letterCount[c] = (letterCount[c] || 0) + 1;
    }

    for (let i = 0; i < guessLetters.length; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            result.push({ letter: guessLetters[i], status: 'correct' });
            letterCount[guessLetters[i]]--;
        } else {
            result.push({ letter: guessLetters[i], status: 'absent' });
        }
    }

    for (let i = 0; i < guessLetters.length; i++) {
        if (result[i].status === 'absent') {
            const letter = guessLetters[i];
            if (letterCount[letter] && letterCount[letter] > 0) {
                result[i].status = 'present';
                letterCount[letter]--;
            }
        }
    }

    return result;
}

function getStatusPriority(status) {
    switch (status) {
        case 'correct':
            return 3;
        case 'present':
            return 2;
        case 'absent':
            return 1;
        default:
            return 0;
    }
}

class LetterQuest {
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

            console.log(`[LetterQuest] New connection: ${socket.id} from ${socket.handshake.address}`);
        });
    }

    createRoom(socket, data, callback = () => {}) {
        try {
            const { roomId: clientRoomId, playerName, letters = 5, tries = 6 } = data || {};
            const roomId = clientRoomId || uuidv4();

            if (this.rooms.has(roomId)) {
                callback({ error: 'Room already exists' });
                return;
            }

            const wordList = wordsDictionary[letters] || [];
            if (wordList.length === 0) {
                callback({ error: `No words available for ${letters} letters` });
                return;
            }
            const targetWord = wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
            const gameState = this.initializeGameState(letters, tries, targetWord);

            this.rooms.set(roomId, {
                players: [{ socketId: socket.id, playerName: playerName || 'Player 1' }],
                gameState,
                currentPlayerIndex: 0,
            });

            socket.join(roomId);
            console.log(`[LetterQuest] Room ${roomId} created by ${socket.id} (${playerName}) with ${letters} letters and ${tries} tries`);

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
            console.error('[LetterQuest CREATE ROOM ERROR]', error);
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
            console.log(`[LetterQuest] Player ${socket.id} (${playerName}) joined room ${roomId}`);

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
            console.error('[LetterQuest JOIN ROOM ERROR]', error);
        }
    }

    handleMove(socket, { roomId, guess }, callback = () => {}) {
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
            if (guess.length !== gameState.letters) {
                const errorMsg = `Guess must be ${gameState.letters} letters long`;
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            const guessLower = guess.toLowerCase();
            if (!wordsDictionary[gameState.letters].includes(guessLower)) {
                const errorMsg = 'Invalid word';
                socket.emit('moveError', { message: errorMsg });
                callback({ error: errorMsg });
                return;
            }

            gameState.guesses.push(guessLower);
            const results = checkGuess(guessLower, gameState.targetWord);

            // Update letterStatusMap
            const letterStatusMap = { ...gameState.letterStatusMap };
            results.forEach(({ letter, status }) => {
                const lower = letter.toLowerCase();
                const currentStatus = letterStatusMap[lower] || 'unused';
                if (getStatusPriority(status) > getStatusPriority(currentStatus)) {
                    letterStatusMap[lower] = status;
                }
            });
            gameState.letterStatusMap = letterStatusMap;

            if (guessLower === gameState.targetWord) {
                gameState.gameOver = true;
                gameState.message = 'You Win!';
                gameState.winner = 'Both Players';
            } else if (gameState.guesses.length >= gameState.tries) {
                gameState.gameOver = true;
                gameState.message = `Game Over! The word was "${gameState.targetWord}".`;
                gameState.winner = null;
            }

            room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
            gameState.currentPlayer = room.players[room.currentPlayerIndex].playerName;

            this.io.to(roomId).emit('gameUpdate', {
                gameState,
                currentPlayer: gameState.currentPlayer,
            });

            callback({ success: true, gameState, currentPlayer: gameState.currentPlayer });
        } catch (error) {
            console.error('[LetterQuest HANDLE MOVE ERROR]', error);
            socket.emit('moveError', { message: 'Server error' });
            callback({ error: 'Server error' });
        }
    }

    handleRestart(socket, { roomId }) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const { letters, tries } = room.gameState;
        const wordList = wordsDictionary[letters] || [];
        if (wordList.length === 0) return;
        const targetWord = wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
        room.gameState = this.initializeGameState(letters, tries, targetWord);
        room.currentPlayerIndex = 0;
        room.gameState.currentPlayer = room.players[0].playerName;

        this.io.to(roomId).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.gameState.currentPlayer,
        });

        console.log(`[LetterQuest] Room ${roomId} restarted`);
    }

    handleDisconnect(socket) {
        this.activeConnections.delete(socket.id);
        for (const [roomId, room] of this.rooms.entries()) {
            const playerIndex = room.players.findIndex(player => player.socketId === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    this.rooms.delete(roomId);
                    console.log(`[LetterQuest] Room ${roomId} deleted due to all players disconnecting`);
                } else {
                    this.io.to(roomId).emit('playerDisconnected', {
                        message: 'Opponent disconnected',
                    });
                    console.log(`[LetterQuest] Player ${socket.id} disconnected from room ${roomId}`);
                }
                break;
            }
        }
    }

    initializeGameState(letters, tries, targetWord) {
        return {
            letters,
            tries,
            targetWord,
            guesses: [],
            letterStatusMap: {},
            gameOver: false,
            message: '',
            winner: null,
            currentPlayer: null, // Set after player assignment
        };
    }
}

module.exports = LetterQuest;