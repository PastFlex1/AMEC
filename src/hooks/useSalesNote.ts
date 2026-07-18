import { useState, useEffect, useMemo } from "react";
import { Firestore } from "firebase/firestore";
import { SalesService } from "@/lib/services/SalesService";
import { useToast } from "@/hooks/use-toast";
import { useCedulaSearch } from "@/hooks/useCedulaSearch";

export interface SalesNoteClientData {
  ruc: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  paymentMethod: string;
  transferNumber: string;
}

export function useSalesNote(db: Firestore | null) {
  const { toast } = useToast();
  const { isSearchingCedula, fetchCedulaData } = useCedulaSearch();

  const [date, setDate] = useState<Date>(new Date());
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'mail' | 'lookup' | 'save_customer' | 'ticket' | null>(null);
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(false);
  const [noteNumber, setNoteNumber] = useState("002-001-000000001");
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<number>(0);
  
  const [clientData, setClientData] = useState<SalesNoteClientData>({
    ruc: "",
    name: "",
    address: "",
    email: "",
    phone: "",
    paymentMethod: "01",
    transferNumber: ""
  });
  
  const [items, setItems] = useState<any[]>([{ 
    id: Math.random().toString(36).substr(2, 9), 
    description: "", 
    quantity: 1, 
    unitPrice: 0, 
    productId: null, 
    maxStock: null 
  }]);
  
  const [observations, setObservations] = useState("");

  const salesService = useMemo(() => db ? new SalesService(db) : null, [db]);

  useEffect(() => {
    if (!salesService) return;
    
    const unsubscribe = salesService.subscribeToLatestNoteNumber((num) => {
      setNoteNumber(num);
    });
    
    return () => unsubscribe();
  }, [salesService]);

  const totalWithIVA = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const subtotalBase = totalWithIVA;
  const ivaCalculated = 0;
  const balance = Math.max(0, totalWithIVA - deposit);

  const docInfo = useMemo(() => {
    if (isConsumidorFinal) return { text: "Consumidor Final activo", isError: false };
    const val = clientData.ruc;
    if (val.length === 0) return { text: "", isError: false };
    if (val.length === 10) return { text: "Es Cédula", isError: false };
    if (val.length === 13) return { text: "Es RUC", isError: false };
    return { text: "Identificación inválida", isError: true };
  }, [clientData.ruc, isConsumidorFinal]);

  const handleLookupCustomer = async () => {
    if (!salesService || !clientData.ruc) return;
    if (clientData.ruc.length !== 10 && clientData.ruc.length !== 13) {
      toast({ title: "Identificación inválida", description: "Mínimo 10 dígitos.", variant: "destructive" });
      return;
    }

    setLoadingAction('lookup');
    try {
      const data = await salesService.findCustomerByRuc(clientData.ruc);
      if (data) {
        setClientData(prev => ({
          ...prev,
          name: data.name || "",
          address: data.address || "",
          email: data.email || "",
          phone: data.phone || ""
        }));
        toast({ title: "Cliente encontrado" });
      } else {
        toast({ title: "Cliente no registrado", description: "La información ingresada se guardará solo en esta nota." });
      }
    } catch (e) {
      toast({ title: "Error en búsqueda", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveCustomerToDirectory = async () => {
    if (!salesService || !clientData.ruc || !clientData.name) {
      toast({ title: "Datos incompletos", variant: "destructive" });
      return;
    }

    setLoadingAction('save_customer');
    try {
      const existing = await salesService.findCustomerByRuc(clientData.ruc);
      if (!existing) {
        await salesService.saveCustomer({
          ruc: clientData.ruc,
          name: clientData.name,
          address: clientData.address,
          email: clientData.email,
          phone: clientData.phone
        });
        toast({ title: "Cliente guardado en base de datos" });
      } else {
        toast({ title: "El cliente ya existe" });
      }
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConsumidorFinal = () => {
    if (!isConsumidorFinal) {
      setClientData({ ...clientData, ruc: "9999999999999", name: "CONSUMIDOR FINAL", address: "S/N", email: "consumidor@final.com", phone: "0999999999" });
      setIsConsumidorFinal(true);
    } else {
      setClientData({ ...clientData, ruc: "", name: "", address: "", email: "", phone: "" });
      setIsConsumidorFinal(false);
    }
  };

  return {
    date, setDate,
    loadingAction, setLoadingAction,
    isConsumidorFinal, handleConsumidorFinal,
    noteNumber, setNoteNumber,
    savedDocId, setSavedDocId,
    deposit, setDeposit,
    clientData, setClientData,
    items, setItems,
    observations, setObservations,
    totalWithIVA, subtotalBase, ivaCalculated, balance,
    docInfo,
    handleLookupCustomer,
    handleSaveCustomerToDirectory,
    isSearchingCedula, fetchCedulaData,
    salesService
  };
}
