/**
 * Service for SRI Electronic Retentions API endpoints hosted on Railway.
 * All base URLs are loaded dynamically from environment variables.
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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  claveAcceso?: string;
  xmlFirmado?: string;
  recepcion?: string;
  autorizacion?: string;
  estado?: string;
}

/**
 * Envia el XML de retención para validar sintaxis/esquema.
 * POST /api/retenciones/validar
 */
export async function validarRetencion(xml: string): Promise<ApiResponse> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/retenciones/validar`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml
    });

    if (!response.ok) {
      const errText = await response.text();
      return { 
        success: false, 
        error: `Error de Validación XML: ${errText || "Estructura XML de retención inválida."}` 
      };
    }

    const data = await response.text();
    return { success: true, data };
  } catch (err: any) {
    return { 
      success: false, 
      error: `Error de Conexión Railway: ${err.message || "No se pudo conectar con el servidor de validación."}` 
    };
  }
}

/**
 * Envia el XML de retención para ser firmado digitalmente.
 * POST /api/retenciones/firmar
 */
export async function firmarRetencion(xml: string): Promise<ApiResponse> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/retenciones/firmar`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml
    });

    if (!response.ok) {
      const errText = await response.text();
      return { 
        success: false, 
        error: `Error al Firmar XML: ${errText || "No se pudo firmar el comprobante de retención."}` 
      };
    }

    const xmlFirmado = await response.text();
    
    // Extraer clave de acceso del XML
    const claveMatch = xml.match(/<claveAcceso>(.*?)<\/claveAcceso>/);
    const claveAcceso = claveMatch ? claveMatch[1] : undefined;

    return { 
      success: true, 
      xmlFirmado, 
      claveAcceso,
      estado: "FIRMADO"
    };
  } catch (err: any) {
    return { 
      success: false, 
      error: `Error de Conexión Railway al firmar: ${err.message || "No se pudo comunicar con el servicio de firma digital."}` 
    };
  }
}

/**
 * Envia el XML firmado al SRI para recepción.
 * POST /api/retenciones/recepcion
 */
export async function recepcionarRetencion(xmlFirmado: string): Promise<ApiResponse> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/retenciones/recepcion`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xmlFirmado
    });

    if (!response.ok) {
      const errText = await response.text();
      return { 
        success: false, 
        error: `Error Recepción SRI: ${errText || "El SRI rechazó la recepción de la retención firmada."}` 
      };
    }

    const recepcion = await response.text();
    return { 
      success: true, 
      recepcion,
      estado: "ENVIADO_SRI"
    };
  } catch (err: any) {
    return { 
      success: false, 
      error: `Error de Conexión SRI / Railway: ${err.message || "Fallo en la comunicación con el servicio de recepción SRI."}` 
    };
  }
}

/**
 * Consulta el estado de autorización del SRI dada una clave de acceso.
 * GET /api/retenciones/autorizacion/{claveAcceso}
 */
export async function autorizarRetencion(claveAcceso: string, retries = 3, delayMs = 2000): Promise<ApiResponse> {
  const baseUrl = getBaseUrl();
  let lastError = "No se pudo obtener respuesta del servicio de autorización del SRI.";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/retenciones/autorizacion/${claveAcceso}`);

      if (response.ok) {
        const autorizacion = await response.text();
        
        if (autorizacion.includes("EN PROCESO") && attempt < retries) {
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }

        const isAuthorized = autorizacion.toUpperCase().includes("AUTORIZADO");

        return {
          success: isAuthorized,
          autorizacion,
          estado: isAuthorized ? "AUTORIZADO" : "DEVUELTO",
          error: isAuthorized ? undefined : "La retención no fue autorizada por el SRI."
        };
      } else {
        const errText = await response.text();
        lastError = errText || `Respuesta inesperada (${response.status}) al consultar autorización SRI.`;
        if (attempt < retries) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }
    } catch (err: any) {
      lastError = err.message || "Error al conectar con la consulta de autorización SRI.";
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  return {
    success: false,
    error: `Error SRI Autorización: ${lastError}`,
    estado: "DEVUELTO"
  };
}

export default {
  validarRetencion,
  firmarRetencion,
  recepcionarRetencion,
  autorizarRetencion
};
