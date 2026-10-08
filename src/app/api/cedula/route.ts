import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

    const isCedula = cleanId.length === 10;
    const rucNum = isCedula ? `${cleanId}001` : cleanId;
    const cedNum = cleanId.slice(0, 10);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

    let nombre = '';
    let direccion = '';
    let tipoPersona: string | null = null;

    // 1. Intentar endpoint oficial de Persona del SRI con tipo principal
    try {
      const tipo = isCedula ? 'C' : 'R';
      const personaUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cleanId}&tipoIdentificacion=${tipo}`;
      const resPersona = await fetch(personaUrl, {
        headers,
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
      });

      if (resPersona.status === 200) {
        const data = await resPersona.json();
        if (data && data.nombreCompleto) {
          nombre = data.nombreCompleto.trim();
          tipoPersona = data.tipoPersona || null;
        }
      }
    } catch (errPersona) {
      console.warn('Fallo consulta Persona SRI principal:', errPersona);
    }

    // 2. Si es 13 dígitos y no se encontró por 'R', intentar los primeros 10 dígitos como 'C' (cédula natural)
    if (!nombre && !isCedula) {
      try {
        const personaUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cedNum}&tipoIdentificacion=C`;
        const resPersona = await fetch(personaUrl, {
          headers,
          signal: AbortSignal.timeout(5000),
          cache: 'no-store'
        });

        if (resPersona.status === 200) {
          const data = await resPersona.json();
          if (data && data.nombreCompleto) {
            nombre = data.nombreCompleto.trim();
            tipoPersona = data.tipoPersona || null;
          }
        }
      } catch (errPersona) {
        console.warn('Fallo consulta Persona SRI con cédula base:', errPersona);
      }
    }

    // 3. Fallback a Catastro RUC consolidado del SRI
    if (!nombre) {
      try {
        const rucUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${rucNum}`;
        const resRuc = await fetch(rucUrl, {
          headers,
          signal: AbortSignal.timeout(5000),
          cache: 'no-store'
        });

        if (resRuc.status === 200) {
          const list = await resRuc.json();
          if (Array.isArray(list) && list.length > 0 && list[0].razonSocial) {
            nombre = list[0].razonSocial.trim();
            tipoPersona = list[0].tipoContribuyente || null;
          }
        }
      } catch (errRuc) {
        console.warn('Fallo consulta RUC Consolidado SRI:', errRuc);
      }
    }

    // 4. Si aún no se encontró y es 10 dígitos, intentar Persona con 'R' usando '001'
    if (!nombre && isCedula) {
      try {
        const personaUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${rucNum}&tipoIdentificacion=R`;
        const resPersona = await fetch(personaUrl, {
          headers,
          signal: AbortSignal.timeout(5000),
          cache: 'no-store'
        });

        if (resPersona.status === 200) {
          const data = await resPersona.json();
          if (data && data.nombreCompleto) {
            nombre = data.nombreCompleto.trim();
            tipoPersona = data.tipoPersona || null;
          }
        }
      } catch (errPersona) {
        console.warn('Fallo consulta Persona SRI con RUC 001:', errPersona);
      }
    }

    // 5. Intentar obtener dirección desde Establecimientos del SRI
    try {
      const estabUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarPorNumeroRuc?numeroRuc=${rucNum}`;
      const resEstab = await fetch(estabUrl, {
        headers,
        signal: AbortSignal.timeout(4000),
        cache: 'no-store'
      });

      if (resEstab.status === 200) {
        const list = await resEstab.json();
        if (Array.isArray(list) && list.length > 0) {
          const matriz = list.find((e: any) => e.matriz === 'SI') || list[0];
          if (matriz && matriz.direccionCompleta) {
            direccion = matriz.direccionCompleta.trim();
          }
        }
      }
    } catch (errEstab) {
      console.warn('Fallo consulta Establecimiento SRI:', errEstab);
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
