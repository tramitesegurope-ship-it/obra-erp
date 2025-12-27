const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let apiProcess;

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getResourcesRoot = () => (app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..'));

const dbUrlFromPath = (dbPath) => `file:${dbPath.replace(/\\/g, '/')}`;

const getSeedDbPath = () => {
  const root = getResourcesRoot();
  if (app.isPackaged) {
    return path.join(root, 'seed', 'dev.db');
  }
  return path.join(root, 'api', 'prisma', 'prisma', 'dev.db');
};

const getApiEntry = () => {
  const root = getResourcesRoot();
  return path.join(root, 'api', 'dist', 'server.js');
};

const getUiIndex = () => {
  const root = getResourcesRoot();
  if (app.isPackaged) {
    return path.join(root, 'ui', 'index.html');
  }
  return path.join(root, 'obra-erp-ui', 'dist', 'index.html');
};

const startApi = () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const dbDir = path.join(dataDir, 'db');
  ensureDir(dataDir);
  ensureDir(dbDir);

  const dbPath = path.join(dbDir, 'dev.db');
  if (!fs.existsSync(dbPath)) {
    const seedDb = getSeedDbPath();
    if (fs.existsSync(seedDb)) {
      fs.copyFileSync(seedDb, dbPath);
    }
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrlFromPath(dbPath),
    ADMIN_DELETE_KEY: process.env.ADMIN_DELETE_KEY || 'cambia-esta-clave',
    PORT: process.env.PORT || '4000',
  };

  apiProcess = fork(getApiEntry(), [], {
    cwd: dataDir,
    env,
    stdio: 'inherit',
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(getUiIndex());
};

app.whenReady().then(() => {
  startApi();
  createWindow();
});

app.on('before-quit', () => {
  if (apiProcess) {
    apiProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
