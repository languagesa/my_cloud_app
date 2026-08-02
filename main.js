const { app, BrowserWindow } = require("electron");
const { ipcMain } = require("electron");
const { spawn } = require("child_process");

let sshProcess = null;
ipcMain.on("connect-server", (event) => {
    if (sshProcess) return;
    
    sshProcess = spawn("ssh", ["-v", "cloud"]);
    
    sshProcess.stderr.on("data", (data) => {

        const output = data.toString();

        console.log("STDERR:", output);


        if (output.includes("Authenticated")) {
            event.reply("connection-status", true);
        }

    });
    sshProcess.stdout.on("data", (out) => {
        console.log(`stdout: ${out}`);
    })
    sshProcess.stderr.on("data", (err) => {
        console.log(`stderr: ${err}`);
    });
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