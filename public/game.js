const socket = io();

// Screen Elements
const screens = {
    setup: document.getElementById('setup-screen'),
    waiting: document.getElementById('waiting-screen'),
    countdown: document.getElementById('countdown-screen'),
    game: document.getElementById('game-screen'),
    gameOver: document.getElementById('game-over-screen')
};

// Player Elements
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const joinGameBtn = document.getElementById('join-game');

const player1DisplayName = document.getElementById('player1-display-name');
const player2DisplayName = document.getElementById('player2-display-name');
const player1ScoreDisplay = document.getElementById('player1-score');
const player2ScoreDisplay = document.getElementById('player2-score');

const player1ChoiceDisplay = document.getElementById('player1-choice-display');
const player2ChoiceDisplay = document.getElementById('player2-choice-display');
const gameStatus = document.getElementById('game-status');

const choiceWrappers = document.querySelectorAll('.choice-wrapper');
const restartMatchBtn = document.getElementById('restart-match-btn');
const newGameBtn = document.getElementById('new-game-btn');
const countdownDisplay = document.getElementById('countdown');
const playerCountDisplay = document.getElementById('player-count');

// Winner Announcement Elements
const winnerTitle = document.getElementById('winner-title');
const winnerNameDisplay = document.getElementById('winner-name');
const winnerMessageDisplay = document.getElementById('winner-message');

let currentPlayer = {
    name: '',
    number: null,
    roomId: null
};

let opponentPlayer = {
    name: '',
    number: null
};

// Game State Management
let gameState = {
    currentScreen: 'setup',
    isGameRunning: false,
    isGameOver: false
};

// Screen Switching Function
function switchScreen(targetScreen) {
    // Hide all screens
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });

    // Update current screen
    gameState.currentScreen = targetScreen.id;

    // Show target screen
    targetScreen.classList.add('active');

    // Manage game state
    gameState.isGameRunning = targetScreen === screens.game;
    gameState.isGameOver = targetScreen === screens.gameOver;

    // Hide game over actions if not in game over state
    if (!gameState.isGameOver) {
        hideGameOverActions();
    }
}

// Game Over and Restart Functionality
function hideGameOverActions() {
    restartMatchBtn.style.display = 'none';
    newGameBtn.style.display = 'none';
}

// Show restart and new game buttons when game is over
function showGameOverActions() {
    restartMatchBtn.style.display = 'block';
    newGameBtn.style.display = 'block';
}

// Initialize game over actions as hidden
hideGameOverActions();

function updatePlayerDisplay(player1Name, player2Name) {
    player1DisplayName.textContent = player1Name;
    player2DisplayName.textContent = player2Name;
}

function showPlayerChoice(playerNumber, choice) {
    const choiceDisplay = playerNumber === 1 ? player1ChoiceDisplay : player2ChoiceDisplay;
    const choiceIcon = choiceDisplay.querySelector('.choice-icon');
    const playerNameDisplay = choiceDisplay.querySelector('.player-name');

    choiceIcon.className = `choice-icon ${choice}`;
    playerNameDisplay.textContent = playerNumber === 1 ? currentPlayer.name : opponentPlayer.name;
    choiceDisplay.classList.add('active', 'rotated-choice');
}

function resetChoiceDisplays() {
    player1ChoiceDisplay.classList.remove('active', 'rotated-choice');
    player2ChoiceDisplay.classList.remove('active', 'rotated-choice', 'opponent');
}

function startCountdown() {
    switchScreen(screens.countdown);
    let count = 3;
    countdownDisplay.textContent = count;

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownDisplay.textContent = count;
        } else {
            clearInterval(countdownInterval);
            switchScreen(screens.game);
        }
    }, 1000);
}

// Player Setup Form Handling
const joinForm = document.getElementById('join-form');

// Prevent default touch behaviors
playerNameInput.addEventListener('touchstart', (e) => {
    e.stopPropagation();
});

roomIdInput.addEventListener('touchstart', (e) => {
    e.stopPropagation();
});

// Enhanced input validation and handling
function validateInput(input, minLength = 3, maxLength = 20) {
    const value = input.value.trim();
    
    // Remove any non-alphanumeric characters except underscores
    const sanitizedValue = value.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Update input value with sanitized version
    input.value = sanitizedValue;
    
    // Check length
    if (sanitizedValue.length < minLength) {
        input.setCustomValidity(`Must be at least ${minLength} characters`);
        return false;
    }
    
    if (sanitizedValue.length > maxLength) {
        input.setCustomValidity(`Cannot exceed ${maxLength} characters`);
        return false;
    }
    
    input.setCustomValidity('');
    return true;
}

// Add real-time validation
playerNameInput.addEventListener('input', () => {
    validateInput(playerNameInput);
});

roomIdInput.addEventListener('input', () => {
    validateInput(roomIdInput, 3, 20);
});

joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Reset game state
    gameState.isGameRunning = false;
    gameState.isGameOver = false;
    hideGameOverActions();

    // Validate inputs
    const isPlayerNameValid = validateInput(playerNameInput);
    const isRoomIdValid = validateInput(roomIdInput, 3, 20);

    if (!isPlayerNameValid || !isRoomIdValid) {
        return;
    }

    const playerName = playerNameInput.value.trim();
    let roomId = roomIdInput.value.trim();

    // Generate room ID if not provided
    if (!roomId) {
        roomId = `room_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Disable join button to prevent multiple submissions
    joinGameBtn.disabled = true;
    joinGameBtn.textContent = 'Joining...';

    // Blur inputs to dismiss mobile keyboard
    playerNameInput.blur();
    roomIdInput.blur();

    socket.emit('join_room', { 
        playerName: playerName, 
        roomId: roomId 
    });

    currentPlayer.name = playerName;
    currentPlayer.roomId = roomId;

    switchScreen(screens.waiting);
});

// Prevent default touch behaviors on the entire form
joinForm.addEventListener('touchstart', (e) => {
    e.stopPropagation();
});

socket.on('room_update', (data) => {
    playerCountDisplay.textContent = `${data.playerCount}/2 Players`;
    
    if (data.playerCount === 2) {
        updatePlayerDisplay(data.players[0], data.players[1]);
        opponentPlayer.name = data.players[0] === currentPlayer.name ? data.players[1] : data.players[0];
    }
});

socket.on('game_start', () => {
    // Reset game state when game starts
    gameState.isGameRunning = true;
    gameState.isGameOver = false;
    hideGameOverActions();
    startCountdown();
});

choiceWrappers.forEach(wrapper => {
    const choiceItem = wrapper.querySelector('.choice-item');
    const choiceLabel = wrapper.querySelector('.choice-label');

    choiceItem.addEventListener('click', () => {
        const choice = choiceItem.getAttribute('data-choice');
        
        // Disable all choices and add visual feedback
        choiceWrappers.forEach(w => {
            const item = w.querySelector('.choice-item');
            item.classList.add('disabled');
            if (w !== wrapper) {
                item.style.opacity = '0.5';
            }
        });

        socket.emit('player_choice', {
            choice: choice,
            choiceLabel: choiceLabel.textContent,
            roomId: currentPlayer.roomId,
            playerName: currentPlayer.name
        });
    });
});

// Congratulatory Messages
const congratsMessages = [
    "What an epic victory!",
    "You're the champion of Rock Paper Scissors!",
    "Absolutely dominating the game!",
    "Legendary performance!",
    "Master of strategy right here!"
];

socket.on('game_result', (data) => {
    // Reset previous state
    resetChoiceDisplays();
    
    // Update choice icons
    const player1ChoiceIcon = player1ChoiceDisplay.querySelector('.choice-icon');
    const player2ChoiceIcon = player2ChoiceDisplay.querySelector('.choice-icon');
    
    // Set choice icons with new images
    player1ChoiceIcon.className = `choice-icon ${data.player1Choice.toLowerCase()}`;
    player2ChoiceIcon.className = `choice-icon ${data.player2Choice.toLowerCase()}`;
    
    // Add opponent class to the non-selected choice
    player1ChoiceDisplay.classList.add('active');
    player2ChoiceDisplay.classList.add('active', 'opponent');
    
    // Update player names in choice displays
    const player1Name = player1ChoiceDisplay.querySelector('.player-name');
    const player2Name = player2ChoiceDisplay.querySelector('.player-name');
    
    player1Name.textContent = data.player1Name;
    player2Name.textContent = data.player2Name;

    // Update game status
    const winner = data.winner;
    gameStatus.textContent = winner === 'Tie' 
        ? 'It\'s a Tie!' 
        : `${winner.replace('Wins', '').trim()} wins this round!`;

    // Update scores
    player1ScoreDisplay.textContent = data.scores.player1;
    player2ScoreDisplay.textContent = data.scores.player2;

    // Hide choices after 3 seconds
    setTimeout(() => {
        resetChoiceDisplays();
        gameStatus.textContent = '';
        
        // Re-enable choices for next round
        choiceWrappers.forEach(w => {
            const item = w.querySelector('.choice-item');
            item.classList.remove('disabled');
            item.style.opacity = '1';
        });
    }, 3000);

    // Check if game is completely over (one player reaches 3 points)
    if (data.gameOver && (data.scores.player1 === 3 || data.scores.player2 === 3)) {
        setTimeout(() => {
            // Update game state
            gameState.isGameRunning = false;
            gameState.isGameOver = true;

            // Determine winner
            const winner = data.finalWinner;
            
            // Select a random congratulatory message
            const randomMessage = congratsMessages[Math.floor(Math.random() * congratsMessages.length)];

            // Update winner display
            winnerNameDisplay.textContent = winner;
            winnerMessageDisplay.textContent = randomMessage;

            // Animate winner title
            winnerTitle.classList.add('animated-title');

            // Show game over actions
            showGameOverActions();

            // Switch to game over screen
            switchScreen(screens.gameOver);
        }, 3000);
    }
});

// Restart Match Button Logic
restartMatchBtn.addEventListener('click', () => {
    socket.emit('player_ready_to_restart', { 
        roomId: currentPlayer.roomId, 
        resetPoints: true  // Reset points
    });

    // Hide game over actions
    hideGameOverActions();
});

// New Game Button Logic
newGameBtn.addEventListener('click', () => {
    // Emit event to server to leave the current room
    socket.emit('leave_room', { 
        roomId: currentPlayer.roomId, 
        playerName: currentPlayer.name 
    });
    
    // Reset to player setup screen
    switchScreen(screens.setup);
});

socket.on('restart_game_status', (data) => {
    if (data.bothReady) {
        // Reset game state
        gameState.isGameRunning = true;
        gameState.isGameOver = false;

        // Switch back to game screen
        switchScreen(screens.game);

        // Reset scores if requested
        if (data.resetPoints) {
            player1ScoreDisplay.textContent = '0';
            player2ScoreDisplay.textContent = '0';
        }
    }
});

// Add some additional styling for the animated title
const style = document.createElement('style');
style.textContent = `
    .animated-title {
        animation: celebration 1s ease-in-out infinite alternate;
    }

    @keyframes celebration {
        0% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.1) rotate(5deg); }
        100% { transform: scale(1) rotate(-5deg); }
    }
`;
document.head.appendChild(style);

// Game Restart and New Game Functionality
function resetGameState() {
    // Reset local game state
    choiceWrappers.forEach(w => {
        const item = w.querySelector('.choice-item');
        item.classList.remove('disabled');
        item.style.opacity = '1';
    });

    // Reset choice displays
    resetChoiceDisplays();

    // Reset game status and scores
    gameStatus.textContent = '';
    player1ScoreDisplay.textContent = '0';
    player2ScoreDisplay.textContent = '0';

    // Switch back to game screen
    switchScreen(screens.game);
}

// Add server-side event listeners for restart and new game
socket.on('match_restarted', (data) => {
    // Reset game state for both players
    resetGameState();
});

socket.on('room_left', () => {
    // Reset to player setup screen
    switchScreen(screens.setup);
});

socket.on('connect_error', (error) => {
    console.error('Connection Error:', error);
    alert('Failed to connect to the game server. Please try again.');
});

socket.on('room_error', (errorMessage) => {
    // Re-enable join button
    joinGameBtn.disabled = false;
    joinGameBtn.textContent = 'Start Game';

    // Show error message
    alert(errorMessage);
    
    // Switch back to setup screen
    switchScreen(screens.setup);
});
