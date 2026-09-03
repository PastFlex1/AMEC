const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Iniciando compilación de paquete Debian (.deb) para Mini OS / Debian...');

try {
  // 1. Asegurarse de que build y copy-standalone estén al día
  if (!fs.existsSync(path.join(__dirname, '.next', 'standalone'))) {
    console.log('📦 Ejecutando next build...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('📦 Ejecutando copy-standalone.js...');
    execSync('node copy-standalone.js', { stdio: 'inherit' });
  }

  // 2. Compilar linux-unpacked si no existe
  const linuxUnpacked = path.join(__dirname, 'dist', 'linux-unpacked');
  if (!fs.existsSync(linuxUnpacked)) {
    console.log('📦 Generando binarios de Linux con electron-builder...');
    execSync('npx electron-builder --linux dir', { stdio: 'inherit' });
  }

  // 3. Empaquetar el .deb mediante build-deb.sh (vía WSL en Windows o bash directo en Linux)
  console.log('🔨 Empaquetando .deb con dpkg-deb...');
  if (process.platform === 'win32') {
    // Normalizar finales de línea por si acaso
    const shPath = path.join(__dirname, 'build-deb.sh');
    if (fs.existsSync(shPath)) {
      const shContent = fs.readFileSync(shPath, 'utf8').replace(/\r\n/g, '\n');
      fs.writeFileSync(shPath, shContent, 'utf8');
    }
    
    execSync('wsl -d Ubuntu -e bash -c "cd \\"$(wslpath \'' + __dirname.replace(/\\/g, '/') + '\')\\" && ./build-deb.sh"', {
      stdio: 'inherit'
    });
  } else {
    execSync('./build-deb.sh', { stdio: 'inherit' });
  }

  const debFile = path.join(__dirname, 'dist', 'apm-inox_0.1.0_amd64.deb');
  if (fs.existsSync(debFile)) {
    const stats = fs.statSync(debFile);
    console.log('\n======================================================');
    console.log('🎉 ¡ÉXITO! Paquete Debian listo para instalar:');
    console.log(`📁 Archivo: ${debFile}`);
    console.log(`⚖️  Tamaño: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('======================================================\n');
  }
} catch (err) {
  console.error('❌ Error al compilar o empaquetar:', err.message);
  process.exit(1);
}
