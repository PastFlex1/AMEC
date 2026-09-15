// Servicio para generar texto plano y comandos para EPSON TM-U220 (Rollo de 76 mm)

const COLS = 40; // 40 columnas estándar para rollo de 76 mm en Epson TM-U220 (Font B)

// Comandos ESC/POS específicos de Epson TM-U220
const ESC = '\x1B';
const GS = '\x1D';

export const TMU220_COMMANDS = {
  INIT: `${ESC}@`,                  // Inicializar impresora
  FONT_A: `${ESC}M\x00`,            // Fuente A (33 cols en 76mm)
  FONT_B: `${ESC}M\x01`,            // Fuente B (40/42 cols en 76mm)
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,           // Negrita ON
  BOLD_OFF: `${ESC}E\x00`,          // Negrita OFF
  COLOR_BLACK: `${ESC}r\x00`,       // Cinta negra
  COLOR_RED: `${ESC}r\x01`,         // Cinta roja (si tiene cinta bicolor)
  FEED_LINES: (n: number) => `${ESC}d${String.fromCharCode(n)}`,
  CUT_TMU220: `${ESC}i`,            // Comando nativo de corte para TM-U220
  CUT_PARTIAL_TMU220: `${ESC}m`,    // Corte parcial nativo para TM-U220
};

export function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[áàäâ]/gi, 'a')
    .replace(/[éèëê]/gi, 'e')
    .replace(/[íìïî]/gi, 'i')
    .replace(/[óòöô]/gi, 'o')
    .replace(/[úùüû]/gi, 'u')
    .replace(/[ñ]/gi, 'n')
    .replace(/[Ñ]/gi, 'N')
    .replace(/[^\x20-\x7E\n\r]/g, ''); // Solo caracteres ASCII imprimibles
}

export function centerText(str: string, width = COLS): string {
  const clean = sanitizeText(str);
  if (clean.length >= width) return clean.substring(0, width);
  const leftPad = Math.floor((width - clean.length) / 2);
  const rightPad = width - clean.length - leftPad;
  return ' '.repeat(leftPad) + clean + ' '.repeat(rightPad);
}

export function padRight(str: string, len: number): string {
  const clean = sanitizeText(str);
  if (clean.length >= len) return clean.substring(0, len);
  return clean + ' '.repeat(len - clean.length);
}

export function padLeft(str: string, len: number): string {
  const clean = sanitizeText(str);
  if (clean.length >= len) return clean.substring(0, len);
  return ' '.repeat(len - clean.length) + clean;
}

export function wrapText(text: string, maxLen: number): string[] {
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

/**
 * Genera el ticket en TEXTO PLANO PURO (text/plain)
 * Totalmente legible por cualquier script de Python, terminal o archivo .txt
 */
export function buildPlainTextTMU220(data: any): string {
  const lines: string[] = [];

  // Encabezado
  lines.push(DOUBLE_SEPARATOR);
  lines.push(centerText('APM INOX'));
  const emitterName = data.emitter?.name || 'Andres Paul Morales Tobar';
  lines.push(centerText(emitterName));
  const ruc = data.emitter?.ruc || '1725389454001';
  lines.push(centerText(`RUC: ${ruc}`));
  const address = data.emitter?.address || 'Figueroa Oe 4-14 y 25 de Mayo';
  const addrLines = wrapText(address, COLS);
  addrLines.forEach(l => lines.push(centerText(l)));
  const phones = data.emitter?.phones || data.emitter?.phone || '0992350548';
  lines.push(centerText(`Telf: ${phones}`));
  lines.push(SEPARATOR);

  // Documento
  lines.push(centerText((data.title || 'COMPROBANTE').toUpperCase()));
  lines.push(centerText(`No: ${data.docNumber || '001-100-000000001'}`));
  lines.push(SEPARATOR);

  // Cliente
  lines.push(`Fecha:   ${data.date || new Date().toLocaleDateString()}`);
  const clientName = data.client?.name || 'Consumidor Final';
  const nameLines = wrapText(`Cliente: ${clientName}`, COLS);
  nameLines.forEach(l => lines.push(l));
  lines.push(`RUC/CI:  ${data.client?.ruc || '9999999999999'}`);
  if (data.client?.address && data.client.address !== 'S/N') {
    const cAddrLines = wrapText(`Dir:     ${data.client.address}`, COLS);
    cAddrLines.forEach(l => lines.push(l));
  }
  lines.push(DOUBLE_SEPARATOR);

  // Cabecera de Tabla (40 cols: CANT(4) + ' ' + DESC(24) + ' ' + TOTAL(10) = 40)
  lines.push(`${padRight('CANT', 4)} ${padRight('DESCRIPCION', 24)} ${padLeft('TOTAL', 10)}`);
  lines.push(SEPARATOR);

  // Items
  const items = data.items || [];
  items.forEach((item: any) => {
    const qty = Number(item.quantity || 1).toString();
    const unitPrice = Number(item.unitPrice || 0);
    const total = (Number(item.quantity || 1) * unitPrice).toFixed(2);

    const descLines = wrapText(item.description || 'Producto', 24);
    const firstLineDesc = descLines[0] || '';

    lines.push(`${padRight(qty, 4)} ${padRight(firstLineDesc, 24)} ${padLeft('$' + total, 10)}`);

    for (let i = 1; i < descLines.length; i++) {
      lines.push(`     ${padRight(descLines[i], 24)}`);
    }
  });
  lines.push(SEPARATOR);

  // Totales
  const subtotalVal = Number(data.subtotal !== undefined ? data.subtotal : data.total || 0).toFixed(2);
  const ivaVal = Number(data.iva15 !== undefined ? data.iva15 : data.iva || 0).toFixed(2);
  const totalVal = Number(data.total || 0).toFixed(2);

  lines.push(padLeft(`SUBTOTAL: $${subtotalVal}`, COLS));
  if (Number(ivaVal) > 0) {
    lines.push(padLeft(`IVA 15%: $${ivaVal}`, COLS));
  } else {
    lines.push(padLeft(`IVA 0%: $0.00`, COLS));
  }
  lines.push(padLeft(`TOTAL: $${totalVal}`, COLS));

  if (data.deposit && Number(data.deposit) > 0) {
    const depVal = Number(data.deposit).toFixed(2);
    const balVal = Number(data.balance || 0).toFixed(2);
    lines.push(padLeft(`ABONADO: $${depVal}`, COLS));
    lines.push(padLeft(`SALDO: $${balVal}`, COLS));
  }
  lines.push(SEPARATOR);

  // Forma de pago
  const paymentMethod = data.client?.paymentMethod || '01';
  const payDesc = paymentMethod === '01' ? 'EFECTIVO' : (paymentMethod === '20' ? 'TRANSFERENCIA / BANCO' : 'OTRO');
  lines.push(centerText(`Forma de Pago: ${payDesc}`));

  // Clave de Acceso SRI
  if (data.accessKey && data.accessKey.length === 49) {
    lines.push('');
    lines.push(centerText('CLAVE DE ACCESO SRI:'));
    lines.push(centerText(data.accessKey));
  }

  // Observaciones
  if (data.observations) {
    lines.push('');
    const obsLines = wrapText(`Notas: ${data.observations}`, COLS);
    obsLines.forEach(l => lines.push(l));
  }

  // Despedida
  lines.push('');
  lines.push(centerText('GRACIAS POR SU COMPRA!'));
  lines.push(DOUBLE_SEPARATOR);

  return lines.join('\r\n') + '\r\n';
}

/**
 * Genera el buffer para EPSON TM-U220:
 * Configura la Fuente B (40 columnas), envía el texto plano, avanza papel y corta.
 */
export function buildTicketTMU220Buffer(data: any): Buffer {
  const plainText = buildPlainTextTMU220(data);

  let stream = '';
  // 1. Inicializar TM-U220 y activar Fuente B (40 columnas para 76 mm)
  stream += TMU220_COMMANDS.INIT;
  stream += TMU220_COMMANDS.FONT_B;

  // 2. Adjuntar el texto plano
  stream += plainText;

  // 3. Avanzar 6 líneas para dejar espacio libre de corte
  stream += '\r\n\r\n\r\n\r\n\r\n\r\n';

  // 4. Corte de papel nativo TM-U220 (ESC i)
  stream += TMU220_COMMANDS.CUT_TMU220;

  return Buffer.from(stream, 'binary');
}

export function buildTicketESCPOS(data: any): Buffer {
  return buildTicketTMU220Buffer(data);
}
