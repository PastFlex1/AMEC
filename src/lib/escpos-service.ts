// Servicio para generar bytes nativos ESC/POS para impresoras térmicas de 76 mm / 80 mm

const COLS = 40; // Ancho estándar seguro para rollos de 76 mm

// Caracteres ESC/POS
const ESC = '\x1B';
const GS = '\x1D';

export const ESCPOS = {
  INIT: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_SIZE: `${GS}!\x11`,
  NORMAL_SIZE: `${GS}!\x00`,
  DOUBLE_HEIGHT: `${GS}!\x01`,
  CUT_FULL: `${GS}V\x00`,
  CUT_PARTIAL: `${GS}V\x01`,
};

function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[áàäâ]/gi, 'a')
    .replace(/[éèëê]/gi, 'e')
    .replace(/[íìïî]/gi, 'i')
    .replace(/[óòöô]/gi, 'o')
    .replace(/[úùüû]/gi, 'u')
    .replace(/[ñ]/gi, 'n')
    .replace(/[Ñ]/gi, 'N')
    .replace(/[^\x20-\x7E\n]/g, ''); // Solo caracteres imprimibles ASCII
}

function padRight(str: string, len: number): string {
  str = sanitizeText(str);
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  str = sanitizeText(str);
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
}

function wrapText(text: string, maxLen: number): string[] {
  const clean = sanitizeText(text);
  if (clean.length <= maxLen) return [clean];
  
  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxLen) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      if (word.length > maxLen) {
        let remaining = word;
        while (remaining.length > maxLen) {
          lines.push(remaining.substring(0, maxLen));
          remaining = remaining.substring(maxLen);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

const SEPARATOR = '-'.repeat(COLS);
const DOUBLE_SEPARATOR = '='.repeat(COLS);

export function buildTicketESCPOS(data: any): Buffer {
  let commands = '';

  // 1. Inicializar impresora
  commands += ESCPOS.INIT;
  
  // 2. Encabezado centrado
  commands += ESCPOS.ALIGN_CENTER;
  commands += ESCPOS.DOUBLE_SIZE;
  commands += 'APM INOX\n';
  commands += ESCPOS.NORMAL_SIZE;
  
  const emitterName = data.emitter?.name || 'Andres Paul Morales Tobar';
  commands += ESCPOS.BOLD_ON;
  commands += `${sanitizeText(emitterName)}\n`;
  commands += ESCPOS.BOLD_OFF;

  const ruc = data.emitter?.ruc || '1725389454001';
  commands += `RUC: ${ruc}\n`;

  const address = data.emitter?.address || 'Figueroa Oe 4-14 y 25 de Mayo';
  const addrLines = wrapText(address, COLS);
  addrLines.forEach(l => { commands += `${l}\n`; });

  const phones = data.emitter?.phones || data.emitter?.phone || '0992350548';
  commands += `Telf: ${phones}\n`;

  commands += `${SEPARATOR}\n`;

  // 3. Titulo de comprobante y numero
  commands += ESCPOS.ALIGN_CENTER;
  commands += ESCPOS.BOLD_ON;
  commands += `${(data.title || 'COMPROBANTE').toUpperCase()}\n`;
  commands += `No: ${data.docNumber || '001-100-000000001'}\n`;
  commands += ESCPOS.BOLD_OFF;

  commands += `${SEPARATOR}\n`;

  // 4. Datos del cliente
  commands += ESCPOS.ALIGN_LEFT;
  commands += `Fecha:   ${data.date || new Date().toLocaleDateString()}\n`;
  
  const clientName = data.client?.name || 'Consumidor Final';
  const nameLines = wrapText(`Cliente: ${clientName}`, COLS);
  nameLines.forEach(l => { commands += `${l}\n`; });

  commands += `RUC/CI:  ${data.client?.ruc || '9999999999999'}\n`;
  if (data.client?.address && data.client.address !== 'S/N') {
    const cAddrLines = wrapText(`Dir:     ${data.client.address}`, COLS);
    cAddrLines.forEach(l => { commands += `${l}\n`; });
  }

  commands += `${DOUBLE_SEPARATOR}\n`;

  // 5. Cabecera de la tabla (CANT: 4, DESC: 26, TOTAL: 8, espacios: 2)
  commands += ESCPOS.BOLD_ON;
  commands += `${padRight('CANT', 4)} ${padRight('DESCRIPCION', 25)} ${padLeft('TOTAL', 8)}\n`;
  commands += ESCPOS.BOLD_OFF;
  commands += `${SEPARATOR}\n`;

  // 6. Filas de productos
  const items = data.items || [];
  items.forEach((item: any) => {
    const qty = Number(item.quantity || 1).toString();
    const unitPrice = Number(item.unitPrice || 0);
    const total = (Number(item.quantity || 1) * unitPrice).toFixed(2);

    const descLines = wrapText(item.description || 'Producto', 25);
    const firstLineDesc = descLines[0] || '';
    
    commands += `${padRight(qty, 4)} ${padRight(firstLineDesc, 25)} ${padLeft('$' + total, 8)}\n`;

    // Lineas adicionales de descripcion si es larga
    for (let i = 1; i < descLines.length; i++) {
      commands += `     ${padRight(descLines[i], 25)}\n`;
    }
  });

  commands += `${SEPARATOR}\n`;

  // 7. Totales (Alineados a la derecha)
  commands += ESCPOS.ALIGN_RIGHT;
  const subtotalVal = Number(data.subtotal !== undefined ? data.subtotal : data.total || 0).toFixed(2);
  const ivaVal = Number(data.iva15 !== undefined ? data.iva15 : data.iva || 0).toFixed(2);
  const totalVal = Number(data.total || 0).toFixed(2);

  commands += `SUBTOTAL: ${padLeft('$' + subtotalVal, 10)}\n`;
  if (Number(ivaVal) > 0) {
    commands += `IVA 15%: ${padLeft('$' + ivaVal, 10)}\n`;
  } else {
    commands += `IVA 0%: ${padLeft('$0.00', 10)}\n`;
  }

  commands += ESCPOS.BOLD_ON;
  commands += `TOTAL: ${padLeft('$' + totalVal, 10)}\n`;
  commands += ESCPOS.BOLD_OFF;

  if (data.deposit && Number(data.deposit) > 0) {
    const depVal = Number(data.deposit).toFixed(2);
    const balVal = Number(data.balance || 0).toFixed(2);
    commands += `ABONADO: ${padLeft('$' + depVal, 10)}\n`;
    commands += ESCPOS.BOLD_ON;
    commands += `SALDO: ${padLeft('$' + balVal, 10)}\n`;
    commands += ESCPOS.BOLD_OFF;
  }

  commands += `${SEPARATOR}\n`;

  // 8. Forma de pago
  commands += ESCPOS.ALIGN_CENTER;
  const paymentMethod = data.client?.paymentMethod || '01';
  const payDesc = paymentMethod === '01' ? 'EFECTIVO' : (paymentMethod === '20' ? 'TRANSFERENCIA / BANCO' : 'OTRO');
  commands += `Forma de Pago: ${payDesc}\n`;

  // 9. Clave de acceso SRI si es Factura
  if (data.accessKey && data.accessKey.length === 49) {
    commands += `\nCLAVE DE ACCESO SRI:\n`;
    commands += `${data.accessKey}\n`;
  }

  // 10. Observaciones
  if (data.observations) {
    commands += `\nNotas: ${sanitizeText(data.observations)}\n`;
  }

  // 11. Despedida y Corte de Papel
  commands += `\n${ESCPOS.BOLD_ON}GRACIAS POR SU COMPRA!${ESCPOS.BOLD_OFF}\n`;
  commands += '\n\n\n\n';
  commands += ESCPOS.CUT_PARTIAL; // Corte de papel térmico

  return Buffer.from(commands, 'binary');
}
