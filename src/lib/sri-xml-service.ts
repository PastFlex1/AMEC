/**
 * @fileOverview Servicio para la generación de XML de Facturas y Notas de Crédito bajo el estándar del SRI (Ecuador).
 * Implementa la Clave de Acceso de 49 dígitos siguiendo la tabla oficial de 9 campos y el Módulo 11 exacto.
 * Incluye lógica robusta para cálculos numéricos seguros.
 */

export interface SRIInvoiceData {
  rucEmisor: string;
  razonSocialEmisor: string;
  nombreComercialEmisor?: string;
  dirMatriz: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  fechaEmision: string; // Formato DD/MM/YYYY
  cliente: {
    razonSocial: string;
    identificacion: string;
    direccion?: string;
    email?: string;
    telefono?: string;
  };
  items: Array<{
    codigo?: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento?: number;
    ivaRate?: string | number;
  }>;
  formaPago: string;
  tipoComprobante?: string; // "01" Factura, "04" Nota de Crédito
  facturaModificada?: {
    numero: string;
    fecha: string;
  };
  observaciones?: string;
  transferNumber?: string;
  deposit?: number;
  balance?: number;
  regimen?: string;
  obligadoContabilidad?: string;
}

/**
 * Función auxiliar para asegurar que un valor sea numérico y no nulo.
 */
const safe = (n: any) => Number(n || 0);

/**
 * Algoritmo Módulo 11 exacto proporcionado por el usuario.
 */
export function modulo11(cadena: string): number {
  let suma = 0;
  let factor = 2;
  for (let i = cadena.length - 1; i >= 0; i--) {
    suma += parseInt(cadena.charAt(i), 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const residuo = suma % 11;
  const digito = 11 - residuo;
  if (digito === 11) return 0;
  if (digito === 10) return 1;
  return digito;
}

/**
 * Mapea las tarifas de IVA locales a los códigos requeridos por el SRI.
 */
export function getIvaMapping(ivaRate: string | number | undefined) {
  const rateStr = String(ivaRate || "0").trim();
  if (rateStr === "15") {
    return { codigoPorcentaje: "4", tarifa: "15", multiplier: 0.15 };
  } else if (rateStr === "0") {
    return { codigoPorcentaje: "0", tarifa: "0", multiplier: 0 };
  } else if (rateStr === "No objeto") {
    return { codigoPorcentaje: "6", tarifa: "0", multiplier: 0 };
  } else if (rateStr === "Exento") {
    return { codigoPorcentaje: "7", tarifa: "0", multiplier: 0 };
  }
  return { codigoPorcentaje: "0", tarifa: "0", multiplier: 0 };
}

/**
 * Genera la clave de acceso de 49 dígitos basada en la tabla de 9 campos.
 */
export function generateAccessKey(data: SRIInvoiceData): string {
  const dateStr = data.fechaEmision.replace(/\//g, ""); 
  const codDoc = data.tipoComprobante || "01"; 
  const ruc = data.rucEmisor.padStart(13, "0");
  const ambiente = "2"; 
  const serie = data.estab.padStart(3, "0") + data.ptoEmi.padStart(3, "0");
  const secuencial = data.secuencial.padStart(9, "0");
  const codigoNumerico = "12345678"; 
  const tipoEmision = "1";

  const baseKey = dateStr + codDoc + ruc + ambiente + serie + secuencial + codigoNumerico + tipoEmision;
  const dv = modulo11(baseKey);
  
  return baseKey + dv.toString();
}

/**
 * Genera el string XML estructurado para Facturas.
 */
export function generateInvoiceXML(data: SRIInvoiceData): string {
  const claveAcceso = generateAccessKey(data);
  
  // Tax grouping and calculations
  const taxGroups: { [key: string]: { base: number; valor: number; codigoPorcentaje: string } } = {};
  (data.items || []).forEach(i => {
    const mapping = getIvaMapping(i.ivaRate);
    const key = `${mapping.codigoPorcentaje}`;
    const totalLine = safe(i.cantidad) * safe(i.precioUnitario);
    const baseVal = mapping.tarifa === "15" ? (totalLine / 1.15) : totalLine;
    const taxVal = mapping.tarifa === "15" ? (totalLine - baseVal) : 0;
    
    if (!taxGroups[key]) {
      taxGroups[key] = { base: 0, valor: 0, codigoPorcentaje: mapping.codigoPorcentaje };
    }
    taxGroups[key].base += baseVal;
    taxGroups[key].valor += taxVal;
  });

  const subtotalTotal = Object.values(taxGroups).reduce((acc, g) => acc + g.base, 0);
  const valorIVA = Object.values(taxGroups).reduce((acc, g) => acc + g.valor, 0);
  const totalConImpuestosCalculado = subtotalTotal + valorIVA;

  let tipoId = "05";
  const idStr = data.cliente.identificacion || "";

  if (idStr === "9999999999999") {
    tipoId = "07";
  } else if (idStr.length === 13) {
    tipoId = "04";
  } else if (idStr.length === 10) {
    tipoId = "05";
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<factura id="comprobante" version="1.1.0">\n\n`;
  
  xml += `    <infoTributaria>\n`;
  xml += `        <ambiente>2</ambiente>\n`;
  xml += `        <tipoEmision>1</tipoEmision>\n`;
  xml += `        <razonSocial>${data.razonSocialEmisor}</razonSocial>\n`;
  xml += `        <nombreComercial>${data.nombreComercialEmisor || "AMEC"}</nombreComercial>\n`;
  xml += `        <ruc>${data.rucEmisor}</ruc>\n`;
  xml += `        <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `        <codDoc>01</codDoc>\n`;
  xml += `        <estab>${data.estab.padStart(3, "0")}</estab>\n`;
  xml += `        <ptoEmi>${data.ptoEmi.padStart(3, "0")}</ptoEmi>\n`;
  xml += `        <secuencial>${data.secuencial.padStart(9, "0")}</secuencial>\n`;
  xml += `        <dirMatriz>${data.dirMatriz}</dirMatriz>\n`;
  if (data.regimen && data.regimen.toUpperCase().includes("RIMPE")) {
    xml += `        <contribuyenteRimpe>Contribuyente Régimen RIMPE</contribuyenteRimpe>\n`;
  }
  xml += `    </infoTributaria>\n\n`;

  xml += `    <infoFactura>\n`;
  xml += `        <fechaEmision>${data.fechaEmision}</fechaEmision>\n`;
  xml += `        <dirEstablecimiento>${data.dirMatriz}</dirEstablecimiento>\n`;
  xml += `        <obligadoContabilidad>${data.obligadoContabilidad || "NO"}</obligadoContabilidad>\n`;
  xml += `        <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>\n`;
  xml += `        <razonSocialComprador>${data.cliente.razonSocial}</razonSocialComprador>\n`;
  xml += `        <identificacionComprador>${data.cliente.identificacion}</identificacionComprador>\n`;
  xml += `        <direccionComprador>${data.cliente.direccion || "S/N"}</direccionComprador>\n`;
  xml += `        <totalSinImpuestos>${safe(subtotalTotal).toFixed(2)}</totalSinImpuestos>\n`;
  xml += `        <totalDescuento>0.00</totalDescuento>\n\n`;

  xml += `        <totalConImpuestos>\n`;
  Object.values(taxGroups).forEach(group => {
    xml += `            <totalImpuesto>\n`;
    xml += `                <codigo>2</codigo>\n`; 
    xml += `                <codigoPorcentaje>${group.codigoPorcentaje}</codigoPorcentaje>\n`; 
    xml += `                <baseImponible>${group.base.toFixed(2)}</baseImponible>\n`;
    xml += `                <valor>${group.valor.toFixed(2)}</valor>\n`;
    xml += `            </totalImpuesto>\n`;
  });
  xml += `        </totalConImpuestos>\n\n`;

  xml += `        <propina>0.00</propina>\n`;
  xml += `        <importeTotal>${safe(totalConImpuestosCalculado).toFixed(2)}</importeTotal>\n`;
  xml += `        <moneda>DOLAR</moneda>\n`;

  xml += `\n        <pagos>\n`;
  xml += `            <pago>\n`;
  xml += `                <formaPago>${data.formaPago}</formaPago>\n`;
  xml += `                <total>${safe(totalConImpuestosCalculado).toFixed(2)}</total>\n`;
  xml += `            </pago>\n`;
  xml += `        </pagos>\n`;

  xml += `    </infoFactura>\n\n`;

  xml += `    <detalles>\n`;
  (data.items || []).forEach((item, index) => {
    const totalLine = safe(item.cantidad) * safe(item.precioUnitario);
    const mapping = getIvaMapping(item.ivaRate);
    const baseVal = mapping.tarifa === "15" ? (totalLine / 1.15) : totalLine;
    const taxVal = mapping.tarifa === "15" ? (totalLine - baseVal) : 0;
    const unitPriceSinIva = safe(item.cantidad) > 0 ? (baseVal / safe(item.cantidad)) : safe(item.precioUnitario);
    
    xml += `        <detalle>\n`;
    xml += `            <codigoPrincipal>${item.codigo || (index + 1).toString().padStart(3, '0')}</codigoPrincipal>\n`;
    xml += `            <descripcion>${item.descripcion}</descripcion>\n`;
    xml += `            <cantidad>${safe(item.cantidad).toFixed(2)}</cantidad>\n`;
    xml += `            <precioUnitario>${unitPriceSinIva.toFixed(6)}</precioUnitario>\n`;
    xml += `            <descuento>0.00</descuento>\n`;
    xml += `            <precioTotalSinImpuesto>${safe(baseVal).toFixed(2)}</precioTotalSinImpuesto>\n\n`;
    xml += `            <impuestos>\n`;
    xml += `                <impuesto>\n`;
    xml += `                    <codigo>2</codigo>\n`; 
    xml += `                    <codigoPorcentaje>${mapping.codigoPorcentaje}</codigoPorcentaje>\n`; 
    xml += `                    <tarifa>${mapping.tarifa}</tarifa>\n`; 
    xml += `                    <baseImponible>${safe(baseVal).toFixed(2)}</baseImponible>\n`;
    xml += `                    <valor>${safe(taxVal).toFixed(2)}</valor>\n`;
    xml += `                </impuesto>\n`;
    xml += `            </impuestos>\n\n`;
    xml += `        </detalle>\n`;
  });
  xml += `    </detalles>\n\n`;

  const additionalFields = [];
  if (data.cliente.email) additionalFields.push({ name: "email", value: data.cliente.email });
  if (data.cliente.telefono) additionalFields.push({ name: "telefono", value: data.cliente.telefono });
  if (data.observaciones) additionalFields.push({ name: "observaciones", value: data.observaciones });
  if (data.transferNumber) additionalFields.push({ name: "comprobante", value: data.transferNumber });
  if (data.deposit !== undefined && data.deposit > 0) {
    additionalFields.push({ name: "abono", value: safe(data.deposit).toFixed(2) });
    additionalFields.push({ name: "saldo", value: safe(data.balance).toFixed(2) });
  }

  if (additionalFields.length > 0) {
    xml += `    <infoAdicional>\n`;
    additionalFields.forEach(field => {
      xml += `        <campoAdicional nombre="${field.name}">${field.value}</campoAdicional>\n`;
    });
    xml += `    </infoAdicional>\n\n`;
  }

  xml += `</factura>`;
  return xml;
}

/**
 * Genera el string XML para una Nota de Crédito (Anulación).
 */
export function generateCreditNoteXML(data: SRIInvoiceData): string {
  const claveAcceso = generateAccessKey({
    ...data,
    tipoComprobante: "04"
  });

  // Cálculos robustos con la solución PRO
  const subtotal = (data.items || []).reduce(
    (acc, i) => acc + (safe(i.cantidad) * safe(i.precioUnitario)),
    0
  );

  const total = (data.items || []).reduce(
    (acc, i) => acc + (safe(i.cantidad) * safe(i.precioUnitario)),
    0
  );

  let tipoId = "05";
  const idStr = data.cliente.identificacion || "";
  if (idStr === "9999999999999") {
    tipoId = "07";
  } else if (idStr.length === 13) {
    tipoId = "04";
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<notaCredito id="comprobante" version="1.0.0">\n\n`;

  xml += `    <infoTributaria>\n`;
  xml += `        <ambiente>2</ambiente>\n`;
  xml += `        <tipoEmision>1</tipoEmision>\n`;
  xml += `        <razonSocial>${data.razonSocialEmisor}</razonSocial>\n`;
  xml += `        <nombreComercial>${data.nombreComercialEmisor || "AMEC"}</nombreComercial>\n`;
  xml += `        <ruc>${data.rucEmisor}</ruc>\n`;
  xml += `        <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `        <codDoc>04</codDoc>\n`;
  xml += `        <estab>${data.estab.padStart(3, "0")}</estab>\n`;
  xml += `        <ptoEmi>${data.ptoEmi.padStart(3, "0")}</ptoEmi>\n`;
  xml += `        <secuencial>${data.secuencial.padStart(9, "0")}</secuencial>\n`;
  xml += `        <dirMatriz>${data.dirMatriz}</dirMatriz>\n`;
  if (data.regimen && data.regimen.toUpperCase().includes("RIMPE")) {
    xml += `        <contribuyenteRimpe>Contribuyente Régimen RIMPE</contribuyenteRimpe>\n`;
  }
  xml += `    </infoTributaria>\n\n`;

  xml += `    <infoNotaCredito>\n`;
  xml += `        <fechaEmision>${data.fechaEmision}</fechaEmision>\n`;
  xml += `        <dirEstablecimiento>${data.dirMatriz}</dirEstablecimiento>\n`;
  xml += `        <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>\n`;
  xml += `        <razonSocialComprador>${data.cliente.razonSocial}</razonSocialComprador>\n`;
  xml += `        <identificacionComprador>${data.cliente.identificacion}</identificacionComprador>\n`;
  xml += `        <totalSinImpuestos>${safe(subtotal).toFixed(2)}</totalSinImpuestos>\n`;
  xml += `        <valorModificacion>${safe(total).toFixed(2)}</valorModificacion>\n`;
  xml += `        <moneda>DOLAR</moneda>\n`;
  xml += `        <codDocModificado>01</codDocModificado>\n`;
  xml += `        <numDocModificado>${data.facturaModificada?.numero}</numDocModificado>\n`;
  xml += `        <fechaEmisionDocSustento>${data.facturaModificada?.fecha}</fechaEmisionDocSustento>\n`;
  xml += `    </infoNotaCredito>\n\n`;

  xml += `    <detalles>\n`;
  (data.items || []).forEach((item) => {
    const base = safe(item.cantidad) * safe(item.precioUnitario);
    xml += `        <detalle>\n`;
    xml += `            <descripcion>${item.descripcion}</descripcion>\n`;
    xml += `            <cantidad>${safe(item.cantidad).toFixed(2)}</cantidad>\n`;
    xml += `            <precioUnitario>${safe(item.precioUnitario).toFixed(6)}</precioUnitario>\n`;
    xml += `            <descuento>0.00</descuento>\n`;
    xml += `            <precioTotalSinImpuesto>${safe(base).toFixed(2)}</precioTotalSinImpuesto>\n`;
    xml += `        </detalle>\n`;
  });
  xml += `    </detalles>\n\n`;

  xml += `    <motivos>\n`;
  xml += `        <motivo>\n`;
  xml += `            <razon>Anulación de factura</razon>\n`;
  xml += `            <valor>${safe(total).toFixed(2)}</valor>\n`;
  xml += `        </motivo>\n`;
  xml += `    </motivos>\n`;

  xml += `</notaCredito>`;
  return xml;
}

/**
 * Descarga el XML generado en el navegador del usuario.
 */
export function downloadXML(xmlString: string, filename: string) {
  const blob = new Blob([xmlString], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
