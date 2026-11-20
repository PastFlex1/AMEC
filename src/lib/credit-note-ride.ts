import jsPDF from 'jspdf';
import 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { savePDFCrossPlatform } from '@/lib/pdf-service';

/**
 * RIDE (Representación Impresa) de la Nota de Crédito.
 * Los datos se leen del XML autorizado por el SRI, que es la fuente oficial.
 */

export interface CreditNoteRideData {
  emitter: {
    name: string;
    ruc: string;
    address: string;
    phone?: string;
    email?: string;
    regimen?: string;
    obligadoContabilidad?: string;
  };
  docNumber: string;
  accessKey: string;
  authorizationDate?: string;
  issueDate: string;
  client: { name: string; id: string; email?: string };
  modifiedDoc: { number: string; date: string };
  reason: string;
  items: Array<{ code: string; description: string; quantity: number; unitPrice: number; discount: number; total: number }>;
  totals: {
    subtotal15: number;
    subtotal0: number;
    subtotalNoObjeto: number;
    subtotalExento: number;
    subtotal: number;
    discount: number;
    iva15: number;
    total: number;
  };
}

const num = (v: any) => Number(v || 0);
const money = (n: number) => `$${num(n).toFixed(2)}`;

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extrae del texto de respuesta de autorización (XML SOAP, XML simple o JSON)
 * el comprobante notaCredito y los datos de autorización.
 */
export function parseCreditNoteAuthorization(raw: string | undefined | null): {
  xml: string | null;
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
} {
  if (!raw) return { xml: null };
  let text = String(raw);

  // Respuesta JSON
  if (/^\s*[{[]/.test(text)) {
    try {
      const flat = JSON.stringify(JSON.parse(text));
      const comp = flat.match(/"comprobante"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const numero = flat.match(/"numeroAutorizacion"\s*:\s*"(\d+)"/)?.[1];
      const fecha = flat.match(/"fechaAutorizacion"\s*:\s*"([^"]+)"/)?.[1];
      const xml = comp ? JSON.parse(`"${comp[1]}"`) : null;
      return { xml: xml && xml.includes('<notaCredito') ? xml : null, numeroAutorizacion: numero, fechaAutorizacion: fecha };
    } catch {
      /* continuar como texto */
    }
  }

  const numeroAutorizacion = text.match(/<numeroAutorizacion>\s*(\d+)\s*<\/numeroAutorizacion>/)?.[1];
  const fechaAutorizacion = text.match(/<fechaAutorizacion[^>]*>\s*([^<]+?)\s*<\/fechaAutorizacion>/)?.[1];

  let xml: string | null = null;
  const comp = text.match(/<comprobante>([\s\S]*?)<\/comprobante>/);
  if (comp) {
    let inner = comp[1].trim();
    const cdata = inner.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
    inner = cdata ? cdata[1] : inner.includes('&lt;') ? unescapeXml(inner) : inner;
    xml = inner;
  } else if (text.includes('&lt;notaCredito')) {
    text = unescapeXml(text);
  }
  if (!xml) {
    const direct = text.match(/<notaCredito[\s\S]*<\/notaCredito>/);
    xml = direct ? direct[0] : null;
  }
  return { xml, numeroAutorizacion, fechaAutorizacion };
}

/** Lee el XML de la nota de crédito y arma los datos del RIDE. Requiere navegador (DOMParser). */
export function creditNoteRideFromXml(
  xml: string,
  extra: { emitter: CreditNoteRideData['emitter']; numeroAutorizacion?: string; fechaAutorizacion?: string; clientEmail?: string }
): CreditNoteRideData | null {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.getElementsByTagName('parsererror').length > 0) return null;
  const root = dom.getElementsByTagName('notaCredito')[0];
  if (!root) return null;

  const get = (parent: Element | Document, tag: string) => parent.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const infoTrib = root.getElementsByTagName('infoTributaria')[0];
  const info = root.getElementsByTagName('infoNotaCredito')[0];
  if (!infoTrib || !info) return null;

  const items = Array.from(root.getElementsByTagName('detalle')).map(det => ({
    code: get(det, 'codigoInterno') || get(det, 'codigoPrincipal'),
    description: get(det, 'descripcion'),
    quantity: num(get(det, 'cantidad')),
    unitPrice: num(get(det, 'precioUnitario')),
    discount: num(get(det, 'descuento')),
    total: num(get(det, 'precioTotalSinImpuesto')),
  }));

  const totals = { subtotal15: 0, subtotal0: 0, subtotalNoObjeto: 0, subtotalExento: 0, iva15: 0 };
  const totalesNode = info.getElementsByTagName('totalConImpuestos')[0];
  Array.from(totalesNode?.getElementsByTagName('totalImpuesto') || []).forEach(t => {
    const pct = get(t, 'codigoPorcentaje');
    const base = num(get(t, 'baseImponible'));
    const valor = num(get(t, 'valor'));
    if (pct === '4') { totals.subtotal15 += base; totals.iva15 += valor; }
    else if (pct === '6') totals.subtotalNoObjeto += base;
    else if (pct === '7') totals.subtotalExento += base;
    else totals.subtotal0 += base;
  });

  const accessKey = extra.numeroAutorizacion || get(infoTrib, 'claveAcceso');

  return {
    emitter: extra.emitter,
    docNumber: `${get(infoTrib, 'estab')}-${get(infoTrib, 'ptoEmi')}-${get(infoTrib, 'secuencial')}`,
    accessKey,
    authorizationDate: extra.fechaAutorizacion ? formatAuthDate(extra.fechaAutorizacion) : undefined,
    issueDate: get(info, 'fechaEmision'),
    client: { name: get(info, 'razonSocialComprador'), id: get(info, 'identificacionComprador'), email: extra.clientEmail },
    modifiedDoc: { number: get(info, 'numDocModificado'), date: get(info, 'fechaEmisionDocSustento') },
    reason: get(info, 'motivo'),
    items,
    totals: {
      ...totals,
      subtotal: num(get(info, 'totalSinImpuestos')),
      discount: items.reduce((a, i) => a + i.discount, 0),
      total: num(get(info, 'valorModificacion')),
    },
  };
}

function formatAuthDate(value: string) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function createCreditNotePDFDoc(data: CreditNoteRideData) {
  const doc = new jsPDF() as any;
  const e = data.emitter;

  try { doc.addImage('/APM INOX LOGO.png', 'PNG', 15, 10, 35, 35); } catch {}
  doc.setDrawColor(0); doc.setLineWidth(0.3); doc.setTextColor(0);

  // Emisor
  doc.roundedRect(10, 52, 90, 52, 3, 3, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(e.name, 15, 58, { maxWidth: 82 });
  doc.setFontSize(11); doc.text('Apm Inox', 15, 63);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('Dirección Matriz:', 15, 68);
  doc.text(e.address, 15, 72, { maxWidth: 80 });
  doc.text('Dirección Sucursal:', 15, 78);
  doc.text(e.address, 15, 82, { maxWidth: 80 });
  doc.text(`Telf: ${e.phone || ''}`, 15, 88, { maxWidth: 80 });
  doc.text(`Email: ${e.email || ''}`, 15, 92);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('OBLIGADO A LLEVAR CONTABILIDAD: ' + (e.obligadoContabilidad || 'NO'), 15, 96);
  if (e.regimen) {
    doc.text(e.regimen.toUpperCase().includes('RIMPE') ? 'CONTRIBUYENTE RÉGIMEN RIMPE' : 'Régimen: ' + e.regimen, 15, 100);
  }

  // Cuadro del comprobante
  doc.roundedRect(105, 10, 95, 94, 3, 3, 'S');
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`R.U.C.: ${e.ruc}`, 110, 20);
  doc.setFontSize(14); doc.text('NOTA DE CRÉDITO', 110, 30);
  doc.setFontSize(11); doc.text(`No. ${data.docNumber}`, 110, 40);
  doc.setFontSize(8); doc.text('NÚMERO DE AUTORIZACIÓN:', 110, 50);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text(data.accessKey, 110, 55);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('FECHA Y HORA DE AUTORIZACIÓN:', 110, 65);
  doc.setFont('helvetica', 'normal');
  doc.text(data.authorizationDate || 'AUTORIZADO', 110, 69);
  doc.setFont('helvetica', 'bold'); doc.text('AMBIENTE:', 110, 76);
  doc.setFont('helvetica', 'normal'); doc.text('PRODUCCIÓN', 150, 76);
  doc.setFont('helvetica', 'bold'); doc.text('EMISIÓN:', 110, 83);
  doc.setFont('helvetica', 'normal'); doc.text('NORMAL', 150, 83);
  if (typeof document !== 'undefined' && /^\d{49}$/.test(data.accessKey)) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, data.accessKey, { format: 'CODE128', displayValue: false, height: 40, width: 1, margin: 0 });
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 110, 86, 85, 8);
      doc.setFontSize(6); doc.text(data.accessKey, 152.5, 97, { align: 'center' });
    } catch {}
  }

  // Comprador y documento modificado
  doc.roundedRect(10, 108, 190, 42, 1, 1, 'S');
  doc.setFontSize(8);
  const row = (label: string, value: string, y: number) => {
    doc.setFont('helvetica', 'normal'); doc.text(label, 12, y);
    doc.setFont('helvetica', 'bold'); doc.text(value || '', 75, y, { maxWidth: 122 });
  };
  row('Razón Social / Nombres y Apellidos:', (data.client.name || '').toUpperCase(), 114);
  row('Identificación:', data.client.id, 120);
  row('Fecha Emisión:', data.issueDate, 126);
  doc.setDrawColor(180); doc.line(12, 129, 198, 129); doc.setDrawColor(0);
  row('Comprobante que se modifica:', `FACTURA  ${data.modifiedDoc.number}`, 135);
  row('Fecha Emisión (Comprobante a modificar):', data.modifiedDoc.date, 141);
  row('Razón de Modificación:', data.reason, 147);

  // Detalle
  doc.autoTable({
    startY: 154, margin: { left: 10, right: 10 },
    head: [['Cod. Principal', 'Cantidad', 'Descripción', 'Precio Unitario', 'Descuento', 'Precio Total']],
    body: data.items.map(i => [i.code, num(i.quantity).toFixed(2), i.description, money(i.unitPrice), money(i.discount), money(i.total)]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0], valign: 'middle', textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });

  const finalY = doc.lastAutoTable.finalY + 5;

  // Información adicional
  doc.roundedRect(10, finalY, 110, 30, 2, 2, 'S');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('Información Adicional', 15, finalY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Email Cliente: ${data.client.email || 'N/A'}`, 15, finalY + 12);
  doc.text(`Documento que anula: Factura ${data.modifiedDoc.number}`, 15, finalY + 18, { maxWidth: 100 });

  // Totales
  const totalX = 125; const valueX = 195; const h = 5; let y = finalY;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.rect(totalX, y, 75, h, 'S');
    doc.text(label, totalX + 2, y + 3.5);
    doc.text(value, valueX - 2, y + 3.5, { align: 'right' });
    y += h;
  };
  const t = data.totals;
  totalRow('SUBTOTAL 15%', money(t.subtotal15));
  totalRow('SUBTOTAL 0%', money(t.subtotal0));
  totalRow('SUBTOTAL NO OBJETO DE IVA', money(t.subtotalNoObjeto));
  totalRow('SUBTOTAL EXENTO DE IVA', money(t.subtotalExento));
  totalRow('SUBTOTAL SIN IMPUESTOS', money(t.subtotal));
  totalRow('TOTAL DESCUENTO', money(t.discount));
  totalRow('ICE', '$0.00');
  totalRow('IVA 15%', money(t.iva15));
  totalRow('IRBPNR', '$0.00');
  doc.setFontSize(10);
  totalRow('VALOR TOTAL', money(t.total), true);

  return doc;
}

/** PDF en base64 (por ejemplo, para adjuntarlo a un correo). */
export function getCreditNotePDFBase64(data: CreditNoteRideData): string {
  return createCreditNotePDFDoc(data).output('datauristring').split(',')[1];
}

export function generateCreditNotePDF(data: CreditNoteRideData) {
  if (typeof window === 'undefined') return;
  savePDFCrossPlatform(createCreditNotePDFDoc(data), `Nota_Credito_${data.docNumber}.pdf`);
}
