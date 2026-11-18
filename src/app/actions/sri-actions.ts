'use server';

import {
  validarRetencion,
  firmarRetencion,
  recepcionarRetencion,
  autorizarRetencion
} from '@/services/retencionService';

/**
 * @fileOverview Acciones de servidor para el proceso del SRI (Ecuador).
 * Soporta ejecución paso a paso (Firma, Recepción, Autorización) para retroalimentación en tiempo real en la UI,
 * así como la acción unificada emitirFacturaAction y emitirRetencionAction.
 */

const getBaseUrl = (): string => {
  const envUrl = 
    process.env.VITE_API_URL || 
    process.env.NEXT_PUBLIC_VITE_API_URL || 
    process.env.NEXT_PUBLIC_API_URL;
    
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return "https://api-sri-production.up.railway.app";
};

export async function firmarXmlAction(xml: string) {
  try {
    const baseUrl = getBaseUrl();
    const resFirma = await fetch(
      `${baseUrl}/api/sri/firmar`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xml
      }
    );

    if (!resFirma.ok) {
      const errorText = await resFirma.text();
      throw new Error(errorText || "Error en el servicio de firma digital.");
    }
    
    const xmlFirmado = await resFirma.text();

    const claveMatch = xml.match(/<claveAcceso>(.*?)<\/claveAcceso>/);
    const claveAcceso = claveMatch ? claveMatch[1] : null;
    
    if (!claveAcceso) {
      throw new Error("No se pudo extraer la clave de acceso del XML.");
    }

    return { success: true, xmlFirmado, claveAcceso };
  } catch (error: any) {
    return { success: false, error: error.message || "Error en firma digital." };
  }
}

function extractSriMessages(rawText: string): string {
  const mensajes: string[] = [];
  const msgRegex = /<mensaje>([\s\S]*?)<\/mensaje>/gi;
  const infoRegex = /<informacionAdicional>([\s\S]*?)<\/informacionAdicional>/gi;

  let m: RegExpExecArray | null;
  while ((m = msgRegex.exec(rawText)) !== null) {
    if (m[1]?.trim()) mensajes.push(m[1].trim());
  }
  while ((m = infoRegex.exec(rawText)) !== null) {
    if (m[1]?.trim()) mensajes.push(m[1].trim());
  }

  if (mensajes.length > 0) {
    return mensajes.join(' | ');
  }
  return rawText.length > 300 ? rawText.slice(0, 300) + '...' : rawText;
}

export async function recepcionarSriAction(xmlFirmado: string) {
  try {
    const baseUrl = getBaseUrl();
    const resRecepcion = await fetch(
      `${baseUrl}/api/sri/recepcion`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xmlFirmado
      }
    );

    if (!resRecepcion.ok) {
      const errorText = await resRecepcion.text();
      throw new Error(errorText || "El SRI rechazó la recepción del comprobante firmado.");
    }
    const recepcion = await resRecepcion.text();

    const upper = recepcion.toUpperCase();
    // Si el SRI devuelve DEVUELTA, verificar si es error 43 (CLAVE ACCESO REGISTRADA), en cuyo caso sí podemos consultar autorización
    const isDevuelta =
      /<estado>\s*DEVUELTA\s*<\/estado>/i.test(recepcion) ||
      /"estado"\s*:\s*"DEVUELTA"/i.test(recepcion);

    const isClaveRegistrada =
      upper.includes("CLAVE ACCESO REGISTRADA") ||
      /<identificador>\s*43\s*<\/identificador>/i.test(recepcion);

    if (isDevuelta && !isClaveRegistrada) {
      const detail = extractSriMessages(recepcion);
      throw new Error(`Comprobante DEVUELTO por el SRI en Recepción: ${detail}`);
    }

    return { success: true, recepcion };
  } catch (error: any) {
    return { success: false, error: error.message || "Error en recepción del SRI." };
  }
}

export async function autorizarSriAction(claveAcceso: string, retries = 5, delayMs = 2500) {
  const baseUrl = getBaseUrl();
  let lastError = "No se pudo consultar la autorización legal definitiva en el SRI.";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resAutorizacion = await fetch(
        `${baseUrl}/api/sri/autorizacion/${claveAcceso}`,
        { cache: "no-store" }
      );

      if (resAutorizacion.ok) {
        const autorizacion = await resAutorizacion.text();

        const isNoAutorizado =
          /<estado>\s*(NO AUTORIZADO|RECHAZADA|DEVUELTA)\s*<\/estado>/i.test(autorizacion) ||
          /"estado"\s*:\s*"(NO AUTORIZADO|RECHAZADA|DEVUELTA)"/i.test(autorizacion);

        if (isNoAutorizado) {
          const detail = extractSriMessages(autorizacion);
          return {
            success: false,
            error: `El SRI NO autorizó el comprobante: ${detail}`
          };
        }

        const isAutorizado =
          /<estado>\s*AUTORIZADO\s*<\/estado>/i.test(autorizacion) ||
          /"estado"\s*:\s*"AUTORIZADO"/i.test(autorizacion);

        if (isAutorizado) {
          return { success: true, autorizacion };
        }

        // Si está EN PROCESO o aún devuelve 0 comprobantes, esperar y reintentar
        const isZeroOrProcessing =
          autorizacion.toUpperCase().includes("EN PROCESO") ||
          autorizacion.toUpperCase().includes("PROCESAMIENTO") ||
          /<numeroComprobantes>\s*0\s*<\/numeroComprobantes>/i.test(autorizacion);

        lastError = isZeroOrProcessing
          ? "El comprobante sigue en procesamiento en el SRI o aún no registra autorización."
          : `Respuesta del SRI sin estado AUTORIZADO: ${extractSriMessages(autorizacion)}`;

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        const errorText = await resAutorizacion.text();
        lastError = errorText || `Error HTTP ${resAutorizacion.status} al consultar autorización en el SRI.`;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } catch (error: any) {
      lastError = error.message || "Error en autorización del SRI.";
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return { success: false, error: lastError };
}

export async function emitirFacturaAction(xml: string) {
  try {
    console.log("[SRI Action] Iniciando proceso de emisión...");

    const fRes = await firmarXmlAction(xml);
    if (!fRes.success) throw new Error(fRes.error);

    const rRes = await recepcionarSriAction(fRes.xmlFirmado!);
    if (!rRes.success) throw new Error(rRes.error);

    const aRes = await autorizarSriAction(fRes.claveAcceso!);
    if (!aRes.success) throw new Error(aRes.error);

    return {
      success: true,
      xmlFirmado: fRes.xmlFirmado,
      recepcion: rRes.recepcion,
      autorizacion: aRes.autorizacion,
      claveAcceso: fRes.claveAcceso
    };

  } catch (error: any) {
    console.error("[Critical SRI Error]:", error);
    return { 
      success: false, 
      error: error.message || "Ocurrió un error inesperado al procesar la factura con los servicios del SRI." 
    };
  }
}

export async function validarRetencionAction(xml: string) {
  return await validarRetencion(xml);
}

export async function firmarRetencionAction(xml: string) {
  const res = await firmarRetencion(xml);
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { 
    success: true, 
    xmlFirmado: res.xmlFirmado, 
    claveAcceso: res.claveAcceso 
  };
}

export async function recepcionarRetencionAction(xmlFirmado: string) {
  const res = await recepcionarRetencion(xmlFirmado);
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { success: true, recepcion: res.recepcion };
}

export async function autorizarRetencionAction(claveAcceso: string, retries = 3, delayMs = 2000) {
  const res = await autorizarRetencion(claveAcceso, retries, delayMs);
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { success: true, autorizacion: res.autorizacion };
}

export async function emitirRetencionAction(xml: string) {
  try {
    console.log("[SRI Action] Iniciando proceso de emisión de retención...");

    const fRes = await firmarRetencionAction(xml);
    if (!fRes.success) throw new Error(fRes.error);

    const rRes = await recepcionarRetencionAction(fRes.xmlFirmado!);
    if (!rRes.success) throw new Error(rRes.error);

    const aRes = await autorizarRetencionAction(fRes.claveAcceso!);
    if (!aRes.success) throw new Error(aRes.error);

    return {
      success: true,
      xmlFirmado: fRes.xmlFirmado,
      recepcion: rRes.recepcion,
      autorizacion: aRes.autorizacion,
      claveAcceso: fRes.claveAcceso
    };

  } catch (error: any) {
    console.error("[Critical SRI Retencion Error]:", error);
    return { 
      success: false, 
      error: error.message || "Ocurrió un error inesperado al procesar la retención con los servicios del SRI." 
    };
  }
}
