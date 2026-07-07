"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  Loader2,
  Calendar as CalendarIcon,
  FileDown,
  CheckCircle2,
  UserCheck,
  Hash,
  MapPin,
  Phone,
  Trash2,
  Plus,
  Search,
  Code,
  Mail,
  Send,
  ShieldCheck,
  Globe,
  Check,
  Lock,
  AlertTriangle,
  Ban,
  ShieldAlert,
  UserPlus,
  DollarSign,
  Info,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent
} from "@/components/ui/tooltip";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, addDoc, getDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generateBillingPDF, getBillingPDFBase64, generateThermalPDF } from "@/lib/pdf-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { emitirFacturaAction } from "@/app/actions/sri-actions";
import { generateInvoiceXML, generateCreditNoteXML, downloadXML } from "@/lib/sri-xml-service";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DEFAULT_TAX_CONFIG, TaxConfig } from "@/lib/config-helper";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.invoiceId as string;
  const { toast } = useToast();
  const db = useFirestore();
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(DEFAULT_TAX_CONFIG);
  
  const invoiceRef = useMemo(() => (db ? doc(db, "invoices", invoiceId) : null), [db, invoiceId]);
  const { data: invoice, loading: loadingDoc } = useDoc<any>(invoiceRef);

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: availableProducts } = useCollection(productsRef);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "taxConfig", "current")).then((snap) => {
      if (snap.exists()) {
        setTaxConfig(snap.data() as TaxConfig);
      }
    }).catch((err) => console.error("Error al cargar config de emisor:", err));
  }, [db]);

  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'xml' | 'mail' | 'sri' | 'annul' | 'lookup' | 'save_customer' | 'ticket' | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [showAnnulDialog, setShowAnnulDialog] = useState(false);
  
  const [currentStatus, setCurrentStatus] = useState("Pendiente");
  const [authDate, setAuthDate] = useState<string | null>(null);
  const [authorizedXml, setAuthorizedXml] = useState<string | null>(null);
  const [sriError, setSriError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<number>(0);

  const [sriStatus, setSriStatus] = useState({
    firma: false,
    recepcion: false,
    autorizacion: false
  });

  const [clientData, setClientData] = useState({ 
    ruc: "", 
    name: "", 
    address: "", 
    email: "", 
    phone: "", 
    paymentMethod: "01",
    transferNumber: ""
  });
  const [items, setItems] = useState<any[]>([]);
  const [observations, setObservations] = useState("");

  useEffect(() => {
    if (invoice) {
      setClientData({
        ruc: invoice.clientData?.ruc || invoice.customerRuc || "",
        name: invoice.clientData?.name || invoice.customerName || "",
        address: invoice.clientData?.address || "",
        email: invoice.clientData?.email || "",
        phone: invoice.clientData?.phone || "",
        paymentMethod: invoice.clientData?.paymentMethod || "01",
        transferNumber: invoice.clientData?.transferNumber || ""
      });
      setItems(invoice.items || []);
      setObservations(invoice.observations || "");
      setCurrentStatus(invoice.status || "Pendiente");
      setAuthDate(invoice.authDate || null);
      setAuthorizedXml(invoice.authorizedXml || null);
      setSriError(invoice.sriError || null);
      setDeposit(invoice.deposit || 0);
      if (invoice.date) setDate(new Date(invoice.date));
      if (invoice.status === 'Autorizado') {
        setSriStatus({ firma: true, recepcion: true, autorizacion: true });
      }
    }
  }, [invoice]);

  const isAuthorized = currentStatus === 'Autorizado';
  const isAnnulled = currentStatus === 'Anulada';
  const isReadOnly = isAuthorized || isAnnulled;

  const subtotal15 = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.description.trim() === "") return acc;
      return acc + (item.ivaRate === "15" ? ((item.quantity * item.unitPrice) / 1.15) : 0);
    }, 0);
  }, [items]);

  const subtotal0 = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.description.trim() === "") return acc;
      return acc + (item.ivaRate === "0" ? (item.quantity * item.unitPrice) : 0);
    }, 0);
  }, [items]);

  const subtotalNoObjeto = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.description.trim() === "") return acc;
      return acc + (item.ivaRate === "No objeto" ? (item.quantity * item.unitPrice) : 0);
    }, 0);
  }, [items]);

  const subtotalExento = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.description.trim() === "") return acc;
      return acc + (item.ivaRate === "Exento" ? (item.quantity * item.unitPrice) : 0);
    }, 0);
  }, [items]);

  const subtotalBase = useMemo(() => {
    return subtotal15 + subtotal0 + subtotalNoObjeto + subtotalExento;
  }, [subtotal15, subtotal0, subtotalNoObjeto, subtotalExento]);

  const ivaCalculated = useMemo(() => {
    return subtotal15 * 0.15;
  }, [subtotal15]);

  const totalWithIVA = useMemo(() => {
    return items.reduce((acc, item) => {
      if (item.description.trim() === "") return acc;
      return acc + (item.quantity * item.unitPrice);
    }, 0);
  }, [items]);

  const balance = useMemo(() => {
    return Math.max(0, totalWithIVA - deposit);
  }, [totalWithIVA, deposit]);

  const handleLookupCustomer = async () => {
    if (!db || !clientData.ruc) return;
    setLoadingAction('lookup');
    try {
      const q = query(collection(db, "customers"), where("ruc", "==", clientData.ruc));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setClientData(prev => ({
          ...prev,
          name: data.name || "",
          address: data.address || "",
          email: data.email || "",
          phone: data.phone || ""
        }));
        toast({ title: "Cliente encontrado" });
      } else {
        toast({ title: "No encontrado", description: "Puede completar los datos para esta factura." });
      }
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
    finally { setLoadingAction(null); }
  };

  const handleSaveCustomerToDirectory = async () => {
    if (!db || !clientData.ruc || !clientData.name) return;
    setLoadingAction('save_customer');
    try {
      const q = query(collection(db, "customers"), where("ruc", "==", clientData.ruc));
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(collection(db, "customers"), {
          ruc: clientData.ruc,
          name: clientData.name,
          address: clientData.address,
          email: clientData.email,
          phone: clientData.phone,
          status: "Activo",
          createdAt: serverTimestamp()
        });
        toast({ title: "Cliente guardado en directorio" });
      } else {
        toast({ title: "El cliente ya existe" });
      }
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
    finally { setLoadingAction(null); }
  };

  const handleSave = async (customStatus?: string, customAuthDate?: string, customAuthorizedXml?: string, customSriError?: string) => {
    if (!invoiceRef || isReadOnly) return;
    const isSilent = customStatus !== undefined;
    if (!isSilent) setLoadingAction('save');

    if (!taxConfig || !taxConfig.ruc) {
      toast({ title: "Emisor no configurado", description: "Falta configurar los datos tributarios del emisor.", variant: "destructive" });
      return;
    }
    if (!taxConfig.regimen) {
      toast({ title: "Régimen no configurado", description: "El régimen tributario del emisor no puede estar vacío.", variant: "destructive" });
      return;
    }

    const activeItems = items.filter(i => i.description.trim() !== "");
    const missingIva = activeItems.some(i => i.ivaRate === undefined || i.ivaRate === null || i.ivaRate === "");
    if (missingIva) {
      toast({
        title: "Tarifa de IVA faltante",
        description: "Existen productos sin tarifa de IVA configurada. Por favor, corríjalos antes de facturar.",
        variant: "destructive"
      });
      return;
    }

    try {
      const updateData: any = {
        clientData: { ...clientData },
        items: items.filter(i => i.description.trim() !== ""),
        subtotal15,
        subtotal0,
        subtotalNoObjeto,
        subtotalExento,
        subtotalBase,
        ivaCalculated,
        total: totalWithIVA,
        deposit: deposit,
        balance: balance,
        observations,
        status: customStatus || currentStatus || "Pendiente",
        date: date.toISOString(),
        updatedAt: serverTimestamp(),
      };

      if (customAuthDate) updateData.authDate = customAuthDate;
      if (customAuthorizedXml) updateData.authorizedXml = customAuthorizedXml;
      if (customSriError !== undefined) updateData.sriError = customSriError;

      await updateDoc(invoiceRef, updateData);
      
      if (isSilent) {
        if (customStatus) setCurrentStatus(customStatus);
        if (customAuthDate) setAuthDate(customAuthDate);
        if (customAuthorizedXml) setAuthorizedXml(customAuthorizedXml);
        if (customSriError !== undefined) setSriError(customSriError);
      }

      if (!isSilent) {
        toast({ title: "Factura actualizada" });
        router.push('/dashboard/invoices');
      }
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally { if (!isSilent) setLoadingAction(null); }
  };

  const handleAnnul = async () => {
    if (!invoiceRef || !isAuthorized) return;
    
    setLoadingAction('annul');
    try {
      const ncXml = generateCreditNoteXML({
        rucEmisor: taxConfig.ruc,
        razonSocialEmisor: taxConfig.razonSocial,
        dirMatriz: taxConfig.dirMatriz,
        estab: taxConfig.estab,
        ptoEmi: taxConfig.ptoEmi,
        secuencial: "999" + invoice.invoiceNumber.split("-")[2].substring(3), 
        fechaEmision: format(new Date(), "dd/MM/yyyy"),
        cliente: {
          razonSocial: clientData.name,
          identificacion: clientData.ruc
        },
        items: items.filter(i => i.description.trim() !== "").map(i => ({
          descripcion: i.description,
          cantidad: i.quantity,
          precioUnitario: i.unitPrice,
          ivaRate: i.ivaRate
        })),
        formaPago: clientData.paymentMethod,
        tipoComprobante: "04",
        facturaModificada: {
          numero: invoice.invoiceNumber,
          fecha: format(new Date(invoice.date), "dd/MM/yyyy")
        }
      });

      const res = await emitirFacturaAction(ncXml);
      
      if (!res.success) {
        throw new Error(res.error || "El SRI rechazó la Nota de Crédito de anulación.");
      }

      await updateDoc(invoiceRef, {
        status: "Anulada",
        annulledAt: serverTimestamp(),
        annulledBy: localStorage.getItem('amec_user_name') || 'Admin',
        creditNoteAccessKey: res.claveAcceso,
        creditNoteXml: res.autorizacion
      });

      setCurrentStatus("Anulada");
      toast({ 
        title: "Documento Anulado Legalmente", 
        description: "Se procesó la Nota de Crédito con el SRI exitosamente." 
      });
      setShowAnnulDialog(false);
    } catch (e: any) {
      toast({ title: "Fallo en Anulación SRI", description: e.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendToSRI = async () => {
    if (isReadOnly) return;

    setLoadingAction('sri');
    setSriStatus({ firma: false, recepcion: false, autorizacion: false });

    try {
      const xmlBase = generateInvoiceXML({
        rucEmisor: taxConfig.ruc,
        razonSocialEmisor: taxConfig.razonSocial,
        dirMatriz: taxConfig.dirMatriz,
        estab: taxConfig.estab,
        ptoEmi: taxConfig.ptoEmi,
        secuencial: invoice?.invoiceNumber.split("-")[2],
        fechaEmision: format(date, "dd/MM/yyyy"),
        cliente: {
          razonSocial: clientData.name,
          identificacion: clientData.ruc,
          direccion: clientData.address,
          email: clientData.email,
          telefono: clientData.phone
        },
        items: items.filter(i => i.description.trim() !== "").map(i => ({
          descripcion: i.description,
          cantidad: i.quantity,
          precioUnitario: i.unitPrice,
          ivaRate: i.ivaRate
        })),
        formaPago: clientData.paymentMethod,
        observaciones: observations,
        transferNumber: clientData.transferNumber,
        deposit: deposit,
        balance: balance
      });

      const res = await emitirFacturaAction(xmlBase);
      if (!res.success) throw new Error(res.error);

      const authDateStr = format(new Date(), "dd/MM/yyyy HH:mm:ss");
      
      setSriStatus({ firma: true, recepcion: true, autorizacion: true });
      await handleSave("Autorizado", authDateStr, res.autorizacion, "");
      toast({ title: "Factura Autorizada con éxito" });

    } catch (error: any) {
      await handleSave("Rechazado", undefined, undefined, error.message);
      toast({ title: "Error SRI", description: error.message, variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  const handleDownloadRIDE = async () => {
    await handleSave(currentStatus);
    setLoadingAction('pdf');
    try {
      generateBillingPDF({
        title: "Factura",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        subtotal15,
        subtotal0,
        subtotalNoObjeto,
        subtotalExento,
        iva15: ivaCalculated,
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: invoice?.invoiceNumber,
        accessKey: invoice?.claveAcceso,
        status: currentStatus, 
        time: authDate || undefined, 
        observations
      });
    } finally { setLoadingAction(null); }
  };

  const handlePrintTicket = async () => {
    await handleSave(currentStatus);
    setLoadingAction('ticket');
    try {
      generateThermalPDF({
        title: "Factura",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        subtotal15,
        subtotal0,
        subtotalNoObjeto,
        subtotalExento,
        iva15: ivaCalculated,
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: invoice?.invoiceNumber,
        accessKey: invoice?.claveAcceso,
        status: currentStatus, 
        time: authDate || undefined, 
        observations
      });
    } finally { setLoadingAction(null); }
  };

  const handleSendEmail = async () => {
    if (!clientData.email) return toast({ title: "Email requerido", variant: "destructive" });
    await handleSave(currentStatus);
    setLoadingAction('mail');
    try {
      const base64 = getBillingPDFBase64({
        title: "Factura",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        subtotal15,
        subtotal0,
        subtotalNoObjeto,
        subtotalExento,
        iva15: ivaCalculated,
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: invoice?.invoiceNumber,
        accessKey: invoice?.claveAcceso,
        status: currentStatus,
        time: authDate || undefined,
        observations
      });

      const xmlBase64 = authorizedXml ? btoa(unescape(encodeURIComponent(authorizedXml))) : undefined;

      const res = await sendBillingEmail({
        to: clientData.email,
        subject: `Factura AMEC - #${invoice?.invoiceNumber}`,
        clientName: clientData.name,
        docType: "Factura",
        total: totalWithIVA,
        docNumber: invoice?.invoiceNumber,
        pdfBase64: base64,
        xmlContent: xmlBase64,
        observations: observations
      });

      if (res.success) toast({ title: "Comprobante enviado" });
      else toast({ title: "Error", description: res.error, variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    return availableProducts.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [availableProducts, productSearch]);

  if (loadingDoc) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <TooltipProvider>
      <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in duration-700 p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sticky top-0 z-20 bg-background/95 backdrop-blur-lg py-4 border-b px-4 rounded-xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-primary">
                {isAnnulled ? "Factura Anulada Legalmente" : isAuthorized ? "Comprobante SRI Autorizado" : "Editar Factura"}
              </h1>
              <Badge variant="outline" className="mt-1"><Hash className="h-3 w-3 mr-1" /> {invoice?.invoiceNumber}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleSendEmail} disabled={loadingAction !== null || isAnnulled}>
              {loadingAction === 'mail' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />} Email
            </Button>
            <Button variant="outline" onClick={() => { if(authorizedXml) downloadXML(authorizedXml, `Factura_${invoice?.invoiceNumber}.xml`) }} disabled={loadingAction !== null || !isAuthorized}>
              {loadingAction === 'xml' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />} XML
            </Button>
            <Button variant="outline" onClick={handlePrintTicket} disabled={loadingAction !== null || isAnnulled}>
              {loadingAction === 'ticket' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />} Ticket
            </Button>
            <Button variant="outline" onClick={handleDownloadRIDE} disabled={loadingAction !== null}>
              {loadingAction === 'pdf' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <FileDown className="mr-2 h-4 w-4" />} RIDE
            </Button>
            
            {isAuthorized && !isAnnulled && (
              <Button variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => setShowAnnulDialog(true)} disabled={loadingAction !== null}>
                <Ban className="mr-2 h-4 w-4" /> Anular Factura (NC)
              </Button>
            )}

            {!isReadOnly && (
              <Button onClick={() => handleSave()} disabled={loadingAction !== null} className="bg-slate-900 text-white">
                {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
              </Button>
            )}
            
            {isAnnulled && (
              <Badge className="bg-slate-500 text-white h-10 px-4 rounded-lg flex items-center gap-2">
                <Lock className="h-4 w-4" /> Documento Invalidado Legalmente
              </Badge>
            )}
            
            {isAuthorized && !isAnnulled && (
              <Badge className="bg-emerald-500 text-white h-10 px-4 rounded-lg flex items-center gap-2">
                <Lock className="h-4 w-4" /> Registro Inalterable SRI
              </Badge>
            )}
          </div>
        </div>

        {/* Banner informativo de obligaciones SRI */}
        <Alert className="bg-amber-50 border-amber-200 text-amber-900 rounded-2xl p-4 shadow-sm flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <AlertTitle className="font-bold text-amber-800">Obligación Tributaria SRI</AlertTitle>
            <AlertDescription className="text-xs font-medium text-amber-700">
              El contribuyente pertenece al régimen **{taxConfig.regimen}** y tiene la obligación de realizar la **declaración semestral de IVA**.
              El sistema requiere configurar una tarifa de IVA (0%, 15%, No Objeto o Exento) para cada producto facturado.
            </AlertDescription>
          </div>
        </Alert>

        {isAnnulled && (
          <div className="bg-slate-100 border border-slate-200 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500">
            <div className="h-10 w-10 bg-slate-500 rounded-full flex items-center justify-center text-white shrink-0">
              <Ban className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <p className="text-slate-900 font-black text-sm uppercase tracking-tighter">Documento Anulado vía Nota de Crédito</p>
              <p className="text-slate-700 text-xs font-medium">Esta factura ya no tiene validez legal comercial. Se generó el documento de reversión ante el SRI.</p>
              {invoice?.creditNoteAccessKey && (
                <p className="text-[10px] font-mono font-bold text-primary mt-1">Ref NC: {invoice.creditNoteAccessKey}</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-8">
                <div className="flex items-center justify-between border-b pb-4">
                  <h2 className="text-xl font-bold text-slate-800">Información del Receptor</h2>
                  {!isReadOnly && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase" onClick={handleLookupCustomer} disabled={loadingAction === 'lookup' || !clientData.ruc}>
                        {loadingAction === 'lookup' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />} Buscar
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase bg-primary/5 text-primary border-primary/20" onClick={handleSaveCustomerToDirectory} disabled={loadingAction === 'save_customer' || !clientData.name || !clientData.ruc}>
                        {loadingAction === 'save_customer' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />} Guardar
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">R.U.C / C.I.</Label>
                    <Input value={clientData.ruc} disabled={isReadOnly} onChange={e => setClientData({...clientData, ruc: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">Razón Social</Label>
                    <Input value={clientData.name} disabled={isReadOnly} onChange={e => setClientData({...clientData, name: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">Email</Label>
                    <Input value={clientData.email} disabled={isReadOnly} onChange={e => setClientData({...clientData, email: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">Teléfono</Label>
                    <Input value={clientData.phone} disabled={isReadOnly} onChange={e => setClientData({...clientData, phone: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-bold text-[10px] uppercase">Dirección</Label>
                    <Input value={clientData.address} disabled={isReadOnly} onChange={e => setClientData({...clientData, address: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-4">
                <Label className="font-bold text-[10px] uppercase">Observaciones Legales:</Label>
                <Textarea value={observations} disabled={isReadOnly} onChange={e => setObservations(e.target.value)} className="bg-slate-50 min-h-[120px]" />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="border-none shadow-2xl bg-white rounded-2xl overflow-hidden border-t-4 border-t-primary">
              <CardHeader className="bg-slate-50/50 pb-4"><CardTitle className="text-xl font-black tracking-tight text-slate-800">Acciones de Facturación</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-6">
                <Button onClick={handleSendToSRI} disabled={loadingAction === 'sri' || isReadOnly} className={cn("w-full h-14 rounded-xl font-bold text-base transition-all shadow-lg", isReadOnly ? "bg-slate-200 text-slate-500" : "bg-accent hover:bg-accent/90")}>
                  {loadingAction === 'sri' ? <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Procesando SRI...</> : isReadOnly ? <><Lock className="mr-2 h-5 w-5" /> Finalizada</> : <><Send className="mr-2 h-5 w-5" /> Enviar al SRI</>}
                </Button>
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="flex items-center gap-3"><div className={cn("h-8 w-8 rounded-full flex items-center justify-center", sriStatus.firma ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><ShieldCheck className="h-4 w-4" /></div><span className={cn("text-sm font-bold", sriStatus.firma ? "text-slate-900" : "text-slate-400")}>Firma Digital</span></div>{sriStatus.firma && <Check className="h-5 w-5 text-emerald-500" />}</div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="flex items-center gap-3"><div className={cn("h-8 w-8 rounded-full flex items-center justify-center", sriStatus.recepcion ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><Globe className="h-4 w-4" /></div><span className={cn("text-sm font-bold", sriStatus.recepcion ? "text-slate-900" : "text-slate-400")}>Recepción SRI</span></div>{sriStatus.recepcion && <Check className="h-5 w-5 text-emerald-500" />}</div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="flex items-center gap-3"><div className={cn("h-8 w-8 rounded-full flex items-center justify-center", sriStatus.autorizacion ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><CheckCircle2 className="h-4 w-4" /></div><span className={cn("text-sm font-bold", sriStatus.autorizacion ? "text-slate-900" : "text-slate-400")}>Autorización SRI</span></div>{sriStatus.autorizacion && <Check className="h-5 w-5 text-emerald-500" />}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-6">
                <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Emisión</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">Fecha</Label>
                    {!isReadOnly ? (
                      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-11">{format(date, "dd/MM/yyyy")}</Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={d => { if(d) setDate(d); setIsCalendarOpen(false); }} locale={es} /></PopoverContent>
                      </Popover>
                    ) : (
                      <div className="h-11 px-3 bg-slate-50 border border-slate-100 rounded-md flex items-center text-sm font-bold text-slate-700">{format(date, "dd/MM/yyyy")}</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-[10px] uppercase">Forma de Pago</Label>
                    {!isReadOnly ? (
                      <Select value={clientData.paymentMethod} onValueChange={v => setClientData({...clientData, paymentMethod: v})}>
                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_METHODS.map(m => (<SelectItem key={m.code} value={m.code}>{m.code} - {m.label}</SelectItem>))}</SelectContent>
                      </Select>
                    ) : (
                      <div className="h-11 px-3 bg-slate-50 border border-slate-100 rounded-md flex items-center text-sm font-bold text-slate-700">{PAYMENT_METHODS.find(m => m.code === clientData.paymentMethod)?.label || "EFECTIVO"}</div>
                    )}
                  </div>
                  {clientData.paymentMethod === "20" && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label className="font-bold text-primary uppercase text-[10px]">No. Transferencia / Comprobante</Label>
                      {!isReadOnly ? (
                        <Input placeholder="Referencia bancaria" value={clientData.transferNumber} onChange={(e) => setClientData({...clientData, transferNumber: e.target.value})} className="bg-primary/5 border-primary/20 h-11 font-bold" />
                      ) : (
                        <div className="h-11 px-3 bg-slate-50 border border-slate-100 rounded-md flex items-center text-sm font-bold text-slate-700">{clientData.transferNumber || "N/A"}</div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="col-span-full">
          <Card className="border-none shadow-xl bg-white rounded-2xl overflow-hidden">
            <CardContent className="pt-8">
              <h3 className="text-xl font-bold mb-6 text-slate-800 border-b pb-4">Detalle de Productos</h3>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={item.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Descripción</Label>
                      {!isReadOnly ? (
                        <Popover open={openPopoverId === item.id} onOpenChange={(open) => setOpenPopoverId(open ? item.id : null)}>
                          <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-11 bg-white">{item.description || "Haz clic para buscar..."}</Button></PopoverTrigger>
                          <PopoverContent className="p-0 w-[450px]" align="start">
                            <div className="p-2 border-b"><Input placeholder="Filtrar catálogo..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="bg-slate-50 border-none" /></div>
                            <div className="max-h-[250px] overflow-y-auto">
                              {filteredProducts.map((p: any) => (
                                <button key={p.id} className="w-full text-left px-4 py-3 text-sm hover:bg-primary/5 flex items-center justify-between border-b last:border-0" onClick={() => {
                                  if (p.stock !== undefined && p.stock <= 0) {
                                    toast({ title: "Producto Agotado", description: `El producto ${p.name} no tiene stock disponible.`, variant: "destructive" });
                                    return;
                                  }
                                  const currentQty = items[idx].quantity || 1;
                                  const newQty = (p.stock !== undefined && currentQty > p.stock) ? p.stock : currentQty;
                                  if (newQty < currentQty) {
                                     toast({ title: "Stock Insuficiente", description: `Se ajustó la cantidad a ${newQty} unidades.`, variant: "destructive" });
                                  }
                                  const newItems = [...items];
                                  newItems[idx] = { ...newItems[idx], description: p.name, unitPrice: p.price, productId: p.id, maxStock: p.stock !== undefined ? p.stock : null, quantity: newQty, ivaRate: p.ivaRate !== undefined ? p.ivaRate.toString() : null };
                                  setItems(newItems);
                                  setOpenPopoverId(null);
                                }}>
                                  <span className="font-bold text-slate-700">{p.name}</span>
                                  <div className="flex gap-2 items-center">
                                    {p.stock !== undefined && <span className={cn("text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest", p.stock <= 10 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>Stock: {p.stock}</span>}
                                    <span className="text-xs font-black text-primary bg-primary/5 px-2 py-1 rounded">${p.price.toFixed(2)}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="h-11 px-3 bg-white border border-slate-100 rounded-md flex items-center text-sm font-medium text-slate-700">{item.description}</div>
                      )}
                    </div>
                    <div className="w-24 space-y-2"><Label className="text-[10px] font-black uppercase text-slate-400">Cant.</Label><Input type="number" value={item.quantity} disabled={isReadOnly} onChange={e => { 
                      let val = parseFloat(e.target.value) || 0;
                      if (item.maxStock !== null && val > item.maxStock) {
                        toast({ title: "Stock Insuficiente", description: `Solo hay ${item.maxStock} unidades en inventario.`, variant: "destructive" });
                        val = item.maxStock;
                      }
                      const newItems = [...items]; newItems[idx].quantity = val; setItems(newItems); 
                    }} className="h-11 bg-white text-center font-bold" /></div>
                    <div className="w-32 space-y-2"><Label className="text-[10px] font-black uppercase text-slate-400">P. Unitario</Label><Input type="number" value={item.unitPrice} disabled={isReadOnly} onChange={e => { const newItems = [...items]; newItems[idx].unitPrice = parseFloat(e.target.value) || 0; setItems(newItems); }} className="h-11 bg-white text-right font-black text-primary" /></div>
                    <div className="w-36 space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400">Tarifa IVA</Label>
                      <div className="relative">
                        <Select 
                          value={item.ivaRate || ""} 
                          disabled={isReadOnly}
                          onValueChange={(val) => {
                            const newItems = [...items];
                            newItems[idx].ivaRate = val;
                            setItems(newItems);
                          }}
                        >
                          <SelectTrigger className={cn("h-11 bg-white border-slate-200 font-bold", (!item.ivaRate || item.ivaRate === "") && "border-rose-300 bg-rose-50/50 text-rose-700")}>
                            <SelectValue placeholder="Elegir Tarifa" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="15">IVA 15%</SelectItem>
                            <SelectItem value="0">IVA 0%</SelectItem>
                            <SelectItem value="No objeto">No Objeto</SelectItem>
                            <SelectItem value="Exento">Exento</SelectItem>
                          </SelectContent>
                        </Select>
                        {(!item.ivaRate || item.ivaRate === "") && (
                          <span className="text-[9px] font-bold text-rose-500 mt-1 block">Requerido *</span>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && <div className="flex items-end"><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-rose-500 h-11 w-11"><Trash2 className="h-5 w-5" /></Button></div>}
                  </div>
                ))}
              </div>
              {!isReadOnly && <Button onClick={() => setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0, ivaRate: null }])} variant="outline" className="mt-6 border-dashed border-2 w-full h-14 font-bold text-primary"><Plus className="mr-2 h-4 w-4" /> Añadir Item</Button>}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row justify-end items-start gap-8 mt-8">
           <Card className="border-none shadow-xl bg-white rounded-3xl p-8 space-y-6 w-full md:w-96">
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal IVA 15%:</span><span>${subtotal15.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal IVA 0%:</span><span>${subtotal0.toFixed(2)}</span></div>
              {subtotalNoObjeto > 0 && (
                <div className="flex justify-between text-sm text-slate-500"><span>Subtotal No Objeto:</span><span>${subtotalNoObjeto.toFixed(2)}</span></div>
              )}
              {subtotalExento > 0 && (
                <div className="flex justify-between text-sm text-slate-500"><span>Subtotal Exento:</span><span>${subtotalExento.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between text-sm text-slate-500 border-t pt-2"><span>Subtotal sin Impuestos:</span><span>${subtotalBase.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm text-slate-500"><span>IVA 15%:</span><span>${ivaCalculated.toFixed(2)}</span></div>
              <div className="flex justify-between text-xl font-black border-t pt-4 text-slate-900"><span>TOTAL:</span><span>${totalWithIVA.toFixed(2)}</span></div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-dashed">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-primary">Abonar (Monto Recibido):</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input 
                    type="number" 
                    value={deposit} 
                    disabled={isReadOnly}
                    onChange={(e) => setDeposit(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="pl-10 h-12 bg-primary/5 border-primary/20 text-primary font-bold text-lg rounded-xl"
                  />
                </div>
              </div>
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-rose-600">Saldo Pendiente:</span>
                <span className="text-2xl font-black text-rose-700 font-mono">${balance.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </div>

        <AlertDialog open={showAnnulDialog} onOpenChange={(open) => !open && !loadingAction && setShowAnnulDialog(false)}>
          <AlertDialogContent className="rounded-2xl" asChild>
            <div className="p-6">
              <AlertDialogHeader>
                <div className="mx-auto h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                  <ShieldAlert className="h-6 w-6 text-amber-600" />
                </div>
                <AlertDialogTitle className="text-center">¿Anulación Legal vía Nota de Crédito?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">Al confirmar, el sistema generará y procesará una **Nota de Crédito (04)** ante el SRI para anular legalmente este comprobante.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-6">
                <AlertDialogCancel disabled={loadingAction === 'annul'} className="rounded-xl mt-0">Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 min-w-[140px]" 
                  onClick={handleAnnul} 
                  disabled={loadingAction === 'annul'}
                >
                  {loadingAction === 'annul' ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Procesando SRI...</> : "Sí, procesar anulación"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
