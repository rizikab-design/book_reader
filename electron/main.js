const { app, BrowserWindow, shell, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let serverUtility;

const PORT = 3001;

function startServer() {
  const isPacked = app.isPackaged;
  const serverPath = isPacked
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(__dirname, '..', 'server', 'index.js');

  const env = { PORT: String(PORT) };
  if (isPacked) {
    env.DATA_DIR = app.getPath('userData');
  }

  // Use utilityProcess.fork — runs in a Node.js child process, not another Electron instance
  serverUtility = utilityProcess.fork(serverPath, [], {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });

  if (serverUtility.stdout) {
    serverUtility.stdout.on('data', (data) => {
      console.log(`[server] ${data.toString().trim()}`);
    });
  }
  if (serverUtility.stderr) {
    serverUtility.stderr.on('data', (data) => {
      console.error(`[server] ${data.toString().trim()}`);
    });
  }
}

// Poll until the server responds, then resolve
function waitForServer(maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://localhost:${PORT}/api/books`, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts >= maxRetries) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Book Reader',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startServer();

  try {
    await waitForServer();
  } catch (err) {
    console.error(err.message);
  }

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

app.on('before-quit', () => {
  if (serverUtility) {
    serverUtility.kill();
    serverUtility = null;
  }
});
