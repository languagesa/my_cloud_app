const button = document.getElementById("connect");

const dot = document.getElementById("statusDot");

const text = document.getElementById("statusText");

button.onclick = () => {

    window.server.connect();

};

window.server.onStatus((connected) => {

    if (connected) {

        dot.style.background = "green";

        text.textContent = "Connected";

    } else {

        dot.style.background = "red";

        text.textContent = "Disconnected";

    }

});

