const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, execSync } = require('child_process');
const process = require('node:process');

let hyperion;
let checkForTvInterval;
let isTvOn = false;

console.log('Started');

switchHyperion(true)

function createWindow() {
    // Create the browser window.
    let win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js')
        },
        
    });

    // Load the index.html of the app.
    win.loadFile('index.html');
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.on('openUrl', (event, url) => {
    console.log('open url:', url);
    exec('firefox --kiosk ' + url, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
});

ipcMain.on('exec', (event, cmd) => {
    console.log('exec:', cmd);
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
});

function switchHyperion(state, block) {
    try {
        if (!state) {
            if (hyperion) {
                hyperion.kill('SIGINT');
            }
            if (block) {
                execSync('pkill -f hyperion');
            } else {
                exec('pkill -f hyperion');
            }
            hyperion = null;
        }
        if (state && !hyperion) {
            hyperion = exec('hyperion-qt -f 5 -s 16 -a 0.0.0.0:19401', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing command: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
            });
        }
    } catch(err) {}
};

function checkForTv() {
    exec('xrandr', (error, stdout, stderr) => {
        isTvOn = stdout.includes('HDMI-1 connected');
        console.log(`Tv detected`, isTvOn);
        if(isTvOn) {
            switchHyperion(true);
        } else {
            switchHyperion(false);
        }
    });
}

process.on('beforeExit', (code) => {
    switchHyperion(false, true);
    clearInterval(checkForTvInterval);
});

process.on('exit', (code) => {
    switchHyperion(false, true);
    clearInterval(checkForTvInterval);
});

//checkForTvInterval = setInterval(checkForTv, 5000);
