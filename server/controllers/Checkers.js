const { v4: uuidv4 } = require('uuid');

class CheckersController {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.activeConnections = new Map();
    this.waitingPlayers = new Map(); // For matchmaking

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

      console.log(`[Checkers] New connection: ${socket.id} from ${socket.handshake.address}`);
    });
  }

  // Initialize a new game state
  initializeGameState(size, difficulty, player1Color, player2Color) {
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
      gameState: 'waiting', // waiting, playing, finished
      winner: null,
      moveHistory: [],
      size,
      difficulty,
      createdAt: new Date()
    };
  }

  // Initialize the board with pieces
  initializeBoard(size, player1Color, player2Color) {
    const board = Array(size).fill(null).map(() => Array(size).fill(null));
    const rowsPerPlayer = size === 8 ? 3 : 4;

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

    return board;
  }

  // Create a new game room
  createRoom(socket, { size = 8, difficulty = 'medium', playerName, color }, callback = () => {}) {
    try {
      const roomId = uuidv4();
      const opponentColor = color === 'red' ? 'black' : 'red';
      
      const gameState = this.initializeGameState(size, difficulty, color, opponentColor);
      
      this.rooms.set(roomId, {
        players: [{ socketId: socket.id, playerName, role: 'player1' }],
        gameState,
        settings: { size, difficulty }
      });

      socket.join(roomId);
      console.log(`[Checkers] Room ${roomId} created by ${socket.id} (${playerName})`);

      callback({
        success: true,
        roomId,
        playerRole: 'player1',
        gameState
      });

      // Notify player that room was created (waiting for opponent)
      socket.emit('room_created', {
        roomId,
        playerRole: 'player1',
        settings: { size, difficulty }
      });
    } catch (error) {
      callback({ error: error.message });
      console.error('[Checkers CREATE ROOM ERROR]', error);
    }
  }

  // Join an existing room
  joinRoom(socket, { roomId, playerName }, callback = () => {}) {
    try {
      if (!roomId) {
        callback({ error: 'Room ID is required' });
        return;
      }

      const room = this.rooms.get(roomId);
      if (!room) {
        callback({ error: 'Room does not exist' });
        return;
      }

      if (room.players.length >= 2) {
        callback({ error: 'Room is full' });
        return;
      }

      // Add second player
      const player2Color = room.gameState.players.player1.color === 'red' ? 'black' : 'red';
      room.gameState.players.player2.color = player2Color;
      room.players.push({ socketId: socket.id, playerName, role: 'player2' });
      
      // Update game state to start playing
      room.gameState.gameState = 'playing';
      
      socket.join(roomId);
      console.log(`[Checkers] Player ${socket.id} (${playerName}) joined room ${roomId}`);

      callback({
        success: true,
        roomId,
        playerRole: 'player2',
        gameState: room.gameState
      });

      // Notify both players that game is starting
      this.io.to(roomId).emit('game_start', {
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

  // Handle player selecting a piece
  handleSelectPiece(socket, { roomId, row, col }) {
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

    const piece = room.gameState.board[row][col];
    if (!piece || piece.player !== player.role) {
      socket.emit('error', { message: 'Invalid piece selection' });
      return;
    }

    // Calculate valid moves for this piece
    const validMoves = this.calculateValidMoves(
      room.gameState.board, 
      row, 
      col, 
      room.gameState.size,
      player.role
    );

    if (validMoves.length === 0) {
      socket.emit('error', { message: 'No valid moves for this piece' });
      return;
    }

    // Update game state
    room.gameState.selectedPiece = { row, col };
    room.gameState.validMoves = validMoves;

    // Notify both players
    this.io.to(roomId).emit('piece_selected', {
      selectedPiece: { row, col },
      validMoves,
      currentPlayer: player.role
    });
  }

  // Handle player making a move
  handleMove(socket, { roomId, toRow, toCol }) {
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

    const { selectedPiece, validMoves, board } = room.gameState;
    if (!selectedPiece) {
      socket.emit('error', { message: 'No piece selected' });
      return;
    }

    // Check if move is valid
    const move = validMoves.find(m => 
      m.to.row === toRow && m.to.col === toCol
    );

    if (!move) {
      socket.emit('error', { message: 'Invalid move' });
      return;
    }

    // Apply the move to the board
    const newBoard = this.applyMove(
      board, 
      move, 
      room.gameState.size
    );

    // Update game state
    room.gameState.board = newBoard;
    room.gameState.selectedPiece = null;
    room.gameState.validMoves = [];
    room.gameState.moveHistory.push({
      player: player.role,
      from: move.from,
      to: move.to,
      jumped: move.jumped,
      timestamp: new Date()
    });

    // Check for promotion to king
    const movedPiece = newBoard[toRow][toCol];
    if (movedPiece) {
      if (player.role === 'player1' && toRow === 0) {
        movedPiece.isKing = true;
        room.gameState.players.player1.hasKing = true;
      } else if (player.role === 'player2' && toRow === room.gameState.size - 1) {
        movedPiece.isKing = true;
        room.gameState.players.player2.hasKing = true;
      }
    }

    // Update piece counts if captures occurred
    if (move.jumped.length > 0) {
      const opponentRole = player.role === 'player1' ? 'player2' : 'player1';
      room.gameState.players[opponentRole].remainingPieces -= move.jumped.length;
    }

    // Check for game over
    const gameOverInfo = this.checkGameOver(newBoard, room.gameState);
    if (gameOverInfo.isOver) {
      room.gameState.gameState = 'finished';
      room.gameState.winner = gameOverInfo.winner;
    } else {
      // Switch turns if no additional jumps available
      if (!this.hasAdditionalJumps(newBoard, toRow, toCol, room.gameState.size, player.role)) {
        room.gameState.currentPlayer = player.role === 'player1' ? 'player2' : 'player1';
      }
    }

    // Broadcast updated game state
    this.io.to(roomId).emit('move_made', {
      board: newBoard,
      move,
      currentPlayer: room.gameState.currentPlayer,
      players: room.gameState.players,
      gameState: room.gameState.gameState,
      winner: room.gameState.winner
    });

    console.log(`[Checkers] Move by ${player.playerName} in room ${roomId}: from [${move.from.row},${move.from.col}] to [${toRow},${toCol}]`);
  }

  // Calculate all valid moves for a piece
  calculateValidMoves(board, row, col, size, playerRole) {
    const piece = board[row][col];
    if (!piece || piece.player !== playerRole) return [];

    // Check for jump moves first (captures are mandatory)
    const jumpMoves = this.getJumpMoves(board, row, col, size, playerRole);
    if (jumpMoves.length > 0) return jumpMoves;

    // If no jumps available, return normal moves
    return this.getNormalMoves(board, row, col, size, playerRole);
  }

  // Get all possible jump moves for a piece
  getJumpMoves(board, row, col, size, playerRole) {
    const piece = board[row][col];
    if (!piece) return [];

    const directions = piece.isKing ? 
      [[-1,-1], [-1,1], [1,-1], [1,1]] : // Kings can move in all directions
      playerRole === 'player1' ? 
        [[-1,-1], [-1,1]] : // Player1 moves upward
        [[1,-1], [1,1]];    // Player2 moves downward

    const jumps = [];

    for (const [dr, dc] of directions) {
      const midRow = row + dr;
      const midCol = col + dc;
      const landRow = row + 2 * dr;
      const landCol = col + 2 * dc;

      if (this.isValidPosition(landRow, landCol, size) && 
          this.isValidPosition(midRow, midCol, size)) {
        const midPiece = board[midRow][midCol];
        const landPiece = board[landRow][landCol];

        if (midPiece && midPiece.player !== playerRole && !landPiece) {
          // Found a jump - check for multi-jumps
          const newBoard = this.applyMoveSync(board, {
            from: { row, col },
            to: { row: landRow, col: landCol },
            jumped: [{ row: midRow, col: midCol }]
          }, size);

          const furtherJumps = this.getJumpMoves(
            newBoard, 
            landRow, 
            landCol, 
            size, 
            playerRole
          );

          if (furtherJumps.length > 0) {
            // Add multi-jumps
            jumps.push(...furtherJumps.map(j => ({
              from: { row, col },
              to: j.to,
              jumped: [{ row: midRow, col: midCol }, ...j.jumped]
            })));
          } else {
            // Add single jump
            jumps.push({
              from: { row, col },
              to: { row: landRow, col: landCol },
              jumped: [{ row: midRow, col: midCol }]
            });
          }
        }
      }
    }

    return jumps;
  }

  // Get all normal (non-capture) moves for a piece
  getNormalMoves(board, row, col, size, playerRole) {
    const piece = board[row][col];
    if (!piece) return [];

    const directions = piece.isKing ? 
      [[-1,-1], [-1,1], [1,-1], [1,1]] : // Kings can move in all directions
      playerRole === 'player1' ? 
        [[-1,-1], [-1,1]] : // Player1 moves upward
        [[1,-1], [1,1]];    // Player2 moves downward

    const moves = [];

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;

      if (this.isValidPosition(newRow, newCol, size)) {
        if (!board[newRow][newCol]) {
          moves.push({
            from: { row, col },
            to: { row: newRow, col: newCol },
            jumped: []
          });
        }
      }
    }

    return moves;
  }

  // Apply a move to the board (sync version)
  applyMoveSync(board, move, size) {
    const newBoard = this.copyBoard(board);
    const { from, to, jumped } = move;
    const piece = newBoard[from.row][from.col];

    // Move the piece
    newBoard[from.row][from.col] = null;
    newBoard[to.row][to.col] = piece;

    // Remove captured pieces
    for (const { row, col } of jumped) {
      newBoard[row][col] = null;
    }

    return newBoard;
  }

  // Apply a move to the board (with animation support)
  applyMove(board, move, size) {
    return this.applyMoveSync(board, move, size);
  }

  // Check if position is valid
  isValidPosition(row, col, size) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  // Create a deep copy of the board
  copyBoard(board) {
    return board.map(row => row.map(piece => piece ? { ...piece } : null));
  }

  // Check if there are additional jumps available from a position
  hasAdditionalJumps(board, row, col, size, playerRole) {
    const jumps = this.getJumpMoves(board, row, col, size, playerRole);
    return jumps.length > 0;
  }

  // Check if the game is over
  checkGameOver(board, gameState) {
    // Check if either player has no pieces left
    if (gameState.players.player1.remainingPieces <= 0) {
      return { isOver: true, winner: 'player2' };
    }
    if (gameState.players.player2.remainingPieces <= 0) {
      return { isOver: true, winner: 'player1' };
    }

    // Check if current player has any valid moves
    const currentPlayer = gameState.currentPlayer;
    const hasMoves = this.playerHasValidMoves(board, gameState.size, currentPlayer);
    
    if (!hasMoves) {
      return { 
        isOver: true, 
        winner: currentPlayer === 'player1' ? 'player2' : 'player1' 
      };
    }

    // Check for draw conditions (40 moves without capture)
    if (gameState.moveHistory.length >= 40) {
      const lastCaptures = gameState.moveHistory.slice(-40).filter(m => m.jumped.length > 0);
      if (lastCaptures.length === 0) {
        return { isOver: true, winner: null }; // Draw
      }
    }

    return { isOver: false };
  }

  // Check if a player has any valid moves
  playerHasValidMoves(board, size, playerRole) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = board[row][col];
        if (piece && piece.player === playerRole) {
          const moves = this.calculateValidMoves(board, row, col, size, playerRole);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  }

  // Handle player disconnection
  handleDisconnect(socket) {
    this.activeConnections.delete(socket.id);
    
    // Find and clean up any rooms this player was in
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        
        // Notify other player if game was in progress
        if (room.gameState.gameState === 'playing') {
          room.gameState.gameState = 'finished';
          room.gameState.winner = player.role === 'player1' ? 'player2' : 'player1';
          
          this.io.to(roomId).emit('player_disconnected', {
            message: `${player.playerName} disconnected`,
            winner: room.gameState.winner
          });
        }
        
        // Remove player from room
        room.players.splice(playerIndex, 1);
        
        // Clean up empty rooms
        if (room.players.length === 0) {
          this.rooms.delete(roomId);
          console.log(`[Checkers] Room ${roomId} deleted due to all players disconnecting`);
        }
        
        console.log(`[Checkers] Player ${socket.id} (${player.playerName}) disconnected from room ${roomId}`);
        break;
      }
    }
  }

  // Handle player surrender
  handleSurrender(socket, { roomId }) {
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

    room.gameState.gameState = 'finished';
    room.gameState.winner = player.role === 'player1' ? 'player2' : 'player1';

    this.io.to(roomId).emit('game_over', {
      winner: room.gameState.winner,
      reason: `${player.playerName} surrendered`
    });

    console.log(`[Checkers] Player ${player.playerName} surrendered in room ${roomId}`);
  }

  // Handle rematch request
  handleRematch(socket, { roomId }) {
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

    // Check if both players want a rematch
    if (room.rematchRequests.size === 2) {
      // Swap colors for the new game
      const player1Color = room.gameState.players.player2.color;
      const player2Color = room.gameState.players.player1.color;
      
      const newGameState = this.initializeGameState(
        room.gameState.size,
        room.settings.difficulty,
        player1Color,
        player2Color
      );
      
      room.gameState = newGameState;
      room.rematchRequests.clear();

      this.io.to(roomId).emit('rematch_accepted', {
        gameState: newGameState
      });
    } else {
      // Notify other player about rematch request
      this.io.to(roomId).emit('rematch_requested', {
        playerName: player.playerName
      });
    }
  }
}

module.exports = CheckersController;