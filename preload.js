const { contextBridge, ipcRenderer } = require("electron");

console.log("Preload script loaded");

contextBridge.exposeInMainWorld("server", {
    connect: () => ipcRenderer.invoke("connect-server"),

    listDirectory: (remotePath) => {
        return ipcRenderer.invoke("list-directory", remotePath);
    },
    openFileExplorer: () => {
        return ipcRenderer.invoke("open-file-explorer");
    },
    openFolder: (nextpath) => {
        return ipcRenderer.invoke("open-folder", nextpath);
    },
    uploadFiles: (remotePath) => {
        return ipcRenderer.invoke("upload-files", remotePath);
    },
    downloadWrap: (File) =>{
        return ipcRenderer.invoke("download-files",File)
    },
    renameEntry: (oldPath, newName) => {
        return ipcRenderer.invoke("rename-entry", oldPath, newName);
    },
    createFolder: (parentPath, folderName) => {
        return ipcRenderer.invoke("create-folder", parentPath, folderName);
    },getRecycleBinPath: () => {
    return ipcRenderer.invoke("get-recycle-bin-path");
    },

    moveToRecycleBin: (remotePath) => {
        return ipcRenderer.invoke("move-to-recycle-bin",remotePath);
    },

    deletePermanently: (remotePath) => {
        return ipcRenderer.invoke("delete-permanently",remotePath);
    },

    onStatus: (callback) => {
        console.log("onStatus listener registered");
        ipcRenderer.on("connection-status", (_event, connected) => {
            console.log("Preload received status:", connected);
            callback(connected);
        });
    }
});