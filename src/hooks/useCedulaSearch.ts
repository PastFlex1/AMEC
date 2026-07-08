import { useState } from 'react';
import { useToast } from './use-toast';

export function useCedulaSearch() {
  const { toast } = useToast();
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);

  const fetchCedulaData = async (cedula: string, onFound: (name: string) => void) => {
    if (cedula.length !== 10) return;
    setIsSearchingCedula(true);
    try {
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
            onFound(data.nombreCompleto);
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
