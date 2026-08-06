
'use server';

/**
 * @fileOverview Acciones de servidor para el proceso del SRI (Ecuador).
 * Soporta ejecución paso a paso (Firma, Recepción, Autorización) para retroalimentación en tiempo real en la UI,
 * así como la acción unificada emitirFacturaAction.
 */

export async function firmarXmlAction(xml: string) {
  try {
    const resFirma = await fetch(
      "https://api-sri-production.up.railway.app/api/sri/firmar",
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

export async function recepcionarSriAction(xmlFirmado: string) {
  try {
    const resRecepcion = await fetch(
      "https://api-sri-production.up.railway.app/api/sri/recepcion",
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

    return { success: true, recepcion };
  } catch (error: any) {
    return { success: false, error: error.message || "Error en recepción del SRI." };
  }
}

export async function autorizarSriAction(claveAcceso: string, retries = 3, delayMs = 2000) {
  let lastError = "No se pudo consultar la autorización legal definitiva.";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resAutorizacion = await fetch(
        `https://api-sri-production.up.railway.app/api/sri/autorizacion/${claveAcceso}`
      );

      if (resAutorizacion.ok) {
        const autorizacion = await resAutorizacion.text();
        if (autorizacion.includes("EN PROCESO") && attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        return { success: true, autorizacion };
      } else {
        const errorText = await resAutorizacion.text();
        lastError = errorText || "No se pudo consultar la autorización legal definitiva.";
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

export async function firmarRetencionAction(xml: string) {
  try {
    const resFirma = await fetch(
      "https://api-sri-production.up.railway.app/api/retenciones/firmar",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xml
      }
    );

    if (!resFirma.ok) {
      const errorText = await resFirma.text();
      throw new Error(errorText || "Error en el servicio de firma digital de retención.");
    }
    
    const xmlFirmado = await resFirma.text();

    const claveMatch = xml.match(/<claveAcceso>(.*?)<\/claveAcceso>/);
    const claveAcceso = claveMatch ? claveMatch[1] : null;
    
    if (!claveAcceso) {
      throw new Error("No se pudo extraer la clave de acceso del XML de retención.");
    }

    return { success: true, xmlFirmado, claveAcceso };
  } catch (error: any) {
    return { success: false, error: error.message || "Error en firma digital de retención." };
  }
}

export async function recepcionarRetencionAction(xmlFirmado: string) {
  try {
    const resRecepcion = await fetch(
      "https://api-sri-production.up.railway.app/api/retenciones/recepcion",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xmlFirmado
      }
    );

    if (!resRecepcion.ok) {
      const errorText = await resRecepcion.text();
      throw new Error(errorText || "El SRI rechazó la recepción de la retención firmada.");
    }
    const recepcion = await resRecepcion.text();

    return { success: true, recepcion };
  } catch (error: any) {
    return { success: false, error: error.message || "Error en recepción de retención del SRI." };
  }
}

export async function autorizarRetencionAction(claveAcceso: string, retries = 3, delayMs = 2000) {
  let lastError = "No se pudo consultar la autorización legal definitiva de la retención.";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resAutorizacion = await fetch(
        `https://api-sri-production.up.railway.app/api/retenciones/autorizacion/${claveAcceso}`
      );

      if (resAutorizacion.ok) {
        const autorizacion = await resAutorizacion.text();
        if (autorizacion.includes("EN PROCESO") && attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        return { success: true, autorizacion };
      } else {
        const errorText = await resAutorizacion.text();
        lastError = errorText || "No se pudo consultar la autorización legal definitiva de la retención.";
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } catch (error: any) {
      lastError = error.message || "Error en autorización de la retención del SRI.";
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return { success: false, error: lastError };
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
