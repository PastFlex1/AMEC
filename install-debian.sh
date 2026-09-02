#!/bin/bash
# ==============================================================================
# Script de Instalacion de Apm Inox para Linux Debian / Mini OS
# ==============================================================================

set -e

APP_NAME="apm-inox"
APP_DISPLAY_NAME="Apm Inox"
INSTALL_DIR="/opt/${APP_NAME}"
BIN_DIR="/usr/local/bin"
DESKTOP_DIR="/usr/share/applications"
ICON_DIR="/usr/share/icons/hicolor/512x512/apps"

echo "==============================================="
echo " Instalando ${APP_DISPLAY_NAME} en Linux Debian..."
echo "==============================================="

# Verificar permisos de root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Por favor ejecuta este script como root (sudo ./install-debian.sh)"
  exit 1
fi

# Instalar dependencias del sistema requeridas por Electron/Chromium en Debian
echo "📦 Verificando dependencias del sistema..."
apt-get update -y
apt-get install -y libnss3 libasound2 libgbm1 libgtk-3-0 libxss1 libxtst6 xdg-utils tar

# Directorio donde se encuentra el script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Determinar origen de los binarios
SOURCE_DIR=""
if [ -d "${SCRIPT_DIR}/dist/linux-unpacked" ]; then
  SOURCE_DIR="${SCRIPT_DIR}/dist/linux-unpacked"
elif [ -d "${SCRIPT_DIR}/linux-unpacked" ]; then
  SOURCE_DIR="${SCRIPT_DIR}/linux-unpacked"
elif [ -f "${SCRIPT_DIR}/dist/nextn-0.1.0.tar.gz" ]; then
  echo "📂 Descomprimiendo paquete tar.gz..."
  rm -rf /tmp/apm-inox-temp
  mkdir -p /tmp/apm-inox-temp
  tar -xzf "${SCRIPT_DIR}/dist/nextn-0.1.0.tar.gz" -C /tmp/apm-inox-temp
  SOURCE_DIR="/tmp/apm-inox-temp"
elif [ -f "${SCRIPT_DIR}/nextn-0.1.0.tar.gz" ]; then
  echo "📂 Descomprimiendo paquete tar.gz..."
  rm -rf /tmp/apm-inox-temp
  mkdir -p /tmp/apm-inox-temp
  tar -xzf "${SCRIPT_DIR}/nextn-0.1.0.tar.gz" -C /tmp/apm-inox-temp
  SOURCE_DIR="/tmp/apm-inox-temp"
else
  echo "❌ No se encontro la carpeta linux-unpacked ni el archivo tar.gz en ${SCRIPT_DIR}"
  exit 1
fi

# Copiar archivos a /opt/apm-inox
echo "📁 Instalando archivos en ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
cp -r "${SOURCE_DIR}/"* "${INSTALL_DIR}/"

# Dar permisos ejecutables
chmod +x "${INSTALL_DIR}/apm-inox"
if [ -f "${INSTALL_DIR}/chrome-sandbox" ]; then
  chmod 4755 "${INSTALL_DIR}/chrome-sandbox" || true
fi

# Crear enlace simbolico global
echo "🔗 Creando comando global '${APP_NAME}'..."
ln -sf "${INSTALL_DIR}/apm-inox" "${BIN_DIR}/${APP_NAME}"

# Instalar Icono
mkdir -p "${ICON_DIR}"
if [ -f "${INSTALL_DIR}/resources/app.asar.unpacked/public/APM INOX LOGO.png" ]; then
  cp "${INSTALL_DIR}/resources/app.asar.unpacked/public/APM INOX LOGO.png" "${ICON_DIR}/${APP_NAME}.png"
fi

# Crear acceso directo .desktop para el menu de aplicaciones
echo "🖥️  Creando acceso directo de escritorio..."
cat << 'EOF' > "${DESKTOP_DIR}/${APP_NAME}.desktop"
[Desktop Entry]
Name=Apm Inox
Comment=Sistema de Gestion y Facturacion Apm Inox
Exec=/opt/apm-inox/apm-inox %U
Icon=apm-inox
Terminal=false
Type=Application
Categories=Office;Finance;
StartupNotify=true
EOF

chmod 644 "${DESKTOP_DIR}/${APP_NAME}.desktop"

echo "==============================================="
echo "✅ Instalacion completada con exito!"
echo "👉 Puedes iniciar la app ejecutando: ${APP_NAME}"
echo "👉 O buscar '${APP_DISPLAY_NAME}' en el menu de aplicaciones."
echo "==============================================="
