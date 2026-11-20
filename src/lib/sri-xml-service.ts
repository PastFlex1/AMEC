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

  const tipoId = getTipoIdentificacion(data.cliente.identificacion);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<factura id="comprobante" version="1.1.0">\n\n`;
  
  xml += `    <infoTributaria>\n`;
  xml += `        <ambiente>2</ambiente>\n`;
  xml += `        <tipoEmision>1</tipoEmision>\n`;
  xml += `        <razonSocial>${data.razonSocialEmisor}</razonSocial>\n`;
  xml += `        <nombreComercial>${data.nombreComercialEmisor || "Apm Inox"}</nombreComercial>\n`;
  xml += `        <ruc>${data.rucEmisor}</ruc>\n`;
  xml += `        <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `        <codDoc>01</codDoc>\n`;
  xml += `        <estab>${data.estab.padStart(3, "0")}</estab>\n`;
  xml += `        <ptoEmi>${data.ptoEmi.padStart(3, "0")}</ptoEmi>\n`;
  xml += `        <secuencial>${data.secuencial.padStart(9, "0")}</secuencial>\n`;
  xml += `        <dirMatriz>${data.dirMatriz}</dirMatriz>\n`;
  xml += `    </infoTributaria>\n\n`;

  xml += `    <infoFactura>\n`;
  xml += `        <fechaEmision>${data.fechaEmision}</fechaEmision>\n`;
  xml += `        <dirEstablecimiento>${data.dirMatriz}</dirEstablecimiento>\n`;
  xml += `        <obligadoContabilidad>${data.obligadoContabilidad || "NO"}</obligadoContabilidad>\n`;
  xml += `        <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>\n`;
  xml += `        <razonSocialComprador>${xmlEscape(data.cliente.razonSocial)}</razonSocialComprador>\n`;
  xml += `        <identificacionComprador>${xmlEscape(data.cliente.identificacion)}</identificacionComprador>\n`;
  xml += `        <direccionComprador>${xmlEscape(data.cliente.direccion || "S/N")}</direccionComprador>\n`;
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
    xml += `            <descripcion>${xmlEscape(item.descripcion)}</descripcion>\n`;
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
  if (data.regimen && data.regimen.toUpperCase().includes("RIMPE")) {
    additionalFields.push({ name: "contribuyenteRimpe", value: "CONTRIBUYENTE RÉGIMEN RIMPE" });
  }
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

  // Acepta ítems con nombres del SRI (descripcion/cantidad/precioUnitario)
  // o tal como se guardan en Firestore (description/quantity/unitPrice).
  const items = normalizeItems(data.items);

  // Mismo cálculo que la factura: el precio guardado incluye IVA cuando la tarifa es 15%.
  // Así el valor de la Nota de Crédito coincide exactamente con la factura modificada.
  // El esquema notaCredito v1.0.0 solo admite 2 decimales en cantidad y precioUnitario.
  // Para que cantidad × precioUnitario − descuento = precioTotalSinImpuesto (exacto, igual a la factura),
  // el precio sin IVA se redondea hacia arriba y la diferencia de centavos va en "descuento".
  const lines = items.map((item, index) => {
    const mapping = getIvaMapping(item.ivaRate);
    const cantidad = round2(item.cantidad);
    const totalLine = item.cantidad * item.precioUnitario;
    const baseRaw = mapping.tarifa === "15" ? totalLine / 1.15 : totalLine;
    const tax = mapping.tarifa === "15" ? totalLine - baseRaw : 0;
    const base = round2(baseRaw);
    const unitSinIva = cantidad > 0 ? Math.ceil(round6(base / cantidad) * 100) / 100 : round2(item.precioUnitario);
    const descuento = Math.max(0, round2(cantidad * unitSinIva - base));
    return { item, index, mapping, cantidad, base, baseRaw, tax, unitSinIva, descuento };
  });

  const taxGroups: { [key: string]: { base: number; valor: number; codigoPorcentaje: string } } = {};
  lines.forEach(({ mapping, baseRaw, tax }) => {
    const key = mapping.codigoPorcentaje;
    if (!taxGroups[key]) taxGroups[key] = { base: 0, valor: 0, codigoPorcentaje: key };
    taxGroups[key].base += baseRaw;
    taxGroups[key].valor += tax;
  });

  const subtotal = Object.values(taxGroups).reduce((acc, g) => acc + g.base, 0);
  const iva = Object.values(taxGroups).reduce((acc, g) => acc + g.valor, 0);
  const total = subtotal + iva;

  const tipoId = getTipoIdentificacion(data.cliente.identificacion);

  // El orden de los elementos sigue el esquema XSD oficial notaCredito v1.0.0 del SRI
  // (el servicio de firma exige version="1.0.0").
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<notaCredito id="comprobante" version="1.0.0">\n`;

  xml += `    <infoTributaria>\n`;
  xml += `        <ambiente>2</ambiente>\n`;
  xml += `        <tipoEmision>1</tipoEmision>\n`;
  xml += `        <razonSocial>${xmlEscape(data.razonSocialEmisor)}</razonSocial>\n`;
  xml += `        <nombreComercial>${xmlEscape(data.nombreComercialEmisor || "Apm Inox")}</nombreComercial>\n`;
  xml += `        <ruc>${data.rucEmisor}</ruc>\n`;
  xml += `        <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `        <codDoc>04</codDoc>\n`;
  xml += `        <estab>${data.estab.padStart(3, "0")}</estab>\n`;
  xml += `        <ptoEmi>${data.ptoEmi.padStart(3, "0")}</ptoEmi>\n`;
  xml += `        <secuencial>${data.secuencial.padStart(9, "0")}</secuencial>\n`;
  xml += `        <dirMatriz>${xmlEscape(data.dirMatriz)}</dirMatriz>\n`;
  xml += `    </infoTributaria>\n`;

  xml += `    <infoNotaCredito>\n`;
  xml += `        <fechaEmision>${data.fechaEmision}</fechaEmision>\n`;
  xml += `        <dirEstablecimiento>${xmlEscape(data.dirMatriz)}</dirEstablecimiento>\n`;
  xml += `        <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>\n`;
  xml += `        <razonSocialComprador>${xmlEscape(data.cliente.razonSocial)}</razonSocialComprador>\n`;
  xml += `        <identificacionComprador>${xmlEscape(String(data.cliente.identificacion || "").trim())}</identificacionComprador>\n`;
  xml += `        <obligadoContabilidad>${data.obligadoContabilidad || "NO"}</obligadoContabilidad>\n`;
  xml += `        <codDocModificado>01</codDocModificado>\n`;
  xml += `        <numDocModificado>${data.facturaModificada?.numero}</numDocModificado>\n`;
  xml += `        <fechaEmisionDocSustento>${data.facturaModificada?.fecha}</fechaEmisionDocSustento>\n`;
  xml += `        <totalSinImpuestos>${subtotal.toFixed(2)}</totalSinImpuestos>\n`;
  xml += `        <valorModificacion>${total.toFixed(2)}</valorModificacion>\n`;
  xml += `        <moneda>DOLAR</moneda>\n`;
  xml += `        <totalConImpuestos>\n`;
  Object.values(taxGroups).forEach(group => {
    xml += `            <totalImpuesto>\n`;
    xml += `                <codigo>2</codigo>\n`;
    xml += `                <codigoPorcentaje>${group.codigoPorcentaje}</codigoPorcentaje>\n`;
    xml += `                <baseImponible>${group.base.toFixed(2)}</baseImponible>\n`;
    xml += `                <valor>${group.valor.toFixed(2)}</valor>\n`;
    xml += `            </totalImpuesto>\n`;
  });
  xml += `        </totalConImpuestos>\n`;
  xml += `        <motivo>${xmlEscape(data.observaciones || "ANULACION DE FACTURA")}</motivo>\n`;
  xml += `    </infoNotaCredito>\n`;

  xml += `    <detalles>\n`;
  lines.forEach(({ item, index, mapping, cantidad, base, tax, unitSinIva, descuento }) => {
    xml += `        <detalle>\n`;
    xml += `            <codigoInterno>${xmlEscape(String(item.codigo || (index + 1).toString().padStart(3, "0")).slice(0, 25))}</codigoInterno>\n`;
    xml += `            <descripcion>${xmlEscape(item.descripcion)}</descripcion>\n`;
    xml += `            <cantidad>${cantidad.toFixed(2)}</cantidad>\n`;
    xml += `            <precioUnitario>${unitSinIva.toFixed(2)}</precioUnitario>\n`;
    xml += `            <descuento>${descuento.toFixed(2)}</descuento>\n`;
    xml += `            <precioTotalSinImpuesto>${base.toFixed(2)}</precioTotalSinImpuesto>\n`;
    xml += `            <impuestos>\n`;
    xml += `                <impuesto>\n`;
    xml += `                    <codigo>2</codigo>\n`;
    xml += `                    <codigoPorcentaje>${mapping.codigoPorcentaje}</codigoPorcentaje>\n`;
    xml += `                    <tarifa>${mapping.tarifa}</tarifa>\n`;
    xml += `                    <baseImponible>${base.toFixed(2)}</baseImponible>\n`;
    xml += `                    <valor>${tax.toFixed(2)}</valor>\n`;
    xml += `                </impuesto>\n`;
    xml += `            </impuestos>\n`;
    xml += `        </detalle>\n`;
  });
  xml += `    </detalles>\n`;

  const additionalFields: Array<{ name: string; value: string }> = [];
  if (data.regimen && data.regimen.toUpperCase().includes("RIMPE")) {
    additionalFields.push({ name: "contribuyenteRimpe", value: "CONTRIBUYENTE RÉGIMEN RIMPE" });
  }
  if (data.cliente.email) additionalFields.push({ name: "email", value: data.cliente.email });
  if (data.cliente.telefono) additionalFields.push({ name: "telefono", value: data.cliente.telefono });
  if (data.cliente.direccion) additionalFields.push({ name: "direccion", value: data.cliente.direccion });

  if (additionalFields.length > 0) {
    xml += `    <infoAdicional>\n`;
    additionalFields.forEach(field => {
      xml += `        <campoAdicional nombre="${field.name}">${xmlEscape(field.value)}</campoAdicional>\n`;
    });
    xml += `    </infoAdicional>\n`;
  }

  xml += `</notaCredito>`;
  return xml;
}

/** Escapa caracteres especiales de XML (un "&" en un nombre hace que el SRI rechace el comprobante). */
export function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Tabla 6 del SRI: 04 RUC, 05 Cédula, 06 Pasaporte, 07 Consumidor Final. */
export function getTipoIdentificacion(identificacion: string | undefined): string {
  const id = String(identificacion || "").trim();
  if (/^9{13}$/.test(id)) return "07";
  if (/^\d{13}$/.test(id)) return "04";
  if (/^\d{10}$/.test(id)) return "05";
  return "06";
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

function normalizeItems(items: any[] | undefined) {
  return (items || [])
    .map((i: any) => ({
      codigo: i.codigo || i.code || i.productCode || undefined,
      descripcion: String(i.descripcion ?? i.description ?? i.name ?? "").trim(),
      cantidad: safe(i.cantidad ?? i.quantity),
      precioUnitario: safe(i.precioUnitario ?? i.unitPrice ?? i.price),
      ivaRate: i.ivaRate,
    }))
    .filter(i => i.descripcion !== "" && i.cantidad > 0);
}

/**
 * Descarga el XML generado en el navegador del usuario.
 */
export function downloadXML(xmlString: string, filename: string) {
  const blob = new Blob([xmlString], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // En móviles, revocar el blob de inmediato cancela la descarga; se retrasa 15 segundos
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
