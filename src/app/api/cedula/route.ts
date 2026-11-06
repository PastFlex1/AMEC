import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchSriJson(url: string, headers: Record<string, string>, timeoutMs = 4500): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    });

    if (!res.ok) return null;

    const text = (await res.text()).trim();
    if (!text || (!text.startsWith('{') && !text.startsWith('['))) {
      return null;
    }

    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('identificacion') || searchParams.get('cedula') || searchParams.get('ruc') || '';
    const cleanId = rawId.replace(/\D/g, '');

    if (cleanId.length !== 10 && cleanId.length !== 13) {
      return NextResponse.json(
        { success: false, message: 'La identificación debe tener 10 o 13 dígitos numéricos.' },
        { status: 400 }
      );
    }

    if (cleanId === '9999999999999' || cleanId === '9999999999') {
      return NextResponse.json({
        success: true,
        identificacion: cleanId,
        nombre: 'CONSUMIDOR FINAL',
        direccion: 'S/N',
        tipoPersona: 'NATURAL'
      });
    }

    const isCedula = cleanId.length === 10;
    const rucNum = isCedula ? `${cleanId}001` : cleanId;
    const cedNum = cleanId.slice(0, 10);
    const tipoPrincipal = isCedula ? 'C' : 'R';

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
      'Referer': 'https://srienlinea.sri.gob.ec/sri-en-linea/SriRucWeb/ConsultaRuc/Consultas/consultaRuc',
      'Origin': 'https://srienlinea.sri.gob.ec',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    if (process.env.SRI_AUTH_TOKEN) {
      headers['Authorization'] = process.env.SRI_AUTH_TOKEN;
    }

    let nombre = '';
    let direccion = '';
    let tipoPersona: string | null = null;

    // 0. Si existe un endpoint externo configurado (CEDULA_API_URL), consultarlo primero
    if (process.env.CEDULA_API_URL) {
      const customBase = process.env.CEDULA_API_URL.replace(/\/$/, '');
      const customHeaders: Record<string, string> = { 'Accept': 'application/json' };
      if (process.env.CEDULA_API_TOKEN) {
        customHeaders['Authorization'] = `Bearer ${process.env.CEDULA_API_TOKEN}`;
      }
      const customData = await fetchSriJson(`${customBase}?identificacion=${cleanId}&ruc=${rucNum}`, customHeaders, 4500);
      if (customData) {
        const customName = customData.nombre || customData.nombreCompleto || customData.razonSocial || customData.data?.full_name || customData.data?.nombre;
        if (customName) {
          nombre = String(customName).trim();
          direccion = (customData.direccion || customData.direccionCompleta || customData.data?.address || '').trim();
          tipoPersona = customData.tipoPersona || customData.tipoContribuyente || null;
        }
      }
    }

    // Ejecutar consultas al SRI en paralelo para evitar tiempos de espera en cascada
    if (!nombre) {
      const sriBase = 'https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest';
      const declBase = 'https://declaraciones.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest';

      const [
        consolidadoSri,
        consolidadoDecl,
        personaPrincipal,
        personaSecundaria,
        estabSri,
        estabDecl
      ] = await Promise.all([
        fetchSriJson(`${sriBase}/ConsolidadoContribuyente/obtenerPorNumerosRuc?=&ruc=${rucNum}`, headers, 4500),
        fetchSriJson(`${declBase}/ConsolidadoContribuyente/obtenerPorNumerosRuc?=&ruc=${rucNum}`, headers, 4500),
        fetchSriJson(`${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cleanId}&tipoIdentificacion=${tipoPrincipal}`, headers, 4000),
        fetchSriJson(
          isCedula
            ? `${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${rucNum}&tipoIdentificacion=R`
            : `${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cedNum}&tipoIdentificacion=C`,
          headers,
          4000
        ),
        fetchSriJson(`${sriBase}/Establecimiento/consultarPorNumeroRuc?numeroRuc=${rucNum}`, headers, 4000),
        fetchSriJson(`${declBase}/Establecimiento/consultarPorNumeroRuc?numeroRuc=${rucNum}`, headers, 4000)
      ]);

      // 1. Extraer desde Persona (Cédula o RUC)
      for (const pData of [personaPrincipal, personaSecundaria]) {
        if (!nombre && pData && typeof pData === 'object') {
          const candidate = pData.nombreCompleto || pData.razonSocial || pData.nombre;
          if (candidate && typeof candidate === 'string' && candidate.trim()) {
            nombre = candidate.trim();
            tipoPersona = pData.tipoPersona || tipoPersona;
          }
        }
      }

      // 2. Extraer desde ConsolidadoContribuyente (RUC o Cédula + 001)
      for (const cData of [consolidadoSri, consolidadoDecl]) {
        if (!nombre && cData) {
          const item = Array.isArray(cData) ? cData[0] : cData;
          if (item && typeof item === 'object') {
            const candidate = item.razonSocial || item.nombreCompleto || item.nombreComercial;
            if (candidate && typeof candidate === 'string' && candidate.trim()) {
              nombre = candidate.trim();
              tipoPersona = item.tipoContribuyente || item.tipoPersona || tipoPersona;
            }
          }
        }
      }

      // 3. Extraer dirección (y nombre comercial de respaldo) desde Establecimientos
      for (const eData of [estabSri, estabDecl]) {
        if (Array.isArray(eData) && eData.length > 0) {
          const matriz = eData.find((e: any) => e.matriz === 'SI') || eData[0];
          if (matriz) {
            if (!direccion && matriz.direccionCompleta) {
              direccion = String(matriz.direccionCompleta).trim();
            }
            if (!nombre && (matriz.razonSocial || matriz.nombreFantasiaComercial)) {
              nombre = String(matriz.razonSocial || matriz.nombreFantasiaComercial).trim();
            }
          }
        }
      }
    }

    if (nombre) {
      return NextResponse.json({
        success: true,
        identificacion: cleanId,
        nombre,
        direccion: direccion || undefined,
        tipoPersona: tipoPersona || null
      });
    }

    return NextResponse.json(
      { success: false, message: 'No se encontraron datos para la identificación ingresada en el SRI.' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error en API /api/cedula:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno al consultar el servicio de identificación.' },
      { status: 500 }
    );
  }
}
