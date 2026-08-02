const { contextBridge, ipcRenderer } = require("electron");


contextBridge.exposeInMainWorld( "server", {

        connect: ()=> ipcRenderer.send("connect-server"),
        
        onStatus: (callback) => {
        
            ipcRenderer.on("connection-status", (event, connected) => {

                callback(connected);

        });

    }
});
