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

const downloadsPath = app.getPath("downloads");  
const RECYCLE_BIN_PATH = "/home/yair_biran/.recycle_bin";
const ServAdr = {
    host: "100.98.153.79", 
    port: "22", 
    username: "yair_biran",
    privateKey: fs.readFileSync(path.join(os.homedir(), ".ssh", "id_ed25519")),
    keepAliveMsgIntrvl: 10000
};

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

function runSftp(method, ...argumentsList) {
    return new Promise((resolve, reject) => {
        sftp[method](...argumentsList, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        });
    });
}

async function ensureRecycleBin() {
    try {
        const attributes = await runSftp("lstat",RECYCLE_BIN_PATH);
        if (!attributes.isDirectory()) {
            throw new Error(`${RECYCLE_BIN_PATH} exists but is not a directory`);
        }
    } catch (error) {
        if (error.code !== 2) {
            throw error;
        }

        await runSftp("mkdir", RECYCLE_BIN_PATH);
    }
}

function isInsideRecycleBin(remotePath) {
    const cleanPath = path.posix.normalize(remotePath);

    return (cleanPath === RECYCLE_BIN_PATH || cleanPath.startsWith(`${RECYCLE_BIN_PATH}/`));
}

async function getRecycleDestination(sourcePath) {
    const name = path.posix.basename(sourcePath);

    let destinationPath = path.posix.join(RECYCLE_BIN_PATH,name);

    try {
        await runSftp("lstat", destinationPath);

        destinationPath = path.posix.join(RECYCLE_BIN_PATH,`${Date.now()}-${name}`);
    } catch (error) {
        if (error.code !== 2) {
            throw error;
        }
    }

    return destinationPath;
}

async function moveToRecycleBin(remotePath) {
    await ensureRecycleBin();

    const sourcePath = path.posix.normalize(remotePath);

    if (isInsideRecycleBin(sourcePath)) {
        throw new Error("This entry is already in the recycle bin");
    }

    if (RECYCLE_BIN_PATH.startsWith(`${sourcePath}/`)) {
        throw new Error(
            "Cannot recycle a folder containing the recycle bin"
        );
    }

    const destinationPath =
        await getRecycleDestination(sourcePath);

    await runSftp(
        "rename",
        sourcePath,
        destinationPath
    );

    return destinationPath;
}

async function removeRemoteEntry(remotePath) {
    const attributes = await runSftp("lstat", remotePath);

    if (!attributes.isDirectory()) {
        await runSftp("unlink", remotePath);
        return;
    }

    const children = await runSftp("readdir", remotePath);

    for (const child of children) {
        if (child.filename === "." || child.filename === "..") {
            continue;
        }

        const childPath = path.posix.join(
            remotePath,
            child.filename
        );

        await removeRemoteEntry(childPath);
    }

    await runSftp("rmdir", remotePath);
}

async function deletePermanently(remotePath) {
    const targetPath = path.posix.normalize(remotePath);

    if (targetPath === RECYCLE_BIN_PATH) {
        throw new Error("The recycle bin itself cannot be deleted");
    }

    if (!isInsideRecycleBin(targetPath)) {
        throw new Error(
            "Permanent deletion is only allowed inside the recycle bin"
        );
    }

    await removeRemoteEntry(targetPath);
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
                    new Error(`Could not create "${cleanName}": ${JSON.stringify(error)}`)
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
ipcMain.handle("get-recycle-bin-path", () => {
    return RECYCLE_BIN_PATH;
});

ipcMain.handle("move-to-recycle-bin",async (event, remotePath) => {
        return moveToRecycleBin(remotePath);
    });

ipcMain.handle("delete-permanently",async (event, remotePath) => {
        return deletePermanently(remotePath);
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


