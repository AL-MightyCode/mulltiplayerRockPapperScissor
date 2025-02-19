const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = {};

function determineWinner(player1Choice, player2Choice) {
    const winConditions = {
        'rock': 'scissors',
        'paper': 'rock',
        'scissors': 'paper'
    };

    if (player1Choice === player2Choice) return 'Tie';
    return winConditions[player1Choice] === player2Choice ? 'Player 1 Wins' : 'Player 2 Wins';
}

function isGameOver(scores) {
    return scores.player1 === 3 || scores.player2 === 3;
}

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join_room', (data) => {
        const { playerName, roomId } = data;
        
        // Validate input
        if (!playerName || !roomId) {
            socket.emit('room_error', 'Player name and Room ID are required');
            return;
        }

        // Sanitize input
        const sanitizedPlayerName = playerName.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20);
        const sanitizedRoomId = roomId.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20);

        // Check if room already exists and is full
        if (rooms[sanitizedRoomId] && rooms[sanitizedRoomId].players.length >= 2) {
            socket.emit('room_error', 'Room is already full');
            return;
        }

        // Check if player name is already in use in this room
        if (rooms[sanitizedRoomId] && 
            rooms[sanitizedRoomId].players.some(p => p.name === sanitizedPlayerName)) {
            socket.emit('room_error', 'Player name is already in use in this room');
            return;
        }
        
        // Create room if it doesn't exist
        if (!rooms[sanitizedRoomId]) {
            rooms[sanitizedRoomId] = {
                players: [],
                choices: {},
                scores: { player1: 0, player2: 0 },
                readyToRestart: [],
                createdAt: Date.now()
            };
        }

        const room = rooms[sanitizedRoomId];

        // Add player to room
        const playerNumber = room.players.length + 1;
        const playerInfo = { 
            id: socket.id, 
            name: sanitizedPlayerName, 
            number: playerNumber,
            joinedAt: Date.now()
        };

        room.players.push(playerInfo);
        socket.join(sanitizedRoomId);

        // Broadcast room update
        io.to(sanitizedRoomId).emit('room_update', { 
            playerCount: room.players.length,
            players: room.players.map(p => p.name)
        });

        // Start game if room is full
        if (room.players.length === 2) {
            // Add a small delay to ensure both players are fully connected
            setTimeout(() => {
                io.to(sanitizedRoomId).emit('game_start');
            }, 500);
        }
    });

    socket.on('player_choice', (data) => {
        const { roomId, choice, choiceLabel, playerName } = data;
        const room = rooms[roomId];
        
        if (room) {
            // Determine player number
            const playerIndex = room.players.findIndex(p => p.name === playerName);
            const playerKey = playerIndex === 0 ? 'player1' : 'player2';

            // Store choice with label
            room.choices[playerKey] = {
                choice: choice,
                choiceLabel: choiceLabel,
                playerName: playerName
            };

            // Check if both players have made their choices
            if (Object.keys(room.choices).length === 2) {
                const player1Choice = room.choices.player1;
                const player2Choice = room.choices.player2;

                // Determine winner
                const winResult = determineWinner(player1Choice.choice, player2Choice.choice);
                
                // Update scores
                if (winResult === 'Player 1 Wins') {
                    room.scores.player1++;
                } else if (winResult === 'Player 2 Wins') {
                    room.scores.player2++;
                }

                // Prepare game result
                const gameResult = {
                    player1Choice: player1Choice.choiceLabel,
                    player2Choice: player2Choice.choiceLabel,
                    player1Name: player1Choice.playerName,
                    player2Name: player2Choice.playerName,
                    winner: winResult,
                    scores: room.scores,
                    gameOver: isGameOver(room.scores)
                };

                // If game is over, determine final winner
                if (gameResult.gameOver) {
                    gameResult.finalWinner = room.scores.player1 > room.scores.player2 
                        ? room.players[0].name 
                        : room.players[1].name;
                }

                // Emit result to room
                io.to(roomId).emit('game_result', gameResult);

                // Reset choices for next round
                room.choices = {};
            }
        }
    });

    socket.on('player_ready_to_restart', (data) => {
        const { roomId, resetPoints } = data;
        const room = rooms[roomId];
        
        if (room) {
            // Add player's socket ID to ready list if not already there
            if (!room.readyToRestart.includes(socket.id)) {
                room.readyToRestart.push(socket.id);
            }

            // Check if both players are ready
            if (room.readyToRestart.length === 2) {
                // Reset game state
                room.choices = {};
                
                // Reset scores if requested
                if (resetPoints) {
                    room.scores = { player1: 0, player2: 0 };
                }
                
                room.readyToRestart = []; // Reset ready status

                // Notify both players that game can restart
                io.to(roomId).emit('restart_game_status', { 
                    bothReady: true,
                    resetPoints: resetPoints
                });
            }
        }
    });

    socket.on('restart_match', (data) => {
        const { roomId, playerName } = data;
        const room = rooms[roomId];

        if (room) {
            // Reset room state
            room.choices = {};
            room.scores = { player1: 0, player2: 0 };
            room.readyToRestart = [];

            // Notify all players in the room that match is restarted
            io.to(roomId).emit('match_restarted', {
                message: 'Match restarted',
                players: room.players.map(p => p.name)
            });
        }
    });

    socket.on('leave_room', (data) => {
        const { roomId, playerName } = data;
        const room = rooms[roomId];

        if (room) {
            // Remove the player from the room
            room.players = room.players.filter(p => p.name !== playerName);

            // If room is empty, delete it
            if (room.players.length === 0) {
                delete rooms[roomId];
            }

            // Notify the player that they've left the room
            socket.emit('room_left', {
                message: 'Left room successfully'
            });
        }
    });

    socket.on('delete_room', (data) => {
        const { roomId } = data;
        
        if (rooms[roomId]) {
            // Remove the room
            delete rooms[roomId];
            
            // Notify all clients in the room to reset
            io.to(roomId).emit('room_deleted');
        }
    });

    socket.on('disconnect', () => {
        // Clean up rooms where this socket was a player
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                // Remove the player from the room
                room.players.splice(playerIndex, 1);
                
                // If room is now empty, delete it
                if (room.players.length === 0) {
                    delete rooms[roomId];
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
