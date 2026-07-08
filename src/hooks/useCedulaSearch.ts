import { useState } from 'react';
import { useToast } from './use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export interface CustomerData {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
}

export function useCedulaSearch() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);

  const fetchCedulaData = async (cedula: string, onFound: (data: CustomerData) => void) => {
    if (cedula.length !== 10) return;
    setIsSearchingCedula(true);
    try {
      if (db) {
        const q = query(collection(db, "customers"), where("ruc", "==", cedula));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          onFound({
            name: data.name || "",
            ...(data.address && { address: data.address }),
            ...(data.email && { email: data.email }),
            ...(data.phone && { phone: data.phone })
          });
          toast({ title: "Cliente encontrado", description: "Datos cargados desde su directorio." });
          setIsSearchingCedula(false);
          return;
        }
      }

      const proxyUrl = 'https://infoplacas.herokuapp.com/';
      const targetUrl = 'https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php';
      
      const response = await fetch(proxyUrl + targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ documento: cedula, tipo: '1' })
      });

      if (response.ok) {
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          if (data && data.nombreCompleto) {
            onFound({ name: data.nombreCompleto });
            toast({ title: "Datos del Registro Civil", description: "Nombre autocompletado con éxito." });
          }
        }
      }
    } catch (error) {
      console.error("Error al buscar cédula:", error);
    } finally {
      setIsSearchingCedula(false);
    }
  };

  return { isSearchingCedula, fetchCedulaData };
}
