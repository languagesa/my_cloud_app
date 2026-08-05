const connectButton = document.getElementById("connect");
const fileExplorerButton = document.getElementById("fileExplorerButton");

const dot = document.getElementById("statusDot");
const text = document.getElementById("statusText");

let currentPath = null;

function updateConnectionStatus(connected) {
    if (connected) {
        dot.style.background = "green";
        text.textContent = "Connected";

        fileExplorerButton.disabled = false;
        fileExplorerButton.textContent = "View files";
    } else {
        dot.style.background = "red";
        text.textContent = "Disconnected";

        fileExplorerButton.disabled = true;
        fileExplorerButton.textContent = "Connect to view files";
    }
}

connectButton.onclick = async () => {
    try {
        const result = await window.server.connect();
        currentPath = result.homePath;
        updateConnectionStatus(result.connected);
        console.log("Remote home path:", currentPath);
    } catch (error) {
        console.error("Connection failed:", error);
        updateConnectionStatus(false);
    }
};
fileExplorerButton.onclick = async () => {
    try {
        const entries = await window.server.listDirectory(currentPath);

        console.log("Fetched directory:", entries);
        console.table(entries);
    } catch (error) {
        console.error("Could not list directory:", error);
    }
};
window.server.onStatus((connected) => {
    updateConnectionStatus(connected);
});