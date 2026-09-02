const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const standalonePath = path.join(__dirname, '.next', 'standalone');

if (fs.existsSync(standalonePath)) {
  console.log('Copying static assets to standalone directory...');
  // Clear old
  const destPublic = path.join(standalonePath, 'public');
  const destStatic = path.join(standalonePath, '.next', 'static');
  if (fs.existsSync(destPublic)) fs.rmSync(destPublic, { recursive: true, force: true });
  if (fs.existsSync(destStatic)) fs.rmSync(destStatic, { recursive: true, force: true });

  // Copy public folder
  copyRecursiveSync(path.join(__dirname, 'public'), destPublic);
  
  // Copy .next/static folder
  copyRecursiveSync(path.join(__dirname, '.next', 'static'), destStatic);

  // Copy .env if exists
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    fs.copyFileSync(path.join(__dirname, '.env'), path.join(standalonePath, '.env'));
  }
  
  console.log('Assets copied successfully.');
} else {
  console.error('Standalone directory not found. Did you run "npm run build"?');
  process.exit(1);
}
