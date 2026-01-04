const { v4: uuidv4 } = require('uuid');

class CheckersController {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.activeConnections = new Map();
    this.cleanupTimeouts = new Map(); // Store timeouts for room deletion

    io.on('connection', (socket) => {
      if (this.activeConnections.has(socket.id)) {
        socket.disconnect(true);
        return;
      }

      this.activeConnections.set(socket.id, {
        ip: socket.handshake.address,
        connectedAt: new Date(),
      });

      console.log(`[Checkers] New connection: ${socket.id} from ${socket.handshake.address}`);
    });
  }

  // --- ROOM MANAGEMENT ---

  // *** THIS IS THE FIX ***
  // 1. Added 'roomId' to the destructured parameters
  createRoom(socket, { roomId, size = 8, difficulty = 'medium', playerName, color }, callback = () => { }) {
    try {
      // 2. Removed the line that generated a new uuid
      // const roomId = uuidv4(); // <-- BUGGY LINE REMOVED

      // 3. Added a check in case the roomId wasn't passed from index.js
      // 3. Generate roomId if not provided (Fallback for robustness)
      if (!roomId) {
        // console.error('[Checkers CREATE ROOM ERROR] Room ID was not provided by index.js');
        // callback({ error: 'Room ID was not provided' });
        // return;
        roomId = uuidv4(); // Auto-generate if missing
        console.log(`[Checkers] Generated new roomId: ${roomId}`);
      }

      // Check if room already exists (e.g., from a stale state)
      if (this.rooms.has(roomId)) {
        console.warn(`[Checkers] Room ${roomId} already exists. Player ${socket.id} might be reconnecting or this is a stale request.`);
        // You could either reject, or attempt to re-join. For now, we'll reject.
        callback({ error: 'Room already exists. Try a different ID.' });
        return;
      }

      const opponentColor = color === 'red' ? 'black' : 'red';

      // We initialize the game with player1's chosen color
      const gameState = this.initializeGameState(size, color, opponentColor);

      this.rooms.set(roomId, {
        players: [{ socketId: socket.id, playerName, role: 'player1' }],
        gameState,
        settings: { size }
      });

      socket.join(roomId);
      console.log(`[Checkers] Room ${roomId} created by ${socket.id} (${playerName})`);

      callback({
        success: true,
        roomId,
        playerRole: 'player1',
        gameState
      });

    } catch (error) {
      callback({ error: error.message });
      console.error('[Checkers CREATE ROOM ERROR]', error);
    }
  }

  joinRoom(socket, { roomId, playerName }, callback = () => { }) {
    try {
      if (!roomId) {
        callback({ error: 'Room ID is required' });
        return;
      }

      // 1. Try direct match
      let room = this.rooms.get(roomId);
      let actualRoomId = roomId;

      // 2. If not found, try case-insensitive match (Fix for "Room doesn't exist")
      if (!room) {
        const normalizedId = roomId.toUpperCase();
        for (const [key, value] of this.rooms.entries()) {
          if (key.toUpperCase() === normalizedId) {
            room = value;
            actualRoomId = key;
            break;
          }
        }
      }

      if (!room) {
        console.log(`[Checkers JOIN FAILED] Room "${roomId}" not found. Available rooms:`, Array.from(this.rooms.keys()));
        callback({ error: 'Room does not exist' });
        return;
      }

      // If room is marked for deletion, cancel it because someone joined/reconnected
      if (this.cleanupTimeouts.has(actualRoomId)) {
        clearTimeout(this.cleanupTimeouts.get(actualRoomId));
        this.cleanupTimeouts.delete(actualRoomId);
        console.log(`[Checkers] Room ${actualRoomId} deletion cancelled`);
      }

      if (room.players.length >= 2) {
        callback({ error: 'Room is full' });
        return;
      }

      // Determine Player 2's color based on Player 1's
      const player1Color = room.gameState.players.player1.color;
      const player2Color = player1Color === 'red' ? 'black' : 'red';
      room.gameState.players.player2.color = player2Color;

      // Re-initialize the board with the correct colors now that both are set
      room.gameState.board = this.initializeBoard(room.gameState.size, player1Color, player2Color);


      // Add second player
      room.players.push({ socketId: socket.id, playerName, role: 'player2' });

      // Update game state to start playing
      room.gameState.gameState = 'playing';

      socket.join(actualRoomId);
      console.log(`[Checkers] Player ${socket.id} (${playerName}) joined room ${actualRoomId}`);

      callback({
        success: true,
        roomId,
        playerRole: 'player2',
        gameState: room.gameState
      });

      // Notify both players that game is starting
      this.io.to(actualRoomId).emit('game_start', {
        gameState: room.gameState,
        players: room.players.map(p => ({
          playerName: p.playerName,
          role: p.role
        }))
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[Checkers JOIN ROOM ERROR]', error);
    }
  }

  // --- EVENT HANDLERS (Matching Client) ---

  // Client emits 'makeMove', server listens for 'makeMove'
  makeMove(socket, { roomId, move }, callback = () => { }) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState.gameState !== 'playing') {
      socket.emit('error', { message: 'Game not active' });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not in room' });
      return;
    }

    // Check if it's this player's turn
    if (room.gameState.currentPlayer !== player.role) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // --- Validate the move (CRITICAL) ---
    // Recalculate valid moves on the server to prevent cheating
    const { from } = move;
    const serverValidMoves = this.calculateValidMoves(
      room.gameState.board,
      from.row,
      from.col,
      room.gameState.size,
      player.role
    );

    const isValid = serverValidMoves.some(m =>
      m.to.row === move.to.row && m.to.col === move.to.col && m.jumped.length === move.jumped.length
    );

    if (!isValid) {
      socket.emit('error', { message: 'Invalid or tampered move' });
      console.log(`[Checkers] Invalid move rejected for ${player.playerName} in room ${roomId}`);
      return;
    }

    let message = '';
    const originalPiece = room.gameState.board[move.from.row][move.from.col];

    // Apply the move to the board
    const newBoard = this.applyMoveSync(
      room.gameState.board,
      move,
      room.gameState.size
    );

    // Update game state
    room.gameState.board = newBoard;
    room.gameState.selectedPiece = null;
    room.gameState.validMoves = [];
    room.gameState.moveHistory.push({
      player: player.role,
      ...move,
      timestamp: new Date()
    });

    // Check for promotion to king
    const movedPiece = newBoard[move.to.row][move.to.col];
    if (movedPiece) {
      const becameKing = !originalPiece?.isKing && movedPiece.isKing;
      if (becameKing) {
        room.gameState.players[player.role].hasKing = true;
        message = `${player.playerName} promoted a piece to King!`;
      }
    }

    // Update piece counts if captures occurred
    if (move.jumped.length > 0) {
      const opponentRole = player.role === 'player1' ? 'player2' : 'player1';
      room.gameState.players[opponentRole].remainingPieces -= move.jumped.length;
      message = `${player.playerName} captured ${move.jumped.length} piece(s)!`;
    }

    // Check for game over
    const gameOverInfo = this.checkGameOver(newBoard, room.gameState);
    if (gameOverInfo.isOver) {
      room.gameState.gameState = 'finished';
      room.gameState.winner = gameOverInfo.winner;
    } else {
      // Switch turns (In Checkers, you only switch if you can't make another jump)
      const hasMoreJumps = move.jumped.length > 0 && this.getMultiJumpMoves(newBoard, move.to.row, move.to.col, movedPiece, room.gameState.size).length > 0;

      if (!hasMoreJumps) {
        room.gameState.currentPlayer = player.role === 'player1' ? 'player2' : 'player1';
      }
      // If hasMoreJumps is true, it remains this player's turn
    }

    // Broadcast updated game state
    // Client listens for 'game_update'
    this.io.to(roomId).emit('game_update', {
      gameState: room.gameState,
      message
    });

    console.log(`[Checkers] Move by ${player.playerName} in room ${roomId}: from [${move.from.row},${move.from.col}] to [${move.to.row},${move.to.col}]`);
    callback({ success: true, gameState: room.gameState });
  }

  // Client emits 'resetGame', server listens for 'resetGame'
  resetGame(socket, { roomId }) {
    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not in room' });
      return;
    }

    // Initialize rematch state
    if (!room.rematchRequests) {
      room.rematchRequests = new Set();
    }

    room.rematchRequests.add(player.role);
    console.log(`[Checkers] Rematch request from ${player.playerName} in room ${roomId}`);


    // Check if both players want a rematch
    if (room.rematchRequests.size === 2) {
      console.log(`[Checkers] Both players agreed to rematch in room ${roomId}`);
      // Swap colors for the new game
      const player1Color = room.gameState.players.player2.color;
      const player2Color = room.gameState.players.player1.color;

      const newGameState = this.initializeGameState(
        room.gameState.size,
        player1Color,
        player2Color
      );
      newGameState.gameState = 'playing'; // Start the game

      room.gameState = newGameState;
      room.rematchRequests.clear();

      // Client listens for 'game_reset'
      this.io.to(roomId).emit('game_reset', {
        gameState: newGameState
      });
    } else {
      // Notify other player about rematch request
      socket.to(roomId).emit('rematch_requested', {
        playerName: player.playerName
      });
    }
  }

  handleDisconnect(socket) {
    this.activeConnections.delete(socket.id);

    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];

        // Notify other player if game was in progress
        if (room.gameState.gameState === 'playing') {
          room.gameState.gameState = 'finished';
          room.gameState.winner = player.role === 'player1' ? 'player2' : 'player1';
        }

        // Clear any pending room deletion timeout if the player is rejoining or another player is still there
        if (this.cleanupTimeouts.has(roomId)) {
          clearTimeout(this.cleanupTimeouts.get(roomId));
          this.cleanupTimeouts.delete(roomId);
          console.log(`[Checkers] Cleared pending deletion for room ${roomId} as a player disconnected/reconnected.`);
        }

        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          // Grace period: Wait 60s before deleting the room in case of reconnect
          console.log(`[Checkers] Room ${roomId} is empty. Scheduling deletion in 60s...`);
          const timeoutId = setTimeout(() => {
            if (this.rooms.has(roomId) && this.rooms.get(roomId).players.length === 0) {
              this.rooms.delete(roomId);
              this.cleanupTimeouts.delete(roomId);
              console.log(`[Checkers] Room ${roomId} deleted due to inactivity`);
            }
          }, 60000);
          this.cleanupTimeouts.set(roomId, timeoutId);
        } else {
          this.io.to(roomId).emit('playerDisconnected', {
            message: 'A player disconnected',
            playerCount: room.players.length,
          });
          console.log(`[Checkers] Player ${socket.id} disconnected from room ${roomId}`);
        }
        break;
      }
    }
  }

  // --- GAME LOGIC (Must match client logic) ---

  initializeGameState(size, player1Color, player2Color) {
    return {
      board: this.initializeBoard(size, player1Color, player2Color),
      currentPlayer: 'player1', // Player1 always starts
      selectedPiece: null,
      validMoves: [],
      players: {
        player1: {
          color: player1Color,
          remainingPieces: size === 8 ? 12 : 20,
          hasKing: false
        },
        player2: {
          color: player2Color,
          remainingPieces: size === 8 ? 12 : 20,
          hasKing: false
        }
      },
      gameState: 'waiting',
      winner: null,
      moveHistory: [],
      size,
      createdAt: new Date()
    };
  }

  initializeBoard(size, player1Color, player2Color) {
    const board = Array(size).fill(null).map(() => Array(size).fill(null));
    const rowsPerPlayer = size === 8 ? 3 : 4;

    // Player 2 pieces (top rows)
    for (let row = 0; row < rowsPerPlayer; row++) {
      for (let col = 0; col < size; col++) {
        if ((row + col) % 2 === 1) {
          board[row][col] = {
            player: 'player2',
            color: player2Color,
            isKing: false
          };
        }
      }
    }

    // Player 1 pieces (bottom rows)
    for (let row = size - rowsPerPlayer; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if ((row + col) % 2 === 1) {
          board[row][col] = {
            player: 'player1',
            color: player1Color,
            isKing: false
          };
        }
      }
    }
    return board;
  }

  isValidPosition(row, col, size) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  copyBoard(board) {
    return board.map(row => row.map(piece => (piece ? { ...piece } : null)));
  }

  applyMoveSync(board, move, size) {
    const newBoard = this.copyBoard(board);
    const { from, to, jumped } = move;
    const piece = newBoard[from.row][from.col];
    if (!piece) return board; // Should not happen if move is valid

    // Move the piece
    newBoard[from.row][from.col] = null;
    newBoard[to.row][to.col] = piece;

    // Remove captured pieces
    for (const { row, col } of jumped) {
      newBoard[row][col] = null;
    }

    // Promotion logic
    if (piece.player === 'player1' && to.row === 0) piece.isKing = true;
    if (piece.player === 'player2' && to.row === size - 1) piece.isKing = true;

    return newBoard;
  }

  getImmediateJumpMoves(board, row, col, piece, size) {
    let moves = [];
    const playerRole = piece.player;

    const forwardDirections = (playerRole === 'player1')
      ? [[-1, -1], [-1, 1]]
      : [[1, -1], [1, 1]];

    const directions = piece.isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : forwardDirections;

    for (let [dr, dc] of directions) {
      const midRow = row + dr;
      const midCol = col + dc;
      const landingRow = row + 2 * dr;
      const landingCol = col + 2 * dc;

      if (
        this.isValidPosition(midRow, midCol, size) &&
        this.isValidPosition(landingRow, landingCol, size)
      ) {
        const midPiece = board[midRow][midCol];
        if (
          midPiece &&
          midPiece.player !== playerRole &&
          board[landingRow][landingCol] === null
        ) {
          moves.push({
            from: { row, col },
            to: { row: landingRow, col: landingCol },
            jumped: [{ row: midRow, col: midCol }],
          });
        }
      }
    }
    return moves;
  }

  getMultiJumpMoves(board, row, col, piece, size) {
    const immediateJumps = this.getImmediateJumpMoves(board, row, col, piece, size);
    let moves = [];

    for (let jump of immediateJumps) {
      const newBoard = this.applyMoveSync(board, jump, size);
      const newPiece = newBoard[jump.to.row][jump.to.col];
      if (!newPiece) continue;

      const promoted = (!piece.isKing && newPiece.isKing);

      if (promoted) {
        moves.push(jump); // King promotion ends the turn
        continue;
      }

      const furtherJumps = this.getMultiJumpMoves(
        newBoard,
        jump.to.row,
        jump.to.col,
        newPiece,
        size,
      );
      if (furtherJumps.length > 0) {
        for (let fj of furtherJumps) {
          moves.push({
            from: jump.from,
            to: fj.to,
            jumped: [...jump.jumped, ...fj.jumped],
          });
        }
      } else {
        moves.push(jump);
      }
    }
    return moves;
  }

  getNormalMoves(board, row, col, piece, size) {
    let moves = [];
    const playerRole = piece.player;

    const forwardDirections = (playerRole === 'player1')
      ? [[-1, -1], [-1, 1]]
      : [[1, -1], [1, 1]];

    const directions = piece.isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : forwardDirections;

    for (let [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (
        this.isValidPosition(newRow, newCol, size) &&
        board[newRow][newCol] === null
      ) {
        moves.push({
          from: { row, col },
          to: { row: newRow, col: newCol },
          jumped: [],
        });
      }
    }
    return moves;
  }

  // Gets all valid moves, respecting the "must jump" rule
  getAllValidMoves(board, playerRole, size) {
    let moves = [];
    let hasJumpMoves = false;

    // First, check if any jump moves are available for the player
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = board[row][col];
        if (piece && piece.player === playerRole) {
          const jumpMoves = this.getMultiJumpMoves(board, row, col, piece, size);
          if (jumpMoves.length > 0) {
            hasJumpMoves = true;
            moves.push(...jumpMoves);
          }
        }
      }
    }

    if (hasJumpMoves) {
      return moves;
    }

    // Otherwise, return all normal moves
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = board[row][col];
        if (piece && piece.player === playerRole) {
          moves.push(...this.getNormalMoves(board, row, col, piece, size));
        }
      }
    }
    return moves;
  }

  // This is the function the server calls to validate a *specific* piece's moves
  calculateValidMoves(board, row, col, size, playerRole) {
    const piece = board[row][col];
    if (!piece) return [];

    // Check if *any* piece for this player has a jump
    const allJumpsForPlayer = this.getAllValidMoves(board, playerRole, size).filter(m => m.jumped.length > 0);
    const jumpMovesForThisPiece = this.getMultiJumpMoves(board, row, col, piece, size);

    if (allJumpsForPlayer.length > 0) {
      return jumpMovesForThisPiece; // Only return jumps for this piece
    }

    return this.getNormalMoves(board, row, col, piece, size);
  }

  checkGameOver(board, gameState) {
    const currentPlayer = gameState.currentPlayer;
    const opponentPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';

    // Check if either player has no pieces left
    if (gameState.players.player1.remainingPieces <= 0) {
      return { isOver: true, winner: 'player2' };
    }
    if (gameState.players.player2.remainingPieces <= 0) {
      return { isOver: true, winner: 'player1' };
    }

    // Check if *next* player has any valid moves
    const nextPlayer = opponentPlayer;
    const hasMoves = this.playerHasValidMoves(board, gameState.size, nextPlayer);

    if (!hasMoves) {
      return {
        isOver: true,
        winner: currentPlayer // Current player wins because next player is blocked
      };
    }

    // Check for draw conditions (e.g., 40 moves without capture)
    if (gameState.moveHistory.length >= 40) {
      const last40Moves = gameState.moveHistory.slice(-40);
      const hasCapture = last40Moves.some(move => move.jumped.length > 0);

      if (!hasCapture) {
        return { isOver: true, winner: 'draw' }; // Draw
      }
    }

    return { isOver: false, winner: null };
  }

  playerHasValidMoves(board, size, playerRole) {
    const moves = this.getAllValidMoves(board, playerRole, size);
    return moves.length > 0;
  }
}

module.exports = CheckersController;