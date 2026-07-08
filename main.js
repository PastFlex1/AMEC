const { app, BrowserWindow } = require("electron");
const http = require("http");
const path = require("path");

let mainWindow;
let nextProcess;

function iniciarNext() {
  const isProd = app.isPackaged || __dirname.includes('app.asar');
  
  if (isProd) {
    // ¡EL MINI SERVIDOR! 
    // Esto corre directamente el código de Next.js sin necesidad de npm ni terminales
    const { fork } = require("child_process");
    const standaloneDir = path.join(__dirname, '..', 'app.asar.unpacked', '.next', 'standalone');
    const serverPath = path.join(standaloneDir, 'server.js');
    
    nextProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '3333',
        HOSTNAME: '127.0.0.1'
      },
      cwd: standaloneDir,
      stdio: 'pipe',
      windowsHide: true // ¡Esto es lo que hace que jamás se abra una terminal en el .exe!
    });
  } else {
    // Para cuando estás programando (desarrollo)
    const { spawn } = require("child_process");
    nextProcess = spawn("npm", ["run", "start", "--", "-p", "3333"], {
      shell: true,
      stdio: "inherit"
    });
  }
}

function esperarServidor() {
  return new Promise((resolve) => {
    const revisar = () => {
      http.get("http://127.0.0.1:3333", () => {
        resolve();
      }).on("error", () => {
        setTimeout(revisar, 500);
      });
    };

    revisar();
  });
}

function crearVentana() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    icon: path.join(__dirname, 'public', 'Amec.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL("http://127.0.0.1:3333");
}

app.whenReady().then(async () => {
  iniciarNext();
  await esperarServidor();
  crearVentana();
});

app.on("window-all-closed", () => {
  if (nextProcess) {
    if (process.platform === "win32") {
      const { spawnSync } = require("child_process");
      spawnSync("taskkill", ["/pid", nextProcess.pid, "/f", "/t"]);
    } else {
      nextProcess.kill();
    }
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
