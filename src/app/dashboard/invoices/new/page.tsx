"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  Loader2,
  Calendar as CalendarIcon,
  Mail,
  FileDown,
  Code,
  CheckCircle2,
  Hash,
  UserCheck,
  Send,
  ShieldCheck,
  Globe,
  Check,
  FileWarning,
  Info,
  Search,
  UserPlus,
  DollarSign
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
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFirestore, useCollection } from "@/firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, updateDoc, doc, where, getDocs, increment } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generateBillingPDF, getBillingPDFBase64 } from "@/lib/pdf-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { emitirFacturaAction } from "@/app/actions/sri-actions";
import { generateInvoiceXML, downloadXML, generateAccessKey } from "@/lib/sri-xml-service";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function NewInvoicePage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'xml' | 'mail' | 'sri' | 'lookup' | 'save_customer' | null>(null);
  const [showEmptyDataModal, setShowEmptyDataModal] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("001-100-000000001");
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  
  const docIdRef = useRef<string | null>(null);

  const [currentStatus, setCurrentStatus] = useState("Pendiente");
  const [authDate, setAuthDate] = useState<string | null>(null);
  const [authorizedXml, setAuthorizedXml] = useState<string | null>(null);
  const [currentClaveAcceso, setCurrentClaveAcceso] = useState<string | null>(null);
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
  
  const [items, setItems] = useState<any[]>([{ id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0, productId: null, maxStock: null }]);
  const [observations, setObservations] = useState("");

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: availableProducts } = useCollection(productsRef);
  
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "invoices"), orderBy("invoiceNumber", "desc"), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const lastInv = snapshot.docs[0].data();
        const lastNum = lastInv.invoiceNumber || "001-100-000000000";
        const parts = lastNum.split("-");
        if (parts.length === 3) {
          const sequence = parseInt(parts[2]) + 1;
          setInvoiceNumber(`001-100-${sequence.toString().padStart(9, '0')}`);
        }
      }
    });
    return () => unsubscribe();
  }, [db]);

  const totalWithIVA = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const subtotalBase = totalWithIVA;
  const ivaCalculated = 0;
  const balance = Math.max(0, totalWithIVA - deposit);

  const handleLookupCustomer = async () => {
    if (!db || !clientData.ruc) return;
    if (clientData.ruc.length !== 10 && clientData.ruc.length !== 13) {
      toast({ title: "Identificación inválida", description: "Ingrese 10 o 13 dígitos.", variant: "destructive" });
      return;
    }

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
        toast({ title: "Cliente encontrado en el directorio" });
      } else {
        toast({ title: "Cliente no registrado", description: "Puede completar los datos para esta factura." });
      }
    } catch (e) {
      toast({ title: "Error en búsqueda", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveCustomerToDirectory = async () => {
    if (!db || !clientData.ruc || !clientData.name) {
      toast({ title: "Datos insuficientes", description: "RUC y Nombre son obligatorios.", variant: "destructive" });
      return;
    }

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
        toast({ title: "Cliente guardado exitosamente" });
      } else {
        toast({ title: "El cliente ya existe en el directorio" });
      }
    } catch (e) {
      toast({ title: "Error al guardar cliente", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const getClaveAccesoActual = () => {
    return generateAccessKey({
      rucEmisor: "1725389454001",
      razonSocialEmisor: "Andrés Paul Morales Tobar",
      dirMatriz: "Av Jaime roldos oe2-128 y Francisco Sánchez",
      estab: "001",
      ptoEmi: "100",
      secuencial: invoiceNumber.split("-")[2],
      fechaEmision: format(date, "dd/MM/yyyy"),
      cliente: { razonSocial: clientData.name, identificacion: clientData.ruc },
      items: items.map(i => ({ descripcion: i.description, cantidad: i.quantity, precioUnitario: i.unitPrice })),
      formaPago: clientData.paymentMethod
    });
  };

  const handleSave = async (customStatus?: string, customAuthDate?: string, customAuthorizedXml?: string, sriError?: string) => {
    if (!db) return null;
    if (!clientData.name || clientData.ruc.length < 10) { setShowEmptyDataModal(true); return null; }

    const isSilent = customStatus !== undefined;
    if (!isSilent) setLoadingAction('save');

    const accessKey = getClaveAccesoActual();
    setCurrentClaveAcceso(accessKey);

    const invoiceData: any = {
      invoiceNumber,
      claveAcceso: accessKey,
      clientData: { ...clientData },
      items: items.filter(i => i.description.trim() !== ""),
      total: totalWithIVA,
      deposit: deposit,
      balance: balance,
      observations,
      status: customStatus || currentStatus,
      date: date.toISOString(),
      updatedAt: serverTimestamp(),
      createdBy: localStorage.getItem('amec_user_name') || 'Admin'
    };

    if (customAuthDate) invoiceData.authDate = customAuthDate;
    if (customAuthorizedXml) invoiceData.authorizedXml = customAuthorizedXml;
    if (sriError !== undefined) invoiceData.sriError = sriError;

    try {
      if (docIdRef.current) {
        await updateDoc(doc(db, "invoices", docIdRef.current), invoiceData);
      } else {
        invoiceData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, "invoices"), invoiceData);
        docIdRef.current = docRef.id;

        const batchUpdates = [];
        for (const item of invoiceData.items) {
          if (item.productId) {
            batchUpdates.push(updateDoc(doc(db, "products", item.productId), {
              stock: increment(-item.quantity)
            }));
          }
        }
        if (batchUpdates.length > 0) await Promise.all(batchUpdates);
      }
      
      if (!isSilent) {
        toast({ title: "Factura guardada correctamente" });
        router.push('/dashboard/invoices');
      }
      return docIdRef.current;
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
      return null;
    } finally { if (!isSilent) setLoadingAction(null); }
  };

  const handleSendToSRI = async () => {
    if (currentStatus === 'Autorizado') return;
    
    const docId = await handleSave(currentStatus);
    if (!docId) return;

    setLoadingAction('sri');
    setSriStatus({ firma: false, recepcion: false, autorizacion: false });

    try {
      const xmlBase = generateInvoiceXML({
        rucEmisor: "1725389454001",
        razonSocialEmisor: "Andrés Paul Morales Tobar",
        dirMatriz: "Av Jaime roldos oe2-128 y Francisco Sánchez",
        estab: "001",
        ptoEmi: "100",
        secuencial: invoiceNumber.split("-")[2],
        fechaEmision: format(date, "dd/MM/yyyy"),
        cliente: {
          razonSocial: clientData.name,
          identificacion: clientData.ruc,
          direccion: clientData.address,
          email: clientData.email
        },
        items: items.filter(i => i.description.trim() !== "").map(i => ({
          descripcion: i.description,
          cantidad: i.quantity,
          precioUnitario: i.unitPrice
        })),
        formaPago: clientData.paymentMethod
      });

      const res = await emitirFacturaAction(xmlBase);
      if (!res.success) throw new Error(res.error);

      const formattedAuthDate = format(new Date(), "dd/MM/yyyy HH:mm:ss");
      
      setSriStatus({ firma: true, recepcion: true, autorizacion: true });
      setAuthDate(formattedAuthDate);
      setAuthorizedXml(res.autorizacion);
      setCurrentStatus("Autorizado");

      await handleSave("Autorizado", formattedAuthDate, res.autorizacion, "");
      toast({ title: "Factura Autorizada por el SRI" });

    } catch (error: any) {
      await handleSave("Rechazado", undefined, undefined, error.message);
      toast({ title: "Rechazo SRI", description: error.message, variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  const handleDownloadRIDE = () => {
    if (!clientData.name) { setShowEmptyDataModal(true); return; }
    setLoadingAction('pdf');
    try {
      generateBillingPDF({
        title: "Factura",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: invoiceNumber,
        accessKey: currentClaveAcceso || getClaveAccesoActual(), 
        status: currentStatus,
        time: authDate || undefined,
        observations
      });
    } finally { setLoadingAction(null); }
  };

  const handleDownloadXML = () => {
    if (currentStatus !== 'Autorizado') return;
    setLoadingAction('xml');
    if (authorizedXml) downloadXML(authorizedXml, `Factura_${invoiceNumber}.xml`);
    setLoadingAction(null);
  };

  const handleSendEmail = async () => {
    if (!clientData.email) return toast({ title: "Email requerido", variant: "destructive" });

    setLoadingAction('mail');
    try {
      const base64 = getBillingPDFBase64({
        title: "Factura",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: invoiceNumber,
        accessKey: currentClaveAcceso || getClaveAccesoActual(),
        status: currentStatus,
        time: authDate || undefined,
        observations
      });

      const xmlBase64 = authorizedXml ? btoa(unescape(encodeURIComponent(authorizedXml))) : undefined;

      const res = await sendBillingEmail({
        to: clientData.email,
        subject: `Factura AMEC - #${invoiceNumber}`,
        clientName: clientData.name,
        docType: "Factura",
        total: totalWithIVA,
        docNumber: invoiceNumber,
        pdfBase64: base64,
        xmlContent: xmlBase64,
        observations: observations
      });

      if (res.success) toast({ title: "Comprobante enviado al cliente" });
      else throw new Error(res.error);
    } catch (e: any) { toast({ title: "Fallo de envío", description: e.message, variant: "destructive" }); }
    finally { setLoadingAction(null); }
  };

  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    return availableProducts.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [availableProducts, productSearch]);

  return (
    <TooltipProvider>
      <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in duration-700 p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sticky top-0 z-20 bg-background/95 backdrop-blur-lg py-4 border-b px-4 rounded-xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-primary">Nueva Factura SRI</h1>
              <Badge variant="outline" className="mt-1 bg-primary/10 text-primary border-primary/20">
                <Hash className="h-3.5 w-3.5 mr-1" /> {invoiceNumber}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <Button variant="outline" onClick={handleSendEmail} disabled={loadingAction !== null}>
              {loadingAction === 'mail' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />} Email
            </Button>
            <Button variant="outline" onClick={handleDownloadXML} disabled={loadingAction !== null || currentStatus !== 'Autorizado'}>
              {loadingAction === 'xml' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />} XML
            </Button>
            <Button variant="outline" onClick={handleDownloadRIDE} disabled={loadingAction !== null}>
              {loadingAction === 'pdf' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <FileDown className="mr-2 h-4 w-4" />} RIDE
            </Button>
            <Button onClick={() => handleSave()} disabled={loadingAction !== null} className="bg-slate-900 text-white">
              {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-8">
                <div className="flex items-center justify-between border-b pb-4">
                  <h2 className="text-xl font-bold text-slate-800">Información del Comprador</h2>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[10px] font-black uppercase"
                      onClick={handleLookupCustomer}
                      disabled={loadingAction === 'lookup' || !clientData.ruc}
                    >
                      {loadingAction === 'lookup' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                      Buscar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[10px] font-black uppercase bg-primary/5 text-primary border-primary/20"
                      onClick={handleSaveCustomerToDirectory}
                      disabled={loadingAction === 'save_customer' || !clientData.name || !clientData.ruc}
                    >
                      {loadingAction === 'save_customer' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
                      Guardar
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">R.U.C / C.I.</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Ej: 1725389454001" 
                        value={clientData.ruc} 
                        maxLength={13} 
                        onChange={(e) => setClientData({...clientData, ruc: e.target.value.replace(/\D/g, '')})} 
                        className="bg-slate-50 h-11" 
                      />
                      <Button 
                        variant="outline" 
                        className="h-11 px-3 text-[10px] font-black uppercase"
                        onClick={() => {
                          setClientData(prev => ({
                            ...prev,
                            ruc: "9999999999999",
                            name: "CONSUMIDOR FINAL",
                            address: "S/N",
                            email: "consumidor@final.com",
                            phone: "0999999999"
                          }));
                        }}
                      >
                        <UserCheck className="h-3 w-3 mr-1" /> C. Final
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Razón Social:</Label>
                    <Input placeholder="Nombre completo" value={clientData.name} onChange={(e) => setClientData({...clientData, name: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Email Notificación:</Label>
                    <Input type="email" placeholder="ejemplo@correo.com" value={clientData.email} onChange={(e) => setClientData({...clientData, email: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Teléfono:</Label>
                    <Input placeholder="Ej: 0998765432" value={clientData.phone} onChange={(e) => setClientData({...clientData, phone: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Dirección:</Label>
                    <Input placeholder="Calle, Número, Ciudad" value={clientData.address} onChange={(e) => setClientData({...clientData, address: e.target.value})} className="bg-slate-50 h-11" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-4">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Observaciones Legales:</Label>
                <Textarea placeholder="Ej: Contribuyente RIMPE, detalles de entrega..." value={observations} onChange={(e) => setObservations(e.target.value)} className="bg-slate-50 border-slate-200 rounded-xl min-h-[100px]" />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="border-none shadow-2xl bg-white rounded-2xl overflow-hidden border-t-4 border-t-primary">
              <CardHeader className="bg-slate-50/50 pb-4"><CardTitle className="text-xl font-black tracking-tight text-slate-800">Acciones SRI</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-6">
                <Button onClick={handleSendToSRI} disabled={loadingAction === 'sri' || currentStatus === 'Autorizado'} className={cn("w-full h-14 rounded-xl font-bold text-base transition-all shadow-lg", currentStatus === 'Autorizado' ? "bg-primary text-white cursor-default" : "bg-accent hover:bg-accent/90")}>
                  {loadingAction === 'sri' ? <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Procesando...</> : currentStatus === 'Autorizado' ? <><CheckCircle2 className="mr-2 h-5 w-5" /> Autorizada</> : <><Send className="mr-2 h-5 w-5" /> Enviar al SRI</>}
                </Button>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3"><div className={cn("h-7 w-7 rounded-full flex items-center justify-center", sriStatus.firma ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><ShieldCheck className="h-4 w-4" /></div><span className={cn("text-xs font-bold", sriStatus.firma ? "text-slate-900" : "text-slate-400")}>Firma Digital</span></div>
                    {sriStatus.firma && <Check className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3"><div className={cn("h-7 w-7 rounded-full flex items-center justify-center", sriStatus.recepcion ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><Globe className="h-4 w-4" /></div><span className={cn("text-xs font-bold", sriStatus.recepcion ? "text-slate-900" : "text-slate-400")}>Recepción SRI</span></div>
                    {sriStatus.recepcion && <Check className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3"><div className={cn("h-7 w-7 rounded-full flex items-center justify-center", sriStatus.autorizacion ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}><CheckCircle2 className="h-4 w-4" /></div><span className={cn("text-xs font-bold", sriStatus.autorizacion ? "text-slate-900" : "text-slate-400")}>Autorización SRI</span></div>
                    {sriStatus.autorizacion && <Check className="h-4 w-4 text-emerald-500" />}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-xl">
              <CardContent className="p-8 space-y-6">
                <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Emisión</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Fecha Facturación:</Label>
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left bg-slate-50 h-11"><CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />{format(date, "dd/MM/yyyy", { locale: es })}</Button></PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setIsCalendarOpen(false); } }} locale={es} /></PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 uppercase text-[10px]">Forma de Pago:</Label>
                    <Select value={clientData.paymentMethod} onValueChange={(v) => setClientData({...clientData, paymentMethod: v})}>
                      <SelectTrigger className="bg-slate-50 h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => (<SelectItem key={m.code} value={m.code}>{m.code} - {m.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  {clientData.paymentMethod === "20" && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label className="font-bold text-primary uppercase text-[10px]">No. Transferencia / Comprobante:</Label>
                      <Input placeholder="Referencia bancaria" value={clientData.transferNumber} onChange={(e) => setClientData({...clientData, transferNumber: e.target.value})} className="bg-primary/5 border-primary/20 h-11 font-bold" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-full">
            <Card className="border-none shadow-xl bg-white overflow-hidden rounded-2xl w-full">
              <CardContent className="pt-8">
                <h3 className="text-xl font-bold mb-6 text-slate-800 border-b pb-4">Detalle de Facturación</h3>
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Producto / Servicio</Label>
                        <Popover open={openPopoverId === item.id} onOpenChange={(open) => setOpenPopoverId(open ? item.id : null)}>
                          <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-11 px-3 bg-white font-medium border-slate-100 text-slate-700">{item.description || "Buscar catálogo..."}</Button></PopoverTrigger>
                          <PopoverContent className="p-0 w-[450px]" align="start">
                            <div className="p-2 border-b"><Input placeholder="Filtrar..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="bg-slate-50 border-none" /></div>
                            <div className="max-h-[250px] overflow-y-auto">
                              {filteredProducts.map((p: any) => (
                                <button key={p.id} className="w-full text-left px-4 py-3 text-sm hover:bg-primary/5 flex items-center justify-between border-b last:border-0" onClick={() => { 
                                  setItems(items.map(i => i.id === item.id ? { ...i, description: p.name, unitPrice: p.price, productId: p.id, maxStock: p.stock !== undefined ? p.stock : null } : i)); 
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
                      </div>
                      <div className="w-full md:w-24 space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Cant.</Label>
                        <Input type="number" value={item.quantity} onChange={(e) => {
                          let val = parseFloat(e.target.value) || 0;
                          if (item.maxStock !== null && val > item.maxStock) {
                            toast({ title: "Stock Insuficiente", description: `Solo hay ${item.maxStock} unidades en inventario.`, variant: "destructive" });
                            val = item.maxStock;
                          }
                          setItems(items.map(i => i.id === item.id ? { ...i, quantity: val } : i));
                        }} className="h-11 border-slate-200 bg-white text-center font-bold" />
                      </div>
                      <div className="w-full md:w-32 space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Precio Final</Label>
                        <Input type="number" value={item.unitPrice} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, unitPrice: parseFloat(e.target.value) || 0 } : i))} className="h-11 border-slate-200 bg-white text-right font-black text-primary" />
                      </div>
                      <div className="flex items-end justify-end"><Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-rose-500 h-11 w-11"><Trash2 className="h-5 w-5" /></Button></div>
                    </div>
                  ))}
                </div>
                <Button onClick={() => setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0, productId: null, maxStock: null }])} variant="outline" className="mt-6 border-dashed border-2 w-full h-14 font-bold text-primary"><Plus className="mr-2 h-4 w-4" /> Añadir Línea de Producto</Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-end items-start gap-8 mt-8">
           <Card className="border-none shadow-xl bg-white rounded-3xl p-8 space-y-6 w-full md:w-96">
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-slate-500"><span>Subtotal (IVA 0%):</span><span className="font-mono font-bold">${subtotalBase.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm text-slate-500"><span>IVA 0%:</span><span className="font-mono font-bold">$0.00</span></div>
              <div className="flex justify-between text-xl font-black border-t pt-4 text-slate-900"><span>TOTAL:</span><span className="font-mono">${totalWithIVA.toFixed(2)}</span></div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-dashed">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-primary">Abonar (Pago Inicial):</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input 
                    type="number" 
                    value={deposit} 
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

        <AlertDialog open={showEmptyDataModal} onOpenChange={setShowEmptyDataModal}>
          <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><div className="mx-auto h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 text-primary" /></div><AlertDialogTitle className="text-center">Datos Incompletos</AlertDialogTitle><AlertDialogDescription className="text-center">Debe identificar al cliente y añadir productos.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="justify-center"><AlertDialogAction className="rounded-xl bg-primary px-10 font-bold" onClick={() => setShowEmptyDataModal(false)}>Completar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
