import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('identificacion') || searchParams.get('cedula') || '';
    const cleanId = rawId.replace(/\D/g, '');

    if (cleanId.length !== 10 && cleanId.length !== 13) {
      return NextResponse.json(
        { success: false, message: 'La identificación debe tener 10 o 13 dígitos numéricos.' },
        { status: 400 }
      );
    }

    const tipo = cleanId.length === 10 ? 'C' : 'R';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

    // 1. Intentar endpoint oficial de Persona del SRI
    try {
      const personaUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cleanId}&tipoIdentificacion=${tipo}`;
      const resPersona = await fetch(personaUrl, {
        headers,
        signal: AbortSignal.timeout(6000),
        cache: 'no-store'
      });

      if (resPersona.status === 200) {
        const data = await resPersona.json();
        if (data && data.nombreCompleto) {
          return NextResponse.json({
            success: true,
            identificacion: cleanId,
            nombre: data.nombreCompleto.trim(),
            tipoPersona: data.tipoPersona || null
          });
        }
      }
    } catch (errPersona) {
      console.warn('Fallo consulta Persona SRI, intentando catastro RUC...', errPersona);
    }

    // 2. Fallback a Catastro RUC consolidado del SRI
    try {
      const rucNum = cleanId.length === 10 ? `${cleanId}001` : cleanId;
      const rucUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${rucNum}`;
      const resRuc = await fetch(rucUrl, {
        headers,
        signal: AbortSignal.timeout(6000),
        cache: 'no-store'
      });

      if (resRuc.status === 200) {
        const list = await resRuc.json();
        if (Array.isArray(list) && list.length > 0 && list[0].razonSocial) {
          return NextResponse.json({
            success: true,
            identificacion: cleanId,
            nombre: list[0].razonSocial.trim(),
            tipoPersona: list[0].tipoContribuyente || null
          });
        }
      }
    } catch (errRuc) {
      console.warn('Fallo consulta RUC Consolidado SRI:', errRuc);
    }

    return NextResponse.json(
      { success: false, message: 'No se encontraron datos para la identificación ingresada.' },
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
