import { modulo11 } from './sri-xml-service';

export interface SRIRetentionData {
  // Datos del emisor
  rucEmisor: string;
  razonSocialEmisor: string;
  nombreComercialEmisor?: string;
  dirMatriz: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  fechaEmision: string; // Formato DD/MM/YYYY

  // Datos del sujeto retenido
  razonSocial: string;
  identificacion: string;
  tipoIdentificacion?: string;

  // Datos de la factura sustentada
  codDocSustento?: string; // Por defecto "01" (Factura)
  numeroFactura: string;   // Ej. 001-001-000000001
  fechaFactura: string;    // Formato DD/MM/YYYY
  claveAccesoFactura?: string; // 49 dígitos

  // Lista de retenciones
  retenciones: Array<{
    codigo: string;          // Ej. "1" (Renta), "2" (IVA)
    codigoRetencion: string; // Ej. "312", "304", "9", "10"
    baseImponible: number;
    porcentajeRetener: number;
    valorRetenido: number;
  }>;
}

/**
 * Función auxiliar para asegurar que un valor sea numérico y no nulo.
 */
const safe = (n: any) => Number(n || 0);

/**
 * Función auxiliar para asegurar que las fechas estén en formato DD/MM/YYYY.
 */
function ensureDateFormat(dateStr: string): string {
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) { // YYYY-MM-DD
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return dateStr;
}

/**
 * Genera la clave de acceso de 49 dígitos específica para comprobantes de retención (tipo 07).
 */
export function generateRetentionAccessKey(data: SRIRetentionData): string {
  const formattedDate = ensureDateFormat(data.fechaEmision);
  const dateStr = formattedDate.replace(/\//g, ""); 
  const codDoc = "07"; // 07 = Comprobante de Retención
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
 * Genera el string XML estructurado para Comprobantes de Retención.
 */
export function generateRetentionXML(data: SRIRetentionData): string {
  // Validaciones
  if (!data.rucEmisor) throw new Error("RUC emisor es obligatorio");
  if (!data.identificacion) throw new Error("Identificación del sujeto retenido es obligatoria");
  if (!data.numeroFactura) throw new Error("Número de factura sustentada es obligatorio");
  if (!data.retenciones || data.retenciones.length === 0) throw new Error("Se requiere al menos una retención");

  const claveAcceso = generateRetentionAccessKey(data);
  const codDoc = "07"; // Código para Retención

  // Asegurar formato de fechas DD/MM/YYYY
  const fechaEmision = ensureDateFormat(data.fechaEmision);
  const fechaFactura = ensureDateFormat(data.fechaFactura);

  // Determinar tipo de identificación si no viene especificado
  let tipoId = data.tipoIdentificacion || "05";
  if (!data.tipoIdentificacion) {
    const idStr = data.identificacion;
    if (idStr === "9999999999999") {
      tipoId = "07"; // Consumidor final (aunque raro en retención, se cubre por seguridad)
    } else if (idStr.length === 13) {
      tipoId = "04"; // RUC
    } else if (idStr.length === 10) {
      tipoId = "05"; // Cédula
    }
  }

  // Extraer periodo fiscal (MM/YYYY) de la fecha de emisión (DD/MM/YYYY)
  const periodoFiscal = fechaEmision.substring(3);
  
  const codDocSustento = data.codDocSustento || "01"; // 01 = Factura
  
  // El numDocSustento va sin guiones según el estándar en algunos tags, 
  // pero mantendremos el replace de guiones por si el usuario lo envía como "001-001-123456789"
  const numDocSustento = data.numeroFactura.replace(/-/g, "");
  
  // Clave de acceso o autorización de la factura que se está reteniendo
  const numAutDocSustento = data.claveAccesoFactura || "0000000000000000000000000000000000000000000000000";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<comprobanteRetencion id="comprobante" version="2.0.0">\n\n`;

  xml += `    <infoTributaria>\n`;
  xml += `        <ambiente>2</ambiente>\n`;
  xml += `        <tipoEmision>1</tipoEmision>\n`;
  xml += `        <razonSocial>${data.razonSocialEmisor}</razonSocial>\n`;
  xml += `        <nombreComercial>${data.nombreComercialEmisor || data.razonSocialEmisor}</nombreComercial>\n`;
  xml += `        <ruc>${data.rucEmisor}</ruc>\n`;
  xml += `        <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `        <codDoc>${codDoc}</codDoc>\n`;
  xml += `        <estab>${data.estab.padStart(3, "0")}</estab>\n`;
  xml += `        <ptoEmi>${data.ptoEmi.padStart(3, "0")}</ptoEmi>\n`;
  xml += `        <secuencial>${data.secuencial.padStart(9, "0")}</secuencial>\n`;
  xml += `        <dirMatriz>${data.dirMatriz}</dirMatriz>\n`;
  xml += `    </infoTributaria>\n\n`;

  xml += `    <infoCompRetencion>\n`;
  xml += `        <fechaEmision>${fechaEmision}</fechaEmision>\n`;
  xml += `        <dirEstablecimiento>${data.dirMatriz}</dirEstablecimiento>\n`;
  xml += `        <obligadoContabilidad>NO</obligadoContabilidad>\n`;
  xml += `        <tipoIdentificacionSujetoRetenido>${tipoId}</tipoIdentificacionSujetoRetenido>\n`;
  xml += `        <razonSocialSujetoRetenido>${data.razonSocial}</razonSocialSujetoRetenido>\n`;
  xml += `        <identificacionSujetoRetenido>${data.identificacion}</identificacionSujetoRetenido>\n`;
  xml += `        <periodoFiscal>${periodoFiscal}</periodoFiscal>\n`;
  xml += `    </infoCompRetencion>\n\n`;

  xml += `    <docsSustento>\n`;
  xml += `        <docSustento>\n`;
  xml += `            <codDocSustento>${codDocSustento}</codDocSustento>\n`;
  xml += `            <numDocSustento>${numDocSustento}</numDocSustento>\n`;
  xml += `            <fechaEmisionDocSustento>${fechaFactura}</fechaEmisionDocSustento>\n`;
  xml += `            <numAutDocSustento>${numAutDocSustento}</numAutDocSustento>\n`;
  
  xml += `            <retenciones>\n`;
  data.retenciones.forEach(ret => {
    xml += `                <retencion>\n`;
    xml += `                    <codigo>${ret.codigo}</codigo>\n`;
    xml += `                    <codigoRetencion>${ret.codigoRetencion}</codigoRetencion>\n`;
    xml += `                    <baseImponible>${safe(ret.baseImponible).toFixed(2)}</baseImponible>\n`;
    xml += `                    <porcentajeRetener>${safe(ret.porcentajeRetener).toFixed(2)}</porcentajeRetener>\n`;
    xml += `                    <valorRetenido>${safe(ret.valorRetenido).toFixed(2)}</valorRetenido>\n`;
    xml += `                </retencion>\n`;
  });
  xml += `            </retenciones>\n`;

  xml += `        </docSustento>\n`;
  xml += `    </docsSustento>\n\n`;

  xml += `</comprobanteRetencion>`;
  
  return xml;
}
