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
  email: "ap91.mor@gmail.com"
};

const safe = (n: any) => Number(n || 0);

function createPDFDoc(data: PDFData) {
  const doc = new jsPDF() as any;
  const isFactura = data.title === "Factura";
  const displayNum = data.docNumber || "001-100-XXXXXXXXX";
  const isAutorizado = data.status?.trim().toLowerCase() === "autorizado";

  if (isFactura) {
    const authNumber = data.accessKey || "0000000000000000000000000000000000000000000000000";
    try { doc.addImage('/Amec.png', 'PNG', 15, 10, 35, 35); } catch (e) {}
    doc.setDrawColor(0);
    doc.setLineWidth(0.3); 
    doc.setTextColor(0);
    doc.roundedRect(10, 52, 90, 52, 3, 3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(EMITTER_INFO.name, 15, 60);
    doc.setFontSize(11);
    doc.text('AMEC', 15, 66);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Dirección Matriz:', 15, 72);
    doc.text(EMITTER_INFO.address, 15, 76, { maxWidth: 80 });
    doc.text('Dirección Sucursal:', 15, 82);
    doc.text(EMITTER_INFO.address, 15, 86, { maxWidth: 80 });
    doc.text(`Telf: ${EMITTER_INFO.phones}`, 15, 92, { maxWidth: 80 });
    doc.text(`Email: ${EMITTER_INFO.email}`, 15, 96);
    doc.setFont('helvetica', 'bold');
    doc.text('OBLIGADO A LLEVAR CONTABILIDAD: NO', 15, 101);
    doc.setLineWidth(0.3);
    doc.roundedRect(105, 10, 95, 94, 3, 3, 'S');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`R.U.C.: ${EMITTER_INFO.ruc}`, 110, 20);
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
    doc.roundedRect(10, finalY, 110, 45, 2, 2, 'S');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Información Adicional', 15, finalY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email Cliente: ${data.client.email || 'N/A'}`, 15, finalY + 12);
    doc.text(`Dirección: ${data.client.address || 'S/N'}`, 15, finalY + 18, { maxWidth: 100 });
    const methodDesc = PAYMENT_MAP[data.client.paymentMethod || "01"] || "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO";
    doc.text(`Forma de Pago:`, 15, finalY + 24);
    doc.setFont('helvetica', 'bold');
    doc.text(methodDesc + (data.client.transferNumber ? ` - REF: ${data.client.transferNumber}` : ""), 40, finalY + 24, { maxWidth: 75 });
    doc.setFont('helvetica', 'normal');
    if (data.observations) { doc.text(`Notas: ${data.observations}`, 15, finalY + 34, { maxWidth: 100 }); }
    
    // Summary of internal payments (Optional info for customer)
    if (safe(data.deposit) > 0) {
      doc.setFontSize(7);
      doc.text(`Monto Abonado / Adelantado: $${safe(data.deposit).toFixed(2)}`, 15, finalY + 40);
      doc.text(`Saldo Pendiente: $${safe(data.balance).toFixed(2)}`, 15, finalY + 43);
    }

    const totalX = 125; const valueX = 195; const rowHeight = 5; let currentY = finalY;
    const drawTotalRow = (label: string, value: string, isBold = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setLineWidth(0.3); doc.rect(totalX, currentY, 75, rowHeight, 'S');
      doc.text(label, totalX + 2, currentY + 3.5);
      doc.text(value, valueX - 2, currentY + 3.5, { align: 'right' });
      currentY += rowHeight;
    };
    drawTotalRow('SUBTOTAL 15%', `$0.00`);
    drawTotalRow('SUBTOTAL 0%', `$${safe(data.total).toFixed(2)}`);
    drawTotalRow('SUBTOTAL NO OBJETO DE IVA', '$0.00');
    drawTotalRow('SUBTOTAL EXENTO DE IVA', '$0.00');
    drawTotalRow('SUBTOTAL SIN IMPUESTOS', `$${safe(data.total).toFixed(2)}`);
    drawTotalRow('TOTAL DESCUENTO', '$0.00');
    drawTotalRow('ICE', '$0.00');
    drawTotalRow('IVA 0%', `$0.00`);
    drawTotalRow('IRBPNR', '$0.00');
    drawTotalRow('PROPINA', '$0.00');
    doc.setFontSize(10);
    drawTotalRow('VALOR TOTAL', `$${safe(data.total).toFixed(2)}`, true);
  } else {
    const primaryColor = data.color || (data.title === "Proforma" ? [79, 70, 229] : [41, 136, 163]);
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 8, 'F');
    try { doc.addImage('/Amec.png', 'PNG', 15, 15, 35, 35); } catch (e) {}
    doc.setTextColor(...primaryColor);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(data.title.toUpperCase(), 195, 20, { align: 'right' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(18);
    doc.text(`# ${displayNum}`, 195, 28, { align: 'right' });
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL EMISOR', 195, 35, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(EMITTER_INFO.name, 195, 39, { align: 'right' });
    doc.text(`RUC: ${EMITTER_INFO.ruc}`, 195, 43, { align: 'right' });
    doc.text(EMITTER_INFO.address, 195, 47, { align: 'right', maxWidth: 80 });
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
    
    // Right summary section
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`SUBTOTAL:`, 140, finalYTable);
    doc.text(`$${safe(data.total).toFixed(2)}`, 195, finalYTable, { align: 'right' });
    doc.text(`IVA (0%):`, 140, finalYTable + 6);
    doc.text(`$0.00`, 195, finalYTable + 6, { align: 'right' });
    
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

export function generateMonthlyReportPDF(data: ReportData) {
  if (typeof window === 'undefined') return;
  const doc = new jsPDF();
  const primaryColor: [number, number, number] = [31, 107, 128]; 
  const accentColor: [number, number, number] = [79, 70, 229];

  // Header Decorativo
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 15, 'F');
  try { doc.addImage('/Amec.png', 'PNG', 15, 20, 25, 25); } catch (e) {}
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
