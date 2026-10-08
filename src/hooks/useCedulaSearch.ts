import { useState } from 'react';
import { useToast } from './use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface CustomerData {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  isExistingCustomer?: boolean;
}

export interface SearchOptions {
  isManual?: boolean;
}

/**
 * Consulta de respaldo directa desde el navegador cliente al SRI (Ecuador).
 * El portal del SRI cuenta con 'Access-Control-Allow-Origin: *', lo que permite
 * consultar directamente desde el dispositivo móvil o PC sin verse afectado
 * por bloqueos de IP en servidores cloud extranjeros.
 */
async function querySriDirectClient(cleanId: string): Promise<{ nombre: string; direccion?: string } | null> {
  const isCedula = cleanId.length === 10;
  const rucNum = isCedula ? `${cleanId}001` : cleanId;
  const cedNum = cleanId.slice(0, 10);
  const headers = { 'Accept': 'application/json, text/plain, */*' };

  let nombre = '';
  let direccion = '';

  // 1. Persona con tipo principal
  try {
    const tipo = isCedula ? 'C' : 'R';
    const url = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cleanId}&tipoIdentificacion=${tipo}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(4500) });
    if (res.status === 200) {
      const d = await res.json();
      if (d && d.nombreCompleto) nombre = d.nombreCompleto.trim();
    }
  } catch {}

  // 2. Si es 13 dígitos y falló, intentar cédula base
  if (!nombre && !isCedula) {
    try {
      const url = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cedNum}&tipoIdentificacion=C`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(4500) });
      if (res.status === 200) {
        const d = await res.json();
        if (d && d.nombreCompleto) nombre = d.nombreCompleto.trim();
      }
    } catch {}
  }

  // 3. Consolidado contribuyente
  if (!nombre) {
    try {
      const url = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${rucNum}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(4500) });
      if (res.status === 200) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0 && list[0].razonSocial) {
          nombre = list[0].razonSocial.trim();
        }
      }
    } catch {}
  }

  // 4. Intentar obtener dirección
  if (nombre) {
    try {
      const url = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarPorNumeroRuc?numeroRuc=${rucNum}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(3500) });
      if (res.status === 200) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const matriz = list.find((e: any) => e.matriz === 'SI') || list[0];
          if (matriz && matriz.direccionCompleta) {
            direccion = matriz.direccionCompleta.trim();
          }
        }
      }
    } catch {}
  }

  if (nombre) {
    return { nombre, direccion: direccion || undefined };
  }
  return null;
}

export function useCedulaSearch() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);

  const fetchCedulaData = async (
    cedula: string, 
    onFound: (data: CustomerData) => void,
    options?: SearchOptions
  ): Promise<boolean> => {
    const cleanId = (cedula || '').replace(/\D/g, '');
    if (cleanId.length !== 10 && cleanId.length !== 13) {
      if (options?.isManual) {
        toast({
          title: "Identificación incompleta",
          description: "Ingrese 10 dígitos para cédula o 13 para RUC.",
          variant: "destructive"
        });
      }
      return false;
    }

    setIsSearchingCedula(true);
    try {
      // 1. Verificar si ya existe en la base de datos (directorio de clientes)
      if (db) {
        const candidateRucs = [cleanId];
        if (cleanId.length === 10) {
          candidateRucs.push(`${cleanId}001`);
        } else if (cleanId.length === 13 && cleanId.endsWith('001')) {
          candidateRucs.push(cleanId.slice(0, 10));
        }

        let snap = await getDocs(query(collection(db, "customers"), where("ruc", "in", candidateRucs)));
        
        if (snap.empty) {
          try {
            const snapAlt = await getDocs(query(collection(db, "customers"), where("identification", "in", candidateRucs)));
            if (!snapAlt.empty) snap = snapAlt;
          } catch {}
        }
        if (snap.empty) {
          try {
            const snapCed = await getDocs(query(collection(db, "customers"), where("cedula", "in", candidateRucs)));
            if (!snapCed.empty) snap = snapCed;
          } catch {}
        }

        if (!snap.empty) {
          const data = snap.docs[0].data();
          onFound({
            name: data.name || data.razonSocial || data.nombre || "",
            address: data.address || data.direccion || "",
            email: data.email || data.correo || "",
            phone: data.phone || data.telefono || "",
            isExistingCustomer: true
          });
          toast({ 
            title: "Cliente encontrado", 
            description: "Datos cargados desde su directorio local." 
          });
          return true;
        }
      }

      // 2. Si NO está en la base de datos local: consultar endpoint de la app (/api/cedula)
      let foundInApi = false;
      try {
        const response = await fetch(`/api/cedula?identificacion=${encodeURIComponent(cleanId)}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.nombre) {
            onFound({ 
              name: data.nombre,
              address: data.direccion,
              isExistingCustomer: false 
            });
            toast({ 
              title: "Cliente nuevo (SRI)", 
              description: `${data.nombre}` 
            });
            foundInApi = true;
            return true;
          }
        }
      } catch (errApi) {
        console.warn("Fallo endpoint /api/cedula, intentando consulta directa al SRI...", errApi);
      }

      // 3. Fallback: Consulta directa al SRI desde el navegador/móvil del cliente
      if (!foundInApi) {
        try {
          const directResult = await querySriDirectClient(cleanId);
          if (directResult && directResult.nombre) {
            onFound({
              name: directResult.nombre,
              address: directResult.direccion,
              isExistingCustomer: false
            });
            toast({
              title: "Cliente nuevo (SRI)",
              description: `${directResult.nombre}`
            });
            return true;
          }
        } catch (errDirect) {
          console.warn("Fallo consulta directa SRI:", errDirect);
        }
      }

      // 4. Si no se encontró en ningún lugar
      if (options?.isManual) {
        toast({
          title: "No registrado",
          description: "La identificación no está registrada en el SRI ni en su directorio. Puede completar los datos manualmente.",
        });
      }
      return false;
    } catch (error) {
      console.error("Error al buscar identificación:", error);
      if (options?.isManual) {
        toast({
          title: "Error en la consulta",
          description: "Ocurrió un error al consultar los datos. Ingrese los datos manualmente.",
          variant: "destructive"
        });
      }
      return false;
    } finally {
      setIsSearchingCedula(false);
    }
  };

  return { isSearchingCedula, fetchCedulaData };
}
