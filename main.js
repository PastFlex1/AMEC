const { app, BrowserWindow } = require("electron");
const http = require("http");
const path = require("path");

const fs = require("fs");

// Compatibilidad con Linux / MiniOS / Debian (sesión Live como root o sin user namespaces)
if (process.platform === 'linux') {
  if ((process.getuid && process.getuid() === 0) || process.argv.includes('--no-sandbox')) {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}

let mainWindow;
let nextProcess;

function iniciarNext() {
  const isProd = app.isPackaged || __dirname.includes('app.asar');
  
  if (isProd) {
    const { fork } = require("child_process");
    let standaloneDir = path.join(__dirname, '..', 'app.asar.unpacked', '.next', 'standalone');
    if (!fs.existsSync(standaloneDir)) {
      standaloneDir = path.join(__dirname, '.next', 'standalone');
    }
    const serverPath = path.join(standaloneDir, 'server.js');
    
    nextProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: '3333',
        HOSTNAME: '127.0.0.1'
      },
      cwd: standaloneDir,
      stdio: 'pipe',
      windowsHide: true
    });

    if (nextProcess.stdout) {
      nextProcess.stdout.on('data', (d) => console.log(`[Next.js]: ${d}`));
    }
    if (nextProcess.stderr) {
      nextProcess.stderr.on('data', (d) => console.error(`[Next.js ERROR]: ${d}`));
    }
  } else {
    const { spawn } = require("child_process");
    // Si existe compilación previa usar start, si no usar dev
    const hasBuild = fs.existsSync(path.join(__dirname, '.next', 'BUILD_ID'));
    const command = hasBuild ? "start" : "dev";
    
    nextProcess = spawn("npm", ["run", command, "--", "-p", "3333"], {
      shell: true,
      stdio: "inherit"
    });
  }
}

function esperarServidor() {
  return new Promise((resolve) => {
    let intentos = 0;
    const revisar = () => {
      intentos++;
      http.get("http://127.0.0.1:3333", () => {
        resolve();
      }).on("error", () => {
        if (intentos > 60) {
          // Timeout de seguridad de 30s
          resolve();
        } else {
          setTimeout(revisar, 500);
        }
      });
    };

    revisar();
  });
}

function crearVentana() {
  const isKiosk = process.argv.includes('--kiosk');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    kiosk: isKiosk,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'public', 'APM INOX LOGO.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL("http://127.0.0.1:3333");

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL("http://127.0.0.1:3333");
      }
    }, 1000);
  });
}

function limpiarProcesos() {
  if (nextProcess) {
    try {
      if (process.platform === "win32") {
        const { spawnSync } = require("child_process");
        spawnSync("taskkill", ["/pid", nextProcess.pid, "/f", "/t"]);
      } else {
        nextProcess.kill("SIGTERM");
      }
    } catch (err) {
      // Ignorar si ya se cerró
    }
  }
}

app.whenReady().then(async () => {
  iniciarNext();
  await esperarServidor();
  crearVentana();
});

app.on("before-quit", limpiarProcesos);

app.on("window-all-closed", () => {
  limpiarProcesos();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

