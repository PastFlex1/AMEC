import jsPDF from 'jspdf';
import 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

interface PDFData {
  title: string;
  client: {
    name: string;
    ruc: string;
    address: string;
    email: string;
    phone?: string;
    paymentMethod?: string;
    transferNumber?: string;
  };
  items: any[];
  subtotal: number;
  iva: number;
  total: number;
  subtotal15?: number;
  subtotal0?: number;
  subtotalNoObjeto?: number;
  subtotalExento?: number;
  iva15?: number;
  regimen?: string;
  obligadoContabilidad?: string;
  emitter?: {
    name: string;
    ruc: string;
    address: string;
    phone?: string;
    phones?: string;
    email: string;
    regimen?: string;
    obligadoContabilidad?: string;
  };
  deposit?: number;
  balance?: number;
  date: string;
  time?: string;
  dueDate?: string;
  docNumber?: string;
  observations?: string;
  accessKey?: string; 
  status?: string;
  color?: [number, number, number]; 
}

interface ReportData {
  monthName: string;
  year: string;
  stats: {
    totalRev: number;
    count: number;
    totalCommission: number;
    facturasTotal: number;
    proformasTotal: number;
    notesTotal: number;
  };
  performance: Array<{
    name: string;
    total: number;
    count: number;
    commission: number;
    invoicesCount: number;
    proformasCount: number;
    notesCount: number;
  }>;
}

const PAYMENT_MAP: Record<string, string> = {
  "01": "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO",
  "15": "COMPENSACIÓN DE DEUDAS",
  "16": "TARJETA DE DÉBITO",
  "17": "DINERO ELECTRÓNICO",
  "18": "TARJETA PREPAGO",
  "19": "TARJETA DE CRÉDITO",
  "20": "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO",
};

const EMITTER_INFO = {
  name: "Andrés Paul Morales Tobar",
  ruc: "1725389454001",
  address: "Av Jaime roldos oe2-128 y Francisco Sánchez",
  phones: "025158093 - 0992769292 - 0989411821",
  email: "amec.marcando.diferencia@hotmail.com"
};

const safe = (n: any) => Number(n || 0);

function createPDFDoc(data: PDFData) {
  const doc = new jsPDF() as any;
  const isFactura = data.title === "Factura";
  const displayNum = data.docNumber || "001-100-XXXXXXXXX";
  const isAutorizado = data.status?.trim().toLowerCase() === "autorizado";

  const emitter = data.emitter || {
    name: EMITTER_INFO.name,
    ruc: EMITTER_INFO.ruc,
    address: EMITTER_INFO.address,
    phones: EMITTER_INFO.phones,
    email: EMITTER_INFO.email,
    regimen: data.regimen || "RIMPE - EMPRENDEDOR",
    obligadoContabilidad: data.obligadoContabilidad || "NO"
  };

  if (isFactura) {
    const authNumber = data.accessKey || "0000000000000000000000000000000000000000000000000";
    try { doc.addImage('/Amec.jpeg', 'PNG', 15, 10, 35, 35); } catch (e) {}
    doc.setDrawColor(0);
    doc.setLineWidth(0.3); 
    doc.setTextColor(0);
    doc.roundedRect(10, 52, 90, 52, 3, 3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(emitter.name, 15, 58);
    doc.setFontSize(11);
    doc.text('AMEC', 15, 63);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Dirección Matriz:', 15, 68);
    doc.text(emitter.address, 15, 72, { maxWidth: 80 });
    doc.text('Dirección Sucursal:', 15, 78);
    doc.text(emitter.address, 15, 82, { maxWidth: 80 });
    doc.text(`Telf: ${emitter.phones || emitter.phone || ""}`, 15, 88, { maxWidth: 80 });
    doc.text(`Email: ${emitter.email}`, 15, 92);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('OBLIGADO A LLEVAR CONTABILIDAD: ' + (emitter.obligadoContabilidad || "NO"), 15, 96);
    if (emitter.regimen) {
      doc.text('Régimen: ' + emitter.regimen, 15, 99);
      if (emitter.regimen.toUpperCase().includes("RIMPE")) {
        doc.text('Contribuyente Régimen RIMPE', 15, 102);
      }
    }
    doc.setLineWidth(0.3);
    doc.roundedRect(105, 10, 95, 94, 3, 3, 'S');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`R.U.C.: ${emitter.ruc}`, 110, 20);
    doc.setFontSize(14);
    doc.text('FACTURA', 110, 30);
    doc.setFontSize(11);
    doc.text(`No. ${displayNum}`, 110, 40);
    doc.setFontSize(8);
    doc.text('NÚMERO DE AUTORIZACIÓN:', 110, 50);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(authNumber, 110, 55); 
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA Y HORA DE AUTORIZACIÓN:', 110, 65);
    doc.setFont('helvetica', 'normal');
    doc.text(isAutorizado ? (data.time || new Date().toLocaleString()) : "PENDIENTE", 110, 69);
    doc.setFont('helvetica', 'bold');
    doc.text('AMBIENTE:', 110, 76);
    doc.setFont('helvetica', 'normal');
    doc.text('PRODUCCIÓN', 150, 76);
    doc.setFont('helvetica', 'bold');
    doc.text('EMISIÓN:', 110, 83);
    doc.setFont('helvetica', 'normal');
    doc.text('NORMAL', 150, 83);
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, authNumber, { format: "CODE128", displayValue: false, height: 40, width: 1, margin: 0 });
        const barcodeData = canvas.toDataURL("image/png");
        doc.addImage(barcodeData, 'PNG', 110, 86, 85, 8);
        doc.setFontSize(6);
        doc.text(authNumber, 152.5, 97, { align: 'center' });
      } catch (e) {}
    }
    doc.setLineWidth(0.3);
    doc.roundedRect(10, 108, 190, 30, 1, 1, 'S');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razón Social / Nombres y Apellidos:`, 12, 114);
    doc.setFont('helvetica', 'bold');
    doc.text(data.client.name.toUpperCase(), 65, 114);
    doc.setFont('helvetica', 'normal');
    doc.text(`Identificación:`, 12, 120);
    doc.setFont('helvetica', 'bold');
    doc.text(data.client.ruc, 65, 120);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha:`, 12, 126);
    doc.setFont('helvetica', 'bold');
    doc.text(data.date, 65, 126);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dirección:`, 12, 132);
    doc.text(data.client.address || 'S/N', 65, 132, { maxWidth: 130 });
    const tableRows = data.items.map((item) => {
      const pUnit = safe(item.unitPrice);
      const pTotal = safe(item.quantity) * pUnit;
      return [
        '0101', '0101', safe(item.quantity).toFixed(2),
        item.description, '', `$${pUnit.toFixed(2)}`,
        '0.00', '0.00', '0.00', `$${pTotal.toFixed(2)}`
      ];
    });
    doc.autoTable({
      startY: 142, margin: { left: 10, right: 10 },
      head: [['Cod. Principal', 'Cod. Auxiliar', 'Cantidad', 'Descripción', 'Detalle Adicional', 'Precio Unitario', 'Subsidio', 'Precio sin Subsidio', 'Descuento', 'Precio Total']],
      body: tableRows, theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0], valign: 'middle', textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, fontStyle: 'bold', halign: 'center' }
    });
    const finalY = (doc as any).lastAutoTable.finalY + 5;
    doc.setLineWidth(0.3);
    doc.roundedRect(10, finalY, 110, 58, 2, 2, 'S');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Información Adicional', 15, finalY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email Cliente: ${data.client.email || 'N/A'}`, 15, finalY + 12);
    doc.text(`Teléfono: ${data.client.phone || 'N/A'}`, 15, finalY + 18);
    doc.text(`Dirección: ${data.client.address || 'S/N'}`, 15, finalY + 24, { maxWidth: 100 });
    const methodDesc = PAYMENT_MAP[data.client.paymentMethod || "01"] || "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO";
    doc.text(`Forma de Pago:`, 15, finalY + 30);
    doc.setFont('helvetica', 'bold');
    doc.text(methodDesc + (data.client.transferNumber ? ` - REF: ${data.client.transferNumber}` : ""), 40, finalY + 30, { maxWidth: 75 });
    doc.setFont('helvetica', 'normal');
    if (data.observations) { doc.text(`Notas: ${data.observations}`, 15, finalY + 40, { maxWidth: 100 }); }
    
    // Summary of internal payments (Optional info for customer)
    if (safe(data.deposit) > 0) {
      doc.setFontSize(7);
      doc.text(`Monto Abonado / Adelantado: $${safe(data.deposit).toFixed(2)}`, 15, finalY + 48);
      doc.text(`Saldo Pendiente: $${safe(data.balance).toFixed(2)}`, 15, finalY + 52);
    }

    const totalX = 125; const valueX = 195; const rowHeight = 5; let currentY = finalY;
    const drawTotalRow = (label: string, value: string, isBold = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setLineWidth(0.3); doc.rect(totalX, currentY, 75, rowHeight, 'S');
      doc.text(label, totalX + 2, currentY + 3.5);
      doc.text(value, valueX - 2, currentY + 3.5, { align: 'right' });
      currentY += rowHeight;
    };
    const sub15 = data.subtotal15 !== undefined ? data.subtotal15 : 0;
    const sub0 = data.subtotal0 !== undefined ? data.subtotal0 : data.total;
    const subNoObj = data.subtotalNoObjeto !== undefined ? data.subtotalNoObjeto : 0;
    const subEx = data.subtotalExento !== undefined ? data.subtotalExento : 0;
    const subtotalSinImp = data.subtotal !== undefined ? data.subtotal : data.total;
    const ivaValue = data.iva15 !== undefined ? data.iva15 : 0;

    drawTotalRow('SUBTOTAL 15%', `$${safe(sub15).toFixed(2)}`);
    drawTotalRow('SUBTOTAL 0%', `$${safe(sub0).toFixed(2)}`);
    drawTotalRow('SUBTOTAL NO OBJETO DE IVA', `$${safe(subNoObj).toFixed(2)}`);
    drawTotalRow('SUBTOTAL EXENTO DE IVA', `$${safe(subEx).toFixed(2)}`);
    drawTotalRow('SUBTOTAL SIN IMPUESTOS', `$${safe(subtotalSinImp).toFixed(2)}`);
    drawTotalRow('TOTAL DESCUENTO', '$0.00');
    drawTotalRow('ICE', '$0.00');
    drawTotalRow('IVA 15%', `$${safe(ivaValue).toFixed(2)}`);
    drawTotalRow('IVA 0%', `$0.00`);
    drawTotalRow('IRBPNR', '$0.00');
    drawTotalRow('PROPINA', '$0.00');
    doc.setFontSize(10);
    drawTotalRow('VALOR TOTAL', `$${safe(data.total).toFixed(2)}`, true);
  } else {
    const primaryColor = data.color || (data.title === "Proforma" ? [79, 70, 229] : [41, 136, 163]);
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 8, 'F');
    try { doc.addImage('/Amec.jpeg', 'PNG', 15, 15, 35, 35); } catch (e) {}
    doc.setTextColor(...primaryColor);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(data.title.toUpperCase(), 195, 20, { align: 'right' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(18);
    doc.text(`# ${displayNum}`, 195, 28, { align: 'right' });
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL EMISOR', 195, 35, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(emitter.name, 195, 39, { align: 'right' });
    doc.text(`RUC: ${emitter.ruc}`, 195, 43, { align: 'right' });
    doc.text(emitter.address, 195, 47, { align: 'right', maxWidth: 80 });
    doc.text(`Telf: ${EMITTER_INFO.phones}`, 195, 55, { align: 'right', maxWidth: 80 });
    doc.text(`Email: ${EMITTER_INFO.email}`, 195, 63, { align: 'right' });
    doc.setDrawColor(...primaryColor); doc.setLineWidth(0.5);
    doc.line(15, 68, 195, 68);
    doc.setFontSize(10); doc.setTextColor(...primaryColor);
    doc.text('DATOS DEL RECEPTOR', 15, 75); doc.text('DETALLES DE EMISIÓN', 120, 75);
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.1);
    doc.line(15, 77, 95, 77); doc.line(120, 77, 195, 77);
    doc.setTextColor(80, 80, 80); doc.setFontSize(9);
    let y = 85;
    doc.text(`Razón Social: ${data.client.name}`, 15, y);
    doc.text(`RUC / C.I.: ${data.client.ruc}`, 15, y + 7);
    doc.text(`Dirección: ${data.client.address || 'S/N'}`, 15, y + 14);
    doc.text(`Fecha Emisión: ${data.date}`, 120, y);
    doc.text(`Pago: ${PAYMENT_MAP[data.client.paymentMethod || "01"] || "EFECTIVO"}`, 120, y + 7);
    const tableRows = data.items.map(item => [item.description, safe(item.quantity).toString(), `$${safe(item.unitPrice).toFixed(2)}`, `$${safe(item.quantity * item.unitPrice).toFixed(2)}`]);
    doc.autoTable({ 
      startY: 110, head: [['Descripción', 'Cant.', 'Precio Unit.', 'Total']], 
      body: tableRows, theme: 'striped', headStyles: { fillColor: primaryColor, textColor: 255 }
    });
    
    const finalYTable = (doc as any).lastAutoTable.finalY + 10;
    
    const sub15 = data.subtotal15 !== undefined ? data.subtotal15 : 0;
    const sub0 = data.subtotal0 !== undefined ? data.subtotal0 : data.total;
    const ivaVal = data.iva15 !== undefined ? data.iva15 : 0;

    // Right summary section
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`SUBTOTAL:`, 140, finalYTable);
    doc.text(`$${safe(data.subtotal !== undefined ? data.subtotal : data.total).toFixed(2)}`, 195, finalYTable, { align: 'right' });
    if (sub15 > 0) {
      doc.text(`IVA (15%):`, 140, finalYTable + 6);
      doc.text(`$${safe(ivaVal).toFixed(2)}`, 195, finalYTable + 6, { align: 'right' });
    } else {
      doc.text(`IVA (0%):`, 140, finalYTable + 6);
      doc.text(`$0.00`, 195, finalYTable + 6, { align: 'right' });
    }
    
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`VALOR TOTAL:`, 140, finalYTable + 14);
    doc.text(`$${safe(data.total).toFixed(2)}`, 195, finalYTable + 14, { align: 'right' });

    // Abono & Saldo section
    if (safe(data.deposit) > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 100, 0);
      doc.text(`MONTO ABONADO / ADELANTADO:`, 140, finalYTable + 22);
      doc.text(`$${safe(data.deposit).toFixed(2)}`, 195, finalYTable + 22, { align: 'right' });
      
      doc.setFontSize(12); doc.setTextColor(200, 0, 0);
      doc.text(`SALDO PENDIENTE:`, 140, finalYTable + 30);
      doc.text(`$${safe(data.balance).toFixed(2)}`, 195, finalYTable + 30, { align: 'right' });
    }

    doc.setTextColor(0, 0, 0);
    if (data.observations) {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic');
      doc.text('Observaciones:', 15, finalYTable + 10);
      doc.text(data.observations, 15, finalYTable + 15, { maxWidth: 110 });
    }
  }
  return doc;
}

export function generateBillingPDF(data: PDFData) {
  if (typeof window === 'undefined') return;
  const doc = createPDFDoc(data);
  doc.save(`${data.title.replace(/\s/g, '_')}_${data.docNumber || 'DOC'}.pdf`);
}

export function getBillingPDFBase64(data: PDFData): string {
  if (typeof window === 'undefined') return '';
  const doc = createPDFDoc(data);
  return doc.output('datauristring').split(',')[1];
}

function createTicketPDFDoc(data: PDFData) {
  // calculate height
  const itemsHeight = data.items.reduce((acc, item) => {
    // est 4mm per line, wrap after 40 chars
    const textLines = Math.ceil(item.description.length / 40) || 1;
    return acc + (textLines * 4) + 2;
  }, 0);
  
  const height = 140 + itemsHeight + (data.observations ? 20 : 0) + (data.accessKey ? 20 : 0);
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, height]
  });
  
  const displayNum = data.docNumber || "001-100-XXXXXXXXX";
  const emitter = data.emitter || {
    name: EMITTER_INFO.name,
    ruc: EMITTER_INFO.ruc,
    address: EMITTER_INFO.address,
    phones: EMITTER_INFO.phones,
    email: EMITTER_INFO.email
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('AMEC', 40, 10, { align: 'center' });
  
  doc.setFontSize(9);
  doc.text(emitter.name, 40, 15, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`RUC: ${emitter.ruc}`, 40, 20, { align: 'center' });
  const addrLines = doc.splitTextToSize(emitter.address, 70);
  doc.text(addrLines, 40, 25, { align: 'center' });
  const addrHeight = addrLines.length * 4;
  
  doc.text(`Telf: ${emitter.phones || emitter.phone || ""}`, 40, 25 + addrHeight, { align: 'center' });
  
  let y = 28 + addrHeight;
  
  doc.setLineWidth(0.3);
  (doc as any).setLineDash([1, 1], 0);
  doc.line(5, y, 75, y);
  (doc as any).setLineDash([], 0);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(data.title.toUpperCase(), 40, y, { align: 'center' });
  
  y += 5;
  doc.setFontSize(9);
  doc.text(`No: ${displayNum}`, 40, y, { align: 'center' });
  
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha: ${data.date}`, 5, y);
  y += 5;
  doc.text(`Cliente: ${data.client.name}`, 5, y, { maxWidth: 70 });
  y += 5;
  doc.text(`RUC/CI: ${data.client.ruc}`, 5, y);
  y += 5;
  
  (doc as any).setLineDash([1, 1], 0);
  doc.line(5, y, 75, y);
  (doc as any).setLineDash([], 0);
  y += 5;
  
  doc.setFont('helvetica', 'bold');
  doc.text('CANT', 5, y);
  doc.text('DESCRIPCION', 18, y);
  doc.text('TOTAL', 75, y, { align: 'right' });
  y += 2;
  
  (doc as any).setLineDash([1, 1], 0);
  doc.line(5, y, 75, y);
  (doc as any).setLineDash([], 0);
  y += 5;
  
  doc.setFont('helvetica', 'normal');
  data.items.forEach((item) => {
    const qty = safe(item.quantity);
    const total = safe(item.quantity * item.unitPrice);
    
    doc.text(qty.toString(), 5, y);
    doc.text(`$${total.toFixed(2)}`, 75, y, { align: 'right' });
    
    // adjust y based on text length of description
    const textLines = doc.splitTextToSize(item.description, 40);
    doc.text(textLines, 18, y);
    y += (textLines.length * 4) + 2;
  });
  
  (doc as any).setLineDash([1, 1], 0);
  doc.line(5, y, 75, y);
  (doc as any).setLineDash([], 0);
  y += 6;
  
  doc.setFont('helvetica', 'normal');
  doc.text('SUBTOTAL:', 35, y);
  doc.text(`$${safe(data.subtotal !== undefined ? data.subtotal : data.total).toFixed(2)}`, 75, y, { align: 'right' });
  y += 5;
  
  const ivaVal = data.iva15 !== undefined ? data.iva15 : 0;
  if (ivaVal > 0) {
    doc.text('IVA 15%:', 35, y);
  } else {
    doc.text('IVA 0%:', 35, y);
  }
  doc.text(`$${safe(ivaVal).toFixed(2)}`, 75, y, { align: 'right' });
  y += 6;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', 35, y);
  doc.text(`$${safe(data.total).toFixed(2)}`, 75, y, { align: 'right' });
  y += 6;
  
  if (safe(data.deposit) > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('ABONADO:', 35, y);
    doc.text(`$${safe(data.deposit).toFixed(2)}`, 75, y, { align: 'right' });
    y += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text('SALDO:', 35, y);
    doc.text(`$${safe(data.balance).toFixed(2)}`, 75, y, { align: 'right' });
    y += 6;
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const payDesc = PAYMENT_MAP[data.client.paymentMethod || "01"] || "EFECTIVO";
  const payLines = doc.splitTextToSize(`Forma de pago: ${payDesc}`, 70);
  doc.text(payLines, 40, y, { align: 'center' });
  y += payLines.length * 4 + 2;
  
  if (data.accessKey) {
    doc.setFontSize(6);
    doc.text('CLAVE DE ACCESO / AUTORIZACION:', 40, y, { align: 'center' });
    y += 4;
    doc.text(data.accessKey, 40, y, { align: 'center', maxWidth: 75 });
    
    // Add Barcode if available
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, data.accessKey, { format: "CODE128", displayValue: false, height: 30, width: 1, margin: 0 });
        const barcodeData = canvas.toDataURL("image/png");
        y += 2;
        doc.addImage(barcodeData, 'PNG', 5, y, 70, 10);
        y += 12;
      } catch (e) {}
    } else {
        y += 8;
    }
  }
  
  if (data.observations) {
    doc.setFontSize(7);
    const obsLines = doc.splitTextToSize(`Notas: ${data.observations}`, 70);
    doc.text(obsLines, 40, y, { align: 'center' });
    y += obsLines.length * 4 + 2;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('GRACIAS POR SU COMPRA', 40, y, { align: 'center' });
  
  return doc;
}

export function generateThermalPDF(data: PDFData) {
  if (typeof window === 'undefined') return;
  const doc = createTicketPDFDoc(data);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

export function generateMonthlyReportPDF(data: ReportData) {
  if (typeof window === 'undefined') return;
  const doc = new jsPDF();
  const primaryColor: [number, number, number] = [31, 107, 128]; 
  const accentColor: [number, number, number] = [79, 70, 229];

  // Header Decorativo
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 15, 'F');
  try { doc.addImage('/Amec.jpeg', 'PNG', 15, 20, 25, 25); } catch (e) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...primaryColor);
  doc.text('REPORTE EJECUTIVO MENSUAL', 195, 35, { align: 'right' });
  doc.setFontSize(12); doc.setTextColor(100, 100, 100);
  doc.text(`Ventas Reales: ${data.monthName} ${data.year}`, 195, 42, { align: 'right' });

  // Tarjetas de Resumen (Excluyendo Proformas)
  const drawStatCard = (x: number, y: number, w: number, label: string, value: string, valueColor: [number, number, number]) => {
    doc.setDrawColor(230, 230, 230); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, 28, 2, 2, 'FD');
    doc.setFillColor(...valueColor); doc.rect(x, y, 2, 28, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(label, x + 4, y + 8);
    doc.setFontSize(10); doc.setTextColor(...valueColor);
    doc.text(value, x + 4, y + 20);
  };

  const cardW = 58;
  drawStatCard(15, 60, cardW, 'FACTURAS (SRI)', `$${safe(data.stats.facturasTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, [31, 107, 128]);
  drawStatCard(15 + cardW + 3, 60, cardW, 'NOTAS DE VENTA', `$${safe(data.stats.notesTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, [41, 136, 163]);
  drawStatCard(15 + (cardW + 3) * 2, 60, cardW, 'COMISIONES (5%)', `$${safe(data.stats.totalCommission).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, [16, 185, 129]);

  // Gráfica de Barras Horizontal (Solo Facturas + Notas)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('LIDERAZGO COMERCIAL (VENTAS REALES)', 15, 105);
  
  const sortedPerformance = [...data.performance].sort((a, b) => b.total - a.total).slice(0, 5);
  const maxTotal = Math.max(...sortedPerformance.map(p => p.total), 1);
  const chartStartX = 55;
  const chartMaxW = 130;

  sortedPerformance.forEach((p, i) => {
    const y = 115 + (i * 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(p.name.substring(0, 18), 15, y + 5);
    
    const barW = (p.total / maxTotal) * chartMaxW;
    doc.setFillColor(...primaryColor);
    doc.rect(chartStartX, y, barW, 6, 'F');
    
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`$${safe(p.total).toLocaleString()}`, chartStartX + barW + 2, y + 4.5);
  });

  // Arquitectura Detallada de Comprobantes (Sin Proformas)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('ARQUITECTURA DE EMISIÓN POR INTEGRANTE', 15, 185);
  
  const tableRows = data.performance.map(p => [
    p.name,
    p.invoicesCount.toString(),
    p.notesCount.toString(),
    `$${safe(p.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    `$${safe(p.commission).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  ]);

  (doc as any).autoTable({
    startY: 192,
    head: [['Nombre Personal', 'Facturas', 'Notas', 'Venta Real Mes', 'Comis. (5%)']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, halign: 'center' },
    columnStyles: { 
      0: { halign: 'left', fontStyle: 'bold', width: 60 },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(7); doc.setTextColor(180, 180, 180);
  doc.text(`Reporte de ventas reales (Excluye Proformas). Generado el ${new Date().toLocaleString()}`, 105, finalY, { align: 'center' });
  doc.save(`Reporte_Ventas_AMEC_${data.monthName}_${data.year}.pdf`);
}

export interface WeeklyReportData {
  weekStart: string;
  weekEnd: string;
  stats: {
    concretadasCount: number;
    concretadasTotal: number;
    abonadasCount: number;
    abonadasTotal: number;
    abonadasCobrado: number;
    pendientesCount: number;
    pendientesTotal: number;
    totalVentas: number;
    totalCount: number;
    totalSaldoPendiente: number;
  };
  items: any[];
}

export function generateWeeklyReportPDF(data: WeeklyReportData) {
  if (typeof window === 'undefined') return;
  const doc = new jsPDF() as any;
  const primaryColor: [number, number, number] = [79, 70, 229]; 
  const concretadaColor: [number, number, number] = [16, 185, 129];
  const abonadaColor: [number, number, number] = [245, 158, 11];
  const pendienteColor: [number, number, number] = [225, 29, 72];

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 15, 'F');
  try { doc.addImage('/Amec.jpeg', 'PNG', 15, 20, 25, 25); } catch (e) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...primaryColor);
  doc.text('REPORTE EJECUTIVO SEMANAL', 195, 35, { align: 'right' });
  doc.setFontSize(12); doc.setTextColor(100, 100, 100);
  doc.text(`Semana: ${data.weekStart} - ${data.weekEnd}`, 195, 42, { align: 'right' });

  // Summary Cards
  const drawStatCard = (x: number, y: number, w: number, label: string, value: string, countStr: string, valueColor: [number, number, number]) => {
    doc.setDrawColor(230, 230, 230); doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, 28, 2, 2, 'FD');
    doc.setFillColor(...valueColor); doc.rect(x, y, 2, 28, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(label, x + 4, y + 8);
    doc.setFontSize(10); doc.setTextColor(...valueColor);
    doc.text(value, x + 4, y + 16);
    doc.setFontSize(6); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
    doc.text(countStr, x + 4, y + 22);
  };

  const cardW = 58;
  drawStatCard(15, 60, cardW, 'VENTAS CONCRETADAS', `$${safe(data.stats.concretadasTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `${data.stats.concretadasCount} docs pagados`, concretadaColor);
  drawStatCard(15 + cardW + 3, 60, cardW, 'ABONOS RECAUDADOS', `$${safe(data.stats.abonadasCobrado).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `${data.stats.abonadasCount} docs con abono`, abonadaColor);
  drawStatCard(15 + (cardW + 3) * 2, 60, cardW, 'SALDO PENDIENTE', `$${safe(data.stats.totalSaldoPendiente).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `Por cobrar en total`, pendienteColor);

  // Table Details
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('DETALLE DE DOCUMENTOS EMITIDOS', 15, 105);

  const tableRows = data.items.map(doc => {
    let stat = (doc.status || "").toLowerCase();
    let bal = Number(doc.balance || 0);
    let dep = Number(doc.deposit || 0);
    
    let statusText = "PENDIENTE";
    if (doc.type === 'Proforma') {
      statusText = "COTIZACIÓN";
    } else if (stat === 'pagado' || stat === 'concretada' || stat === 'cancelado' || bal <= 0) {
      statusText = "AL DÍA (PAGADO)";
    } else if (stat === 'abonado' || (dep > 0 && bal > 0)) {
      statusText = "ABONADA";
    }

    const dateStr = doc.date?.toDate 
      ? new Date(doc.date.toDate()).toLocaleDateString()
      : (typeof doc.date === 'string' ? doc.date.substring(0, 10) : "");

    return [
      doc.type === 'Factura' ? 'Factura' : (doc.type === 'Proforma' ? 'Proforma' : 'Nota de Venta'),
      doc.noteNumber || doc.docNumber || 'S/N',
      doc.clientData?.name || doc.client?.name || 'Consumidor Final',
      dateStr,
      statusText,
      `$${safe(doc.deposit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `$${safe(doc.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `$${safe(doc.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    ];
  });

  doc.autoTable({
    startY: 112,
    head: [['Tipo', 'Número', 'Cliente', 'Fecha', 'Estado', 'Abono', 'Saldo', 'Total']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 7, halign: 'center' },
    columnStyles: { 
      2: { halign: 'left', width: 45 },
      4: { fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }
    },
    willDrawCell: function(data: any) {
      if (data.section === 'body' && data.column.index === 4) {
        if (data.cell.raw === 'AL DÍA (PAGADO)') doc.setTextColor(...concretadaColor);
        else if (data.cell.raw === 'ABONADA') doc.setTextColor(...abonadaColor);
        else if (data.cell.raw === 'PENDIENTE') doc.setTextColor(...pendienteColor);
        else if (data.cell.raw === 'COTIZACIÓN') doc.setTextColor(150, 150, 150);
      }
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Total summary footer
  doc.setDrawColor(200, 200, 200); doc.setFillColor(250, 250, 250);
  doc.roundedRect(125, finalY, 70, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text('TOTAL VENTAS:', 130, finalY + 6.5);
  doc.text(`$${safe(data.stats.totalVentas).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 190, finalY + 6.5, { align: 'right' });
  doc.setTextColor(225, 29, 72); // Rojo para saldo pendiente
  doc.text('SALDO PENDIENTE:', 130, finalY + 12.5);
  doc.text(`$${safe(data.stats.totalSaldoPendiente).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 190, finalY + 12.5, { align: 'right' });

  doc.setFontSize(7); doc.setTextColor(180, 180, 180);
  doc.text(`Reporte de estado de cartera (Semanal). Generado el ${new Date().toLocaleString()}`, 105, finalY + 25, { align: 'center' });
  
  doc.save(`Reporte_Ventas_Semanal_AMEC.pdf`);
}
