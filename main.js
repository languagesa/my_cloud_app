const { app, BrowserWindow , ipcMain} = require("electron");
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
// this function will try to eastablish connection to the server while also 
//giving the homePath for later file fetching while making sure there is 
//only one active ssh session to transfer files over
function connectSftp() {

    if(sftp)
        return Promise.resolve({
        connected: true,
        homePath: homePath
        });

    if (connectionPromise) 
        return connectionPromise;
    
    
    newClient.on("ready", () => {
        console.log("ssh is ready to connect")
        newClient.sftp((error,newSftp) => {
            if (error) {
                reject(error);
                return;
        }
// "." is the current working directory on the remote server        
// error and absHomePath are the callback paramater
// the sftp documentation https://github.com/mscdex/ssh2/blob/master/SFTP.md#client-only-methods
//this part will eastablish the sftp
            sftp = newSftp;
            sftp.realpath(".", (error, absHomePath) => {
                if(error){
                    reject(error);
                    return;
                }
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
        client.connect(ServAdr);
    });        
    return connectionPromise;

}
ipcMain.handle("connect-server", connectSftp);

ipcMain.handle("list-directory", async (_event, remotePath) => {
    if (!sftp) 
        throw new Error("need to connect to the server first(sftp isn't established)");
    return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (error, list) => {
            if (error) {
                reject(error);
                return;
            }
            let cleanedList = list.filter(file => {
            file.filename !== "." && file.filename !== ".."
            });

            cleanedList = cleanedList.map(file => ({
// these would help me later on in the listing order            
                filename: file.filename,
                type: file.attrs.isdirectory() ? "directory" : "file",
                size: file.attrs.size,
                modifiedAt: file.attrs.mtime * 1000
            }))

            cleanedList.sort((a, b) => {
            if (first.type !== second.type) 
                return first.type === "directory" ? -1 : 1;
           
            else if (first.name !== second.name) 
                return first.name.localeCompare(second.name);

            else 
                return first.modifiedAt - second.modifiedAt;
            });
        resolve(cleanedList);
        });
    });
})











ipcMain.on("connect-server", (event) => {
    if (sshProcess) return;
    
    sshProcess = spawn("ssh", ["-v", "cloud"]);
    
   sshProcess.stderr.on("data", (data) => {
    const output = data.toString();

    console.log("stderr:", output);

    if (output.includes("Authenticated")) {
        event.reply("connection-status", true);
    }
});
    sshProcess.stdout.on("data", (out) => {
        console.log(`stdout: ${out}`);
    })
 
    sshProcess.on("close", (code) => {
        console.log("SSH closed with code", code);
        
        sshProcess = null;

        event.reply("connection-status", false);

    });
    

});




function createWindow(){

    const window = new BrowserWindow({
        width: 900,
        height: 600,

        webPreferences:{
            preload: __dirname + "/preload.js"
        }
    });


    window.loadFile("src/renderer/index.html");
}


app.whenReady().then(()=>{
    createWindow();
});