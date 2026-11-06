import { useState, useRef } from 'react';
import { useToast } from './use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

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

async function fetchDirectJson(url: string, timeoutMs = 4000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Consulta de respaldo directa desde el navegador cliente al SRI (Ecuador) en paralelo.
 */
async function querySriDirectClient(cleanId: string): Promise<{ nombre: string; direccion?: string } | null> {
  const isCedula = cleanId.length === 10;
  const rucNum = isCedula ? `${cleanId}001` : cleanId;
  const cedNum = cleanId.slice(0, 10);
  const tipo = isCedula ? 'C' : 'R';

  const sriBase = 'https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest';
  const declBase = 'https://declaraciones.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest';

  const [consolidadoSri, consolidadoDecl, personaMain, personaAlt, estabSri] = await Promise.all([
    fetchDirectJson(`${sriBase}/ConsolidadoContribuyente/obtenerPorNumerosRuc?=&ruc=${rucNum}`, 4000),
    fetchDirectJson(`${declBase}/ConsolidadoContribuyente/obtenerPorNumerosRuc?=&ruc=${rucNum}`, 4000),
    fetchDirectJson(`${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cleanId}&tipoIdentificacion=${tipo}`, 3500),
    fetchDirectJson(
      isCedula
        ? `${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${rucNum}&tipoIdentificacion=R`
        : `${sriBase}/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${cedNum}&tipoIdentificacion=C`,
      3500
    ),
    fetchDirectJson(`${sriBase}/Establecimiento/consultarPorNumeroRuc?numeroRuc=${rucNum}`, 3500)
  ]);

  let nombre = '';
  let direccion = '';

  for (const p of [personaMain, personaAlt]) {
    if (!nombre && p && typeof p === 'object') {
      const candidate = p.nombreCompleto || p.razonSocial || p.nombre;
      if (candidate && typeof candidate === 'string' && candidate.trim()) {
        nombre = candidate.trim();
      }
    }
  }

  for (const c of [consolidadoSri, consolidadoDecl]) {
    if (!nombre && c) {
      const item = Array.isArray(c) ? c[0] : c;
      if (item && typeof item === 'object') {
        const candidate = item.razonSocial || item.nombreCompleto || item.nombreComercial;
        if (candidate && typeof candidate === 'string' && candidate.trim()) {
          nombre = candidate.trim();
        }
      }
    }
  }

  if (Array.isArray(estabSri) && estabSri.length > 0) {
    const matriz = estabSri.find((e: any) => e.matriz === 'SI') || estabSri[0];
    if (matriz) {
      if (matriz.direccionCompleta) {
        direccion = String(matriz.direccionCompleta).trim();
      }
      if (!nombre && (matriz.razonSocial || matriz.nombreFantasiaComercial)) {
        nombre = String(matriz.razonSocial || matriz.nombreFantasiaComercial).trim();
      }
    }
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
  const requestIdRef = useRef(0);

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

    if (cleanId === '9999999999999' || cleanId === '9999999999') {
      onFound({
        name: "CONSUMIDOR FINAL",
        address: "S/N",
        email: "consumidor@final.com",
        phone: "0999999999",
        isExistingCustomer: true
      });
      return true;
    }

    const currentRequestId = ++requestIdRef.current;
    setIsSearchingCedula(true);

    try {
      const candidateRucs = [cleanId];
      if (cleanId.length === 10) {
        candidateRucs.push(`${cleanId}001`);
      } else if (cleanId.length === 13 && cleanId.endsWith('001')) {
        candidateRucs.push(cleanId.slice(0, 10));
      }

      // 1. Verificar en la base de datos local (aislado en try/catch propio para no bloquear el paso 2)
      if (db) {
        try {
          let snap = await getDocs(query(collection(db, "customers"), where("ruc", "in", candidateRucs), limit(1)));

          if (snap.empty) {
            try {
              const snapAlt = await getDocs(query(collection(db, "customers"), where("identification", "in", candidateRucs), limit(1)));
              if (!snapAlt.empty) snap = snapAlt;
            } catch {}
          }
          if (snap.empty) {
            try {
              const snapCed = await getDocs(query(collection(db, "customers"), where("cedula", "in", candidateRucs), limit(1)));
              if (!snapCed.empty) snap = snapCed;
            } catch {}
          }

          if (!snap.empty) {
            if (currentRequestId !== requestIdRef.current) return false;
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

          // 1b. Si no está en 'customers', buscar en el historial de facturas, proformas o notas de venta
          for (const colName of ["invoices", "proformas", "salesNotes"]) {
            try {
              const histSnap = await getDocs(
                query(collection(db, colName), where("clientData.ruc", "in", candidateRucs), limit(1))
              );
              if (!histSnap.empty) {
                const docData = histSnap.docs[0].data();
                const cd = docData.clientData || {};
                const foundName = cd.name || docData.customerName || "";
                if (foundName && foundName.toUpperCase() !== "CONSUMIDOR FINAL") {
                  if (currentRequestId !== requestIdRef.current) return false;
                  onFound({
                    name: foundName,
                    address: cd.address || "",
                    email: cd.email || "",
                    phone: cd.phone || docData.customerPhone || "",
                    isExistingCustomer: true
                  });
                  toast({
                    title: "Cliente encontrado",
                    description: "Datos recuperados del historial de comprobantes."
                  });
                  return true;
                }
              }
            } catch {}
          }
        } catch (errDb) {
          console.warn("Advertencia al consultar directorio local en Firestore:", errDb);
        }
      }

      // 2. Si NO está en la base de datos local: consultar endpoint de la app (/api/cedula)
      let foundInApi = false;
      try {
        const response = await fetch(`/api/cedula?identificacion=${encodeURIComponent(cleanId)}`, {
          cache: 'no-store'
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.nombre) {
            if (currentRequestId !== requestIdRef.current) return false;
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
            if (currentRequestId !== requestIdRef.current) return false;
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
      if (currentRequestId === requestIdRef.current && options?.isManual) {
        toast({
          title: "No registrado",
          description: "No se encontraron datos automáticos en el SRI o directorio. Puede ingresarlos manualmente.",
        });
      }
      return false;
    } catch (error) {
      console.error("Error al buscar identificación:", error);
      if (currentRequestId === requestIdRef.current && options?.isManual) {
        toast({
          title: "Error en la consulta",
          description: "Ocurrió un error al consultar los datos. Ingrese los datos manualmente.",
          variant: "destructive"
        });
      }
      return false;
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsSearchingCedula(false);
      }
    }
  };

  return { isSearchingCedula, fetchCedulaData };
}
