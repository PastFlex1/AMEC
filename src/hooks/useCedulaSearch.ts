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

export function useCedulaSearch() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);

  const fetchCedulaData = async (cedula: string, onFound: (data: CustomerData) => void) => {
    const cleanId = cedula.replace(/\D/g, '');
    if (cleanId.length !== 10 && cleanId.length !== 13) return;
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
        
        // Búsqueda alternativa por campos 'identification' o 'cedula' si 'ruc' estuviera vacío
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

        // Si ya está registrado en el sistema, cargar toda la información de la BD y NO llamar al endpoint
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
          setIsSearchingCedula(false);
          return; // Retorno inmediato: NO consulta el endpoint del SRI
        }
      }

      // 2. Si NO está registrado en la base de datos (cliente nuevo): consultar endpoint del SRI
      const response = await fetch(`/api/cedula?identificacion=${encodeURIComponent(cleanId)}`);

      if (response.ok) {
        const data = await response.json();
        if (data && data.success && data.nombre) {
          onFound({ 
            name: data.nombre,
            isExistingCustomer: false 
          });
          toast({ 
            title: "Cliente nuevo (SRI)", 
            description: "Nombre autocompletado con éxito desde el SRI." 
          });
        }
      }
    } catch (error) {
      console.error("Error al buscar identificación:", error);
    } finally {
      setIsSearchingCedula(false);
    }
  };

  return { isSearchingCedula, fetchCedulaData };
}
