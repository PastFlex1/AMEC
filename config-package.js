const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json'));

pkg.main = 'main.js';

pkg.scripts['electron:dev'] = 'concurrently "npm run dev" "wait-on tcp:9002 && electron ."';
pkg.scripts['electron:build'] = 'npm run build && node copy-standalone.js && electron-builder';

pkg.build = {
  appId: 'com.apminox.app',
  productName: 'Apm Inox',
  directories: {
    output: 'dist'
  },
  files: [
    'main.js',
    '.next/standalone/**/*'
  ]
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('package.json updated successfully.');
