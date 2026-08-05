const { contextBridge, ipcRenderer } = require("electron");

console.log("Preload script loaded");

contextBridge.exposeInMainWorld("server", {
    connect: () => ipcRenderer.invoke("connect-server"),

    listDirectory: (remotePath) => {
        return ipcRenderer.invoke("list-directory", remotePath);
    },

    onStatus: (callback) => {
        console.log("onStatus listener registered");
        ipcRenderer.on("connection-status", (_event, connected) => {
            console.log("Preload received status:", connected);
            callback(connected);
        });
    }
});