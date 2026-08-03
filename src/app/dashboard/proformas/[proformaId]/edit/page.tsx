"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowLeft, Save, Plus, Trash2, Loader2, Calendar as CalendarIcon, 
  Mail, FileDown, Hash, UserCheck, Phone, Search, MapPin, Info,
  AlertTriangle, FileWarning, DollarSign, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useDoc, useCollection } from "@/firebase";
import { doc, updateDoc, serverTimestamp, collection } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { generateBillingPDF, getBillingPDFBase64, generateThermalPDF } from "@/lib/pdf-service";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function EditProformaPage() {
  const router = useRouter();
  const params = useParams();
  const proformaId = params.proformaId as string;
  const { toast } = useToast();
  const db = useFirestore();
  
  const proformaRef = useMemo(() => (db ? doc(db, "proformas", proformaId) : null), [db, proformaId]);
  const { data: existingProforma, loading: loadingDoc } = useDoc<any>(proformaRef);

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: availableProducts } = useCollection(productsRef);

  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'mail' | 'ticket' | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showEmptyDataModal, setShowEmptyDataModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(false);
  const [observations, setObservations] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [proformaNumber, setProformaNumber] = useState("");
  const [deposit, setDeposit] = useState<number>(0);
  
  const [clientData, setClientData] = useState({
    ruc: "",
    name: "",
    address: "",
    email: "",
    phone: "",
    paymentMethod: "01",
    transferNumber: "",
    validDays: "15"
  });

  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (existingProforma) {
      setProformaNumber(existingProforma.proformaNumber || "");
      const cd = existingProforma.clientData || {};
      setClientData({
        ruc: cd.ruc || existingProforma.ruc || "",
        name: cd.name || existingProforma.customerName || "",
        address: cd.address || existingProforma.address || "",
        email: cd.email || existingProforma.email || "",
        phone: cd.phone || existingProforma.phone || "",
        paymentMethod: cd.paymentMethod || existingProforma.paymentMethod || "01",
        transferNumber: cd.transferNumber || "",
        validDays: cd.validDays || "15"
      });
      setItems(existingProforma.items || []);
      setObservations(existingProforma.observations || "");
      setDeposit(existingProforma.deposit || 0);
      if (existingProforma.date) setDate(new Date(existingProforma.date));
      if ((cd.ruc || existingProforma.ruc) === "9999999999999") setIsConsumidorFinal(true);
    }
  }, [existingProforma]);

  const totalWithIVA = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const subtotalBase = totalWithIVA;
  const ivaCalculated = 0;
  const balance = Math.max(0, totalWithIVA - deposit);

  const docInfo = useMemo(() => {
    if (isConsumidorFinal) return { text: "Consumidor Final activo", isError: false };
    if (clientData.ruc.length === 0) return { text: "", isError: false };
    if (clientData.ruc.length === 10) return { text: "Es Cédula", isError: false };
    if (clientData.ruc.length === 13) return { text: "Es RUC", isError: false };
    return { text: "Identificación inválida", isError: true };
  }, [isConsumidorFinal, clientData.ruc]);

  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    return availableProducts.filter((p: any) => (p.name || "").toLowerCase().includes(productSearch.toLowerCase()));
  }, [availableProducts, productSearch]);

  const handleSelectProduct = (itemId: string, product: any) => {
    setItems(items.map(item => item.id === itemId ? { ...item, description: product.name, unitPrice: product.price } : item));
    setProductSearch("");
    setOpenPopoverId(null);
    setIsDirty(true);
  };

  const handleConsumidorFinal = () => {
    if (!isConsumidorFinal) {
      setClientData(prev => ({
        ...prev,
        ruc: "9999999999999",
        name: "CONSUMIDOR FINAL",
        address: "S/N",
        email: "consumidor@final.com",
        phone: "0999999999"
      }));
      setIsConsumidorFinal(true);
    } else {
      setClientData(prev => ({
        ...prev,
        ruc: "",
        name: "",
        address: "",
        email: "",
        phone: ""
      }));
      setIsConsumidorFinal(false);
    }
    setIsDirty(true);
  };

  const handleSave = async (customStatus?: string) => {
    if (!db || !proformaRef) return;

    if (isConsumidorFinal && totalWithIVA > 50) {
      setShowLimitModal(true);
      return;
    }
    
    if (!clientData.name || (!isConsumidorFinal && clientData.ruc.length < 10)) {
      toast({ title: "Datos incompletos", description: "Verifique la identificación y nombre del cliente.", variant: "destructive" });
      return;
    }

    setLoadingAction('save');
    try {
      await updateDoc(proformaRef, {
        clientData: { ...clientData },
        items: items.filter(i => i.description.trim() !== ""),
        total: totalWithIVA,
        deposit,
        balance,
        observations,
        status: customStatus || existingProforma?.status || "Pendiente",
        date: date.toISOString(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Cambios guardados" });
      setIsDirty(false);
      if (!customStatus) router.push('/dashboard/proformas');
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  const handleGeneratePDF = () => {
    setLoadingAction('pdf');
    try {
      generateBillingPDF({
        title: "Proforma",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: proformaNumber,
        observations,
        color: [79, 70, 229]
      });
      toast({ title: "PDF Generado" });
    } finally { setLoadingAction(null); }
  };

  const handlePrintTicket = () => {
    setLoadingAction('ticket');
    try {
      generateThermalPDF({
        title: "Proforma",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: proformaNumber,
        observations
      });
      toast({ title: "Ticket Generado" });
    } finally { setLoadingAction(null); }
  };

  const handleSendEmail = async () => {
    if (!clientData.email) return toast({ title: "Email requerido", variant: "destructive" });
    setLoadingAction('mail');
    try {
      await handleSave("Enviado");
      const base64 = getBillingPDFBase64({
        title: "Proforma",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: proformaNumber,
        observations,
        color: [79, 70, 229]
      });

      const res = await sendBillingEmail({
        to: clientData.email,
        subject: `Proforma Apm Inox - #${proformaNumber}`,
        clientName: clientData.name,
        docType: "Proforma",
        total: totalWithIVA,
        docNumber: proformaNumber,
        pdfBase64: base64,
        observations: observations
      });

      if (res.success) toast({ title: "¡Enviado!" });
      else toast({ title: "Error de envío", description: res.error, variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  if (loadingDoc) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 p-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-2xl shadow-sm border sticky top-0 z-30 gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-black">Editar Proforma</h1>
            <Badge variant="outline" className="mt-1 bg-slate-100"><Hash className="h-3 w-3 mr-1" /> {proformaNumber}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSendEmail} disabled={loadingAction !== null}>
            {loadingAction === 'mail' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />} Email
          </Button>
          <Button variant="outline" onClick={handleGeneratePDF} disabled={loadingAction !== null}>
            {loadingAction === 'pdf' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <FileDown className="mr-2 h-4 w-4" />} PDF
          </Button>
          <Button variant="outline" onClick={handlePrintTicket} disabled={loadingAction !== null}>
            {loadingAction === 'ticket' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />} Ticket
          </Button>
          <Button onClick={() => handleSave()} disabled={loadingAction !== null} className="bg-primary">
            {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="rounded-2xl border-none shadow-sm bg-white p-8 space-y-8">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Información del Cliente</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">R.U.C / C.I.</Label>
                <div className="flex gap-2">
                  <Input 
                    value={clientData.ruc} 
                    maxLength={13}
                    placeholder="Ej: 1725389454001"
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setClientData({...clientData, ruc: val});
                      if (val !== "9999999999999") setIsConsumidorFinal(false);
                      setIsDirty(true);
                    }} 
                    className="bg-slate-50 border-slate-200 h-11 focus:bg-white transition-colors"
                  />
                  <Button variant={isConsumidorFinal ? "default" : "outline"} onClick={handleConsumidorFinal} className={cn("h-11", isConsumidorFinal && "bg-orange-500 hover:bg-orange-600 text-white")}>
                    <UserCheck className="h-4 w-4 mr-2" /> C. Final
                  </Button>
                </div>
                {docInfo.text && (
                  <p className={cn("text-[10px] font-black uppercase pl-1", docInfo.isError ? "text-destructive" : "text-indigo-600")}>
                    {docInfo.text}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Cliente / Razón Social</Label>
                <Input 
                  value={clientData.name} 
                  placeholder="Nombre del cliente"
                  onChange={e => { setClientData({...clientData, name: e.target.value}); setIsDirty(true); }} 
                  className="bg-slate-50 border-slate-200 h-11 focus:bg-white transition-colors" 
                  disabled={isConsumidorFinal} 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Email</Label>
                <Input 
                  value={clientData.email} 
                  placeholder="correo@ejemplo.com"
                  onChange={e => { setClientData({...clientData, email: e.target.value}); setIsDirty(true); }} 
                  className="bg-slate-50 border-slate-200 h-11 focus:bg-white transition-colors" 
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Teléfono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    className="pl-10 bg-slate-50 border-slate-200 h-11 focus:bg-white transition-colors" 
                    value={clientData.phone} 
                    placeholder="099XXXXXXX"
                    onChange={e => { setClientData({...clientData, phone: e.target.value}); setIsDirty(true); }} 
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700">Dirección</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    className="bg-slate-50 border-slate-200 h-11 pl-10 focus:bg-white transition-colors" 
                    value={clientData.address} 
                    placeholder="Ej: Av. Principal 123"
                    onChange={e => { setClientData({...clientData, address: e.target.value}); setIsDirty(true); }} 
                    disabled={isConsumidorFinal}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border-none shadow-xl bg-white p-8">
            <Label className="font-bold text-slate-700 uppercase text-[10px]">Observaciones / Términos:</Label>
            <Textarea 
              placeholder="Añada validez de la oferta, tiempos de entrega, etc." 
              value={observations} 
              onChange={(e) => { setObservations(e.target.value); setIsDirty(true); }} 
              className="bg-slate-50 border-slate-200 rounded-xl min-h-[100px] mt-2"
            />
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="rounded-2xl border-none shadow-sm bg-white p-8 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Emisión</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Fecha de Emisión</Label>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start bg-slate-50 border-slate-200 h-11">
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                      {format(date, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={d => { if (d) { setDate(d); setIsCalendarOpen(false); setIsDirty(true); } }} locale={es} /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Forma de Pago</Label>
                <Select value={clientData.paymentMethod} onValueChange={(v) => { setClientData({...clientData, paymentMethod: v}); setIsDirty(true); }}>
                  <SelectTrigger className="bg-slate-50 border-slate-200 h-11 focus:bg-white transition-colors"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.code} value={m.code}>{m.code} - {m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clientData.paymentMethod === "20" && (
                  <div className="space-y-2 md:col-span-2 animate-in slide-in-from-top-2 duration-300">
                    <Label className="font-bold text-[10px] uppercase text-indigo-600 tracking-widest">No. Transferencia / Comprobante</Label>
                    <Input 
                      placeholder="Referencia bancaria" 
                      value={clientData.transferNumber} 
                      onChange={(e) => { setClientData({...clientData, transferNumber: e.target.value}); setIsDirty(true); }} 
                      className="bg-primary/5 border-primary/20 h-11 font-bold mt-1" 
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="col-span-full">
          <Card className="rounded-2xl border-none shadow-xl bg-white p-8">
            <h3 className="text-xl font-bold mb-6 border-b pb-4 text-slate-800">Detalle de Proforma</h3>
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Producto</Label>
                    <Popover open={openPopoverId === (item.id || idx)} onOpenChange={open => setOpenPopoverId(open ? (item.id || idx) : null)}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start h-11 px-3 bg-white font-medium border-slate-100 text-slate-700">
                          {item.description || "Escoger del catálogo..."}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-80" align="start">
                        <div className="p-2 border-b">
                          <Input placeholder="Filtrar productos..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-8" />
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredProducts.map((p: any) => (
                            <button key={p.id} className="w-full p-3 hover:bg-slate-50 flex justify-between items-center border-b last:border-0 text-left" onClick={() => handleSelectProduct(item.id || idx, p)}>
                              <span className="text-sm font-medium">{p.name}</span>
                              <span className="font-bold text-indigo-600">${p.price.toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-full md:w-24 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Cant.</Label>
                    <Input type="number" value={item.quantity} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].quantity = parseFloat(e.target.value) || 0;
                      setItems(newItems);
                      setIsDirty(true);
                    }} className="text-center h-11 bg-white border-slate-200" />
                  </div>
                  <div className="w-full md:w-32 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Precio</Label>
                    <Input type="number" value={item.unitPrice} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].unitPrice = parseFloat(e.target.value) || 0;
                      setItems(newItems);
                      setIsDirty(true);
                    }} className="text-right h-11 bg-white border-slate-200 font-bold" />
                  </div>
                  <div className="flex items-end h-11 pt-6 md:pt-0">
                    <Button variant="ghost" size="icon" onClick={() => { setItems(items.filter((_, i) => i !== idx)); setIsDirty(true); }} className="text-rose-500 h-11 w-11">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" onClick={() => { setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0 }]); setIsDirty(true); }} className="mt-4 text-primary font-bold hover:bg-primary/5"><Plus className="mr-2 h-4 w-4" /> Item</Button>
          </Card>
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <Card className="bg-indigo-600 text-white rounded-3xl p-8 w-full md:w-96 shadow-xl space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm opacity-90"><span>Subtotal (IVA 0%):</span><span className="font-mono">${subtotalBase.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm opacity-90"><span>IVA 0%:</span><span className="font-mono">$0.00</span></div>
            <div className="pt-4 border-t border-white/20"><div className="flex justify-between items-end"><span className="text-xs uppercase font-black">Total a Pagar</span><span className="text-4xl font-black font-mono">${totalWithIVA.toFixed(2)}</span></div></div>
          </div>
          
          <div className="space-y-4 pt-6 border-t border-white/10">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-indigo-100">Abono Inicial:</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300" />
                <Input 
                  type="number" 
                  value={deposit} 
                  onChange={(e) => { setDeposit(Math.max(0, parseFloat(e.target.value) || 0)); setIsDirty(true); }}
                  className="pl-10 h-12 bg-white/10 border-white/20 text-white font-bold text-lg rounded-xl focus:bg-white/20 transition-colors"
                />
              </div>
            </div>
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-indigo-100">Saldo Pendiente:</span>
              <span className="text-2xl font-black text-white font-mono">${balance.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>

      <AlertDialog open={showExitModal} onOpenChange={setShowExitModal}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center">Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Parece que tienes información sin guardar en esta proforma. ¿Deseas guardarla ahora o prefieres descartar los cambios?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="rounded-xl mt-0" onClick={() => router.push('/dashboard/proformas')}>Descartar cambios</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-indigo-600" onClick={() => handleSave()}>Guardar y salir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto h-12 w-12 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
            </div>
            <AlertDialogTitle className="text-center text-rose-700 uppercase font-black">Límite Superado</AlertDialogTitle>
            <AlertDialogDescription className="text-center font-bold">
              Las proformas a "Consumidor Final" no pueden exceder los $50.00. Por favor, identifique al cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction className="rounded-xl bg-rose-600 px-10 font-bold" onClick={() => setShowLimitModal(false)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
