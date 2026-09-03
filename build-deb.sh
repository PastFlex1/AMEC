#!/bin/bash
set -e

# Directorio del proyecto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
LINUX_UNPACKED="${DIST_DIR}/linux-unpacked"

echo "========================================================"
echo "📦 Generando paquete .deb para Debian / Mini OS..."
echo "========================================================"

if [ ! -d "${LINUX_UNPACKED}" ]; then
  echo "❌ No se encontró ${LINUX_UNPACKED}."
  echo "Por favor ejecuta primero: npm run build && node copy-standalone.js && npx electron-builder --linux dir"
  exit 1
fi

TEMP_DIR="/tmp/apm-inox-deb-build"
rm -rf "${TEMP_DIR}"
mkdir -p "${TEMP_DIR}/DEBIAN"
mkdir -p "${TEMP_DIR}/opt/apm-inox"
mkdir -p "${TEMP_DIR}/usr/bin"
mkdir -p "${TEMP_DIR}/usr/share/applications"
mkdir -p "${TEMP_DIR}/usr/share/icons/hicolor/512x512/apps"

echo "📁 Copiando binarios de linux-unpacked..."
cp -r "${LINUX_UNPACKED}"/* "${TEMP_DIR}/opt/apm-inox/"

echo "🔧 Ajustando permisos..."
chmod 755 "${TEMP_DIR}/opt/apm-inox/apm-inox"
if [ -f "${TEMP_DIR}/opt/apm-inox/chrome-sandbox" ]; then
  chmod 4755 "${TEMP_DIR}/opt/apm-inox/chrome-sandbox" || true
fi

echo "🖼️  Copiando icono oficial..."
if [ -f "${SCRIPT_DIR}/public/APM INOX LOGO.png" ]; then
  cp "${SCRIPT_DIR}/public/APM INOX LOGO.png" "${TEMP_DIR}/usr/share/icons/hicolor/512x512/apps/apm-inox.png"
fi

echo "🖥️  Generando acceso directo (.desktop)..."
cat << 'EOF' > "${TEMP_DIR}/usr/share/applications/apm-inox.desktop"
[Desktop Entry]
Name=Apm Inox
Comment=Sistema de Gestión y Facturación Apm Inox
Exec=/usr/bin/apm-inox %U
Icon=apm-inox
Terminal=false
Type=Application
Categories=Office;Finance;
StartupNotify=true
EOF
chmod 644 "${TEMP_DIR}/usr/share/applications/apm-inox.desktop"

echo "🔗 Creando ejecutable global (/usr/bin/apm-inox)..."
cat << 'EOF' > "${TEMP_DIR}/usr/bin/apm-inox"
#!/bin/bash
# Wrapper para Apm Inox compatible con Debian y MiniOS
# Si se ejecuta como root (común en MiniOS live), añade --no-sandbox
if [ "$EUID" -eq 0 ]; then
  exec /opt/apm-inox/apm-inox --no-sandbox "$@"
else
  exec /opt/apm-inox/apm-inox "$@"
fi
EOF
chmod 755 "${TEMP_DIR}/usr/bin/apm-inox"

echo "📄 Generando archivo de control DEBIAN..."
cat << 'EOF' > "${TEMP_DIR}/DEBIAN/control"
Package: apm-inox
Version: 0.1.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Apm Inox <alex@apminox.com>
Depends: libgtk-3-0, libnss3, libasound2 | libasound2t64, libgbm1, libnotify4, libxss1, libxtst6, xdg-utils
Description: Sistema de Gestion y Facturacion Apm Inox
 Aplicacion de escritorio Apm Inox empaquetada para Debian y MiniOS Linux.
EOF
chmod 644 "${TEMP_DIR}/DEBIAN/control"

echo "📄 Generando scripts postinst y postrm..."
cat << 'EOF' > "${TEMP_DIR}/DEBIAN/postinst"
#!/bin/bash
set -e
if [ -f /opt/apm-inox/chrome-sandbox ]; then
  chmod 4755 /opt/apm-inox/chrome-sandbox || true
fi
which update-desktop-database >/dev/null 2>&1 && update-desktop-database -q || true
which gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
exit 0
EOF
chmod 755 "${TEMP_DIR}/DEBIAN/postinst"

cat << 'EOF' > "${TEMP_DIR}/DEBIAN/postrm"
#!/bin/bash
set -e
which update-desktop-database >/dev/null 2>&1 && update-desktop-database -q || true
which gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
exit 0
EOF
chmod 755 "${TEMP_DIR}/DEBIAN/postrm"

echo "🔨 Empaquetando archivo .deb final..."
OUTPUT_DEB="${DIST_DIR}/apm-inox_0.1.0_amd64.deb"
dpkg-deb --build --root-owner-group "${TEMP_DIR}" "${OUTPUT_DEB}"

# Limpieza
rm -rf "${TEMP_DIR}"

echo "========================================================"
echo "✅ ¡PAQUETE .DEB CREADO CON ÉXITO!"
echo "📍 Ubicación: ${OUTPUT_DEB}"
echo "========================================================"
