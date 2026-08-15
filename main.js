const { app, BrowserWindow , ipcMain, dialog} = require("electron");
const { spawn } = require("child_process");
const { Client } = require("ssh2");
const path = require("path");
const fs = require("fs");
const os = require("os");

let sshProcess = null;
let sshClient = null;
let sftp = null;
let homePath = null;
let connectionPromise = null;
let currentPath = null;
const ServAdr = {
    host: "100.98.153.79", 
    port: "22", 
    username: "yair_biran",
    privateKey: fs.readFileSync(path.join(os.homedir(), ".ssh", "id_ed25519")),
    keepAliveMsgIntrvl: 10000
};
const downloadsPath = app.getPath("downloads");   

function sendConnectionStatus(connected) {
    if (mainWindow) 
        mainWindow.webContents.send("connection-status", connected);
    }

function connectSftp() {

    if(sftp)
        return Promise.resolve({
        connected: true,
        homePath: homePath
        });

    if (connectionPromise) 
        return connectionPromise;
    
    connectionPromise = new Promise((resolve, reject) => {
    const newClient = new Client();

    newClient.on("ready", () => {
        console.log("ssh is ready to connect")
        newClient.sftp((error,newSftp) => {
            if (error) {
                newClient.end();
                reject(error);
                return;
        }
// "." is the current working directory on the remote server        
// error and absHomePath are the callback paramater
// the sftp documentation https://github.com/mscdex/ssh2/blob/master/SFTP.md#client-only-methods
//this part will eastablish the sftp
            newSftp.realpath(".", (error, absHomePath) => {
                if(error){
                    newClient.end();
                    reject(error);
                    return;
                }
                    sshClient = newClient;  
                    sftp = newSftp;
                    homePath = absHomePath;
                    sendConnectionStatus(true);
                    resolve({   
                        connected: true,
                        homePath: homePath
                    });
            });
        });

            newClient.on("error", (error) => {
                console.error("SSH error:", error.message);
                reject(error);
            });

        newClient.on("close", () => {
            console.log("SSH connection closed.");

            sshClient = null;
            sftp = null;
            homePath = null;
            connectionPromise = null;

            sendConnectionStatus(false);
        });
    });       
    newClient.connect(ServAdr);
    });
    return connectionPromise;
}
function listDirectory(remotePath){
    if (!sftp) 
        throw new Error("need to connect to the server first(sftp isn't established)");
    
    return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (error, list) => {
            if (error) {
                reject(error);
                return;
            }
            let cleanedList = list.filter(file => {    
            return file.filename !== "." && file.filename !== "..";
            });

                cleanedList = cleanedList.map(file => ({
                    name: file.filename,
                    type: file.attrs.isDirectory() ? "directory" : "file",
                    size: file.attrs.size,
                    path: path.posix.join(remotePath,file.filename),
                    modifiedAt: file.attrs.mtime * 1000
                    }
            ));

            cleanedList.sort((a, b) => {
            if (a.type !== b.type) 
                return a.type === "directory" ? -1 : 1;
           
            else if (a.name !== b.name) 
                return a.name.localeCompare(b.name);

            else 
                return a.modifiedAt - b.modifiedAt;
            });
        resolve(cleanedList);
        });
    });
}
async function moveToRecycleBin(remotePath){
    if(!sftp){
        throw new Error("need to connect to the server first(sftp isn't established");
    }

}
async function uploadFiles(remotePath){
    if (!sftp) {
        throw new Error("need to connect to the server first(sftp isn't established");
    }
    const result = await dialog.showOpenDialog(fileExplorerWindow, {
        title: "Choose files to upload",
        properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) return [];
    

    for (const filePath of result.filePaths) {
        const filename = path.basename(filePath);
        const destinationPath = path.posix.join(remotePath, filename);

        await new Promise((resolve, reject) => {
            sftp.fastPut(filePath, destinationPath, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    return {uploaded: result.filePaths.length};
}
async function downloadWrap(file) {
    if (!sftp) {
        throw new Error("need to connect to the server first(sftp isn't established");
    } 
    await download(file,downloadsPath)

}
async function download(file,mkDirPath){
    const LocalCurrentPath = path.join(mkDirPath,file.name)
    if(file.type === "directory"){
        const list = await listDirectory(file.path);
        await fs.promises.mkdir(LocalCurrentPath, { recursive: true });
        for (const entry of list){
                await download(entry,LocalCurrentPath)           
        }
    }
    else{
        await new Promise((resolve, reject) => {
            sftp.fastGet(file.path,LocalCurrentPath,{ concurrency: 1 },    error => {
                if (error) {
                    new Error(`Failed downloading "${file.path}" to ` +`"${LocalCurrentPath}": ${error.message} ` +`(SFTP code ${error.code})`)
                    return;
                }
                resolve();
            });
        });
    }   
}
async function renameEntry(oldPath,newName){
    const parentPath = path.posix.dirname(oldPath);
    const newPath = path.posix.join(parentPath, newName);

    return new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
ipcMain.handle("connect-server", () => {
    return connectSftp();
});
ipcMain.handle("list-directory", async (_event, remotePath) => {
    return listDirectory(remotePath);
});
ipcMain.handle("open-file-explorer", () => {
    if (!sftp) {
        throw new Error("Connect to the server before opening the file explorer.");
    }
    createFileExplorerWindow();
    return {
        opened: true
    };
});
ipcMain.handle("upload-files", async (_event, remotePath) => {
    return uploadFiles(remotePath);
});
ipcMain.handle("download-files",async(_event, file) =>{
    return downloadWrap(file)
});
ipcMain.handle("create-folder", async (event, parentPath, folderName) => {
    if (!sftp) {
        throw new Error("SFTP is not connected.");
    }

    const cleanName = folderName.trim();

    if (cleanName === "" ||cleanName === "." ||cleanName === ".." 
        ||cleanName.includes("/") ||cleanName.includes("\0")) 
        {
        throw new Error("Invalid folder name.");
    }
    const folderPath = path.posix.join(parentPath, cleanName);
    await new Promise((resolve, reject) => {
        sftp.mkdir(folderPath, (error) => {
            console.log("checking to see if it accidently runs twice")
            if (error) {
                reject(
                    new Error(
                        `Could not create "${cleanName}": ${JSON.stringify(error)}`
                    )
                );
                return;
            }
            resolve();
        });
    });
    return folderPath;
});
ipcMain.handle("rename-entry", async (_event, oldPath, newPath) => {
    return renameEntry(oldPath, newPath);
});



let mainWindow = null;
let fileExplorerWindow = null;
function createWindow(width , height) {
    mainWindow = new BrowserWindow({
        width: width,
        height: height,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, "src/renderer/index.html"));

    mainWindow.on("closed", () => {
        mainWindow = null;
        if (fileExplorerWindow && !fileExplorerWindow.isDestroyed()) {
            fileExplorerWindow.close();
        }    
    });
}
function createFileExplorerWindow() {
      if (fileExplorerWindow && !fileExplorerWindow.isDestroyed()) {
        fileExplorerWindow.focus();
        return;
      }
    fileExplorerWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
});

    fileExplorerWindow.loadFile(path.join(__dirname, "src/renderer/fileExplorer.html"));

    fileExplorerWindow.on("closed", () => {
        fileExplorerWindow = null;
    });
    
}

app.whenReady().then(() => createWindow(1300, 900));

app.on("before-quit", () => {
    if (sshClient) {
        sshClient.end();
    }
});


