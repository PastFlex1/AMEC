
'use server';

/**
 * @fileOverview Acción de servidor unificada para el proceso completo del SRI.
 * Ejecuta Firma, Recepción y Autorización en una sola transacción de servidor.
 */

export async function emitirFacturaAction(xml: string) {
  try {
    console.log("[SRI Action] Iniciando proceso de emisión...");

    // 1️⃣ Paso 1: Firmar XML (Se envía el XML sin firmar al servicio de firma)
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
    
    // Obtenemos el XML ya firmado digitalmente
    const xmlFirmado = await resFirma.text();
    console.log("[SRI Action] XML firmado exitosamente.");

    // 2️⃣ Paso 2: Enviar a recepción del SRI (IMPORTANTE: Se envía el xmlFirmado)
    const resRecepcion = await fetch(
      "https://api-sri-production.up.railway.app/api/sri/recepcion",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xmlFirmado // <--- Aquí enviamos el documento legal firmado
      }
    );

    if (!resRecepcion.ok) {
      const errorText = await resRecepcion.text();
      throw new Error(errorText || "El SRI rechazó la recepción del comprobante firmado.");
    }
    const recepcion = await resRecepcion.text();
    console.log("[SRI Action] Comprobante recibido por el SRI.");

    // 3️⃣ Paso 3: Obtener clave acceso del XML original para la consulta
    const claveMatch = xml.match(/<claveAcceso>(.*?)<\/claveAcceso>/);
    const claveAcceso = claveMatch ? claveMatch[1] : null;
    
    if (!claveAcceso) {
      throw new Error("No se pudo extraer la clave de acceso del XML original.");
    }

    // 4️⃣ Paso 4: Consultar autorización legal definitiva
    const resAutorizacion = await fetch(
      `https://api-sri-production.up.railway.app/api/sri/autorizacion/${claveAcceso}`
    );

    if (!resAutorizacion.ok) {
      const errorText = await resAutorizacion.text();
      throw new Error(errorText || "No se pudo consultar la autorización legal definitiva.");
    }
    
    // El SRI devuelve el XML con la autorización (este es el que se debe guardar)
    const autorizacion = await resAutorizacion.text();
    console.log("[SRI Action] Autorización obtenida con éxito.");

    return {
      success: true,
      xmlFirmado,
      recepcion,
      autorizacion, // XML Oficial Autorizado
      claveAcceso
    };

  } catch (error: any) {
    console.error("[Critical SRI Error]:", error);
    return { 
      success: false, 
      error: error.message || "Ocurrió un error inesperado al procesar la factura con los servicios del SRI." 
    };
  }
}
