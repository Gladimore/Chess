const peerIdInput = document.getElementById("peerId");
const connectPeerButton = document.getElementById("connectPeer");
const myPeerIdDisplay = document.getElementById("myPeerId");
const startGameButton = document.getElementById("start-btn");
const applySettingsButton = document.getElementById("apply-settings");
const timeControlInput = document.getElementById("time-control");
const colorChoiceSelect = document.getElementById("color-choice");
const whiteTimerDisplay = document.getElementById("white-timer");
const blackTimerDisplay = document.getElementById("black-timer");

setTimers(false);

const peer = new Peer();
let conn = null;
let isRoomOwner = false;
let isWhite = true;
let gameStarted = false;
let whiteTimer, blackTimer;
let timeControl = 10 * 60; // 10 minutes in seconds
let main_timer = null;

peer.on("open", (id) => {
    myPeerIdDisplay.innerText = id;
    myPeerIdDisplay.style.cursor = "pointer";
    myPeerIdDisplay.onclick = () => {
        navigator.clipboard
            .writeText(id)
            .then(() => {
                showAlert(
                    "Copied!",
                    "Your Peer ID has been copied to the clipboard.",
                    "success",
                );
            })
            .catch((err) => {
                showError("Failed to copy Peer ID: " + err.message);
            });
    };
});

peer.on("connection", (connection) => {
    setupConnection(connection);
    isRoomOwner = true;
    isWhite = true;
});

peer.on("error", (err) => {
    showError(
        "An error occurred with the peer connection: " + err.message,
        "Peer Error",
    );
});

connectPeerButton.onclick = () => {
    const peerId = peerIdInput.value;
    if (!peerId) {
        showError("Please enter a Peer ID");
        return;
    }
    conn = peer.connect(peerId);
    conn.on("open", () => {
        setupConnection(conn);
        isRoomOwner = false;
        isWhite = false;
    });

    conn.on("disconnect", () => {
        showError("The peer disconnected.", "Peer Disconnected");
        stopTimers();
    });

    conn.on("error", (err) => {
        showError(
            "Could not connect to peer. " + err.message,
            "Connection Error",
        );
    });
};

function setupConnection(connection) {
    conn = connection;
    conn.on("data", (data) => {
        if (data.type === "move") {
            game.move(data.move);
            board.position(game.fen());
            updateStatus();
            switchTimer();
        } else if (data.type === "gameSettings") {
            applyGameSettings(data.settings);
        }
    });
    showAlert("Connected", "You are now connected to a peer!", "success");
    initGame();
}

function showAlert(title, text, icon) {
    Swal.fire({
        title: title,
        text: text,
        icon: icon,
        confirmButtonText: "OK",
    });
}

function showError(text, title) {
    showAlert(title || "Error", text, "error");
}

let board = null;
let game = new Chess();
let $status = $("#status");

function onDragStart(source, piece, position, orientation) {
    if (game.game_over() || !gameStarted) return false;
    if ((game.turn() === "w" && !isWhite) || (game.turn() === "b" && isWhite)) {
        //black is being classified as white which isnocrrect
        return false;
    }
}

function onDrop(source, target) {
    let move = game.move({
        from: source,
        to: target,
        promotion: "q",
    });
    if (move === null) return "snapback";
    updateStatus();
    switchTimer();
    if (conn) {
        conn.send({
            type: "move",
            move: move,
        });
    }
}

function onSnapEnd() {
    board.position(game.fen());
}

function updateStatus() {
    let status = "";
    let moveColor = "White";
    if (game.turn() === "b") {
        moveColor = "Black";
    }
    if (game.in_checkmate()) {
        status = "Game over, " + moveColor + " is in checkmate.";
        stopTimers();
    } else if (game.in_draw()) {
        status = "Game over, drawn position";
        stopTimers();
    } else {
        status = moveColor + " to move";
        if (game.in_check()) {
            status += ", " + moveColor + " is in check";
        }
    }
    $status.html(status);
}

function initGame() {
    game = new Chess();
    let config = {
        draggable: true,
        position: "start",
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        orientation: isWhite ? "white" : "black",
        pieceTheme:
            "https://raw.githubusercontent.com/jbkunst/chessboardjs-themes/refs/heads/master/chesspieces/wikipedia/{piece}.png",
    };
    board = Chessboard("board", config);
    updateStatus();
}

startGameButton.onclick = () => {
    if (isRoomOwner) {
        if (conn) {
            gameStarted = true;
            initGame();
            startTimers();

            conn.send({
                type: "gameSettings",
                settings: {
                    timeControl: timeControl,
                    isWhite: !isWhite,
                },
            });
        } else {
            showError("Connection not established.");
        }
    } else {
        showError("Only the room owner can start the game");
    }
};

applySettingsButton.onclick = () => {
    if (isRoomOwner) {
        timeControl = parseInt(timeControlInput.value) * 60;
        let colorChoice = colorChoiceSelect.value;
        if (colorChoice === "random") {
            isWhite = Math.random() < 0.5;
        } else {
            isWhite = colorChoice === "white";
        }
        updateTimerDisplays();
        showAlert(
            "Settings Applied",
            "Game settings have been updated",
            "success",
        );
    } else {
        showError("Only the room owner can change settings");
    }
};

function applyGameSettings(settings) {
    timeControl = settings.timeControl;
    isWhite = settings.isWhite;
    updateTimerDisplays();
    gameStarted = true;
    initGame();
    startTimers();
}

function updateTimerDisplays() {
    whiteTimerDisplay.textContent = `White: ${formatTime(timeControl)}`;
    blackTimerDisplay.textContent = `Black: ${formatTime(timeControl)}`;
}

function startTimers() {
    setTimers(true);
    stopTimers();
    whiteTimer = timeControl;
    blackTimer = timeControl;
    updateTimerDisplays();
    runTimer();
}

function runTimer() {
    main_timer = setInterval(() => {
        if (game.turn() === "w") {
            whiteTimer--;
            whiteTimerDisplay.textContent = `White: ${formatTime(whiteTimer)}`;
        } else {
            blackTimer--;
            blackTimerDisplay.textContent = `Black: ${formatTime(blackTimer)}`;
        }

        if (whiteTimer <= 0 || blackTimer <= 0) {
            clearInterval(main_timer);
            let winner = whiteTimer <= 0 ? "Black" : "White";
            showAlert("Game Over", `${winner} wins on time!`, "info");
            gameStarted = false;
        }
    }, 1000);
}

function stopTimers() {
    clearInterval(whiteTimer);
    clearInterval(blackTimer);
    clearInterval(main_timer);
}

function switchTimer() {
    if (game.turn() === "w") {
        blackTimer = timeControl;
    } else {
        whiteTimer = timeControl;
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function setTimers(visible = false) {
    whiteTimerDisplay.style.display = visible ? "block" : "none";
    blackTimerDisplay.style.display = visible ? "block" : "none";
}
