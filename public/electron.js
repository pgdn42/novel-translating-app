const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { startServer } = require('../server.js'); // Import the server starter

// Check if the app is in development mode
const isDev = !app.isPackaged;

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Load the index.html of the app.
    // In development, load from the React dev server.
    // In production, load from the built files.
    win.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, '../build/index.html')}`
    );

    win.setMenu(null);

    // Open the DevTools.
    if (isDev) {
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    // Start the Express and WebSocket server
    startServer(dialog);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
