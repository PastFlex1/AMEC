"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  Loader2,
  Search,
  Calendar as CalendarIcon,
  Mail,
  FileDown,
  AlertTriangle,
  UserCheck,
  Hash,
  Info,
  Phone,
  MapPin,
  FileWarning,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useFirestore, useCollection, useDoc } from "@/firebase";
import { collection, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generateBillingPDF, getBillingPDFBase64, generateThermalPDF } from "@/lib/pdf-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useCedulaSearch } from "@/hooks/useCedulaSearch";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function EditSalesNotePage() {
  const router = useRouter();
  const params = useParams();
  const salesNoteId = params.salesNoteId as string;
  const { toast } = useToast();
  const db = useFirestore();
  const { isSearchingCedula, fetchCedulaData } = useCedulaSearch();

  const noteRef = useMemo(() => (db ? doc(db, "salesNotes", salesNoteId) : null), [db, salesNoteId]);
  const { data: existingNote, loading: loadingDoc } = useDoc<any>(noteRef);

  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'mail' | 'ticket' | null>(null);
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [observations, setObservations] = useState("");
  const [noteNumber, setNoteNumber] = useState("");

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: availableProducts } = useCollection(productsRef);
  
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

  useEffect(() => {
    if (existingNote) {
      setNoteNumber(existingNote.noteNumber || "");
      const cd = existingNote.clientData || {};
      setClientData({ 
        ruc: cd.ruc || existingNote.ruc || "", 
        name: cd.name || existingNote.customerName || "", 
        address: cd.address || "", 
        email: cd.email || "", 
        phone: cd.phone || "",
        paymentMethod: cd.paymentMethod || "01", 
        transferNumber: cd.transferNumber || "" 
      });
      setItems(existingNote.items || []);
      setObservations(existingNote.observations || "");
      if (existingNote.date) setDate(new Date(existingNote.date));
      if ((cd.ruc || existingNote.ruc) === "9999999999999") setIsConsumidorFinal(true);
    }
  }, [existingNote]);

  const totalWithIVA = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const subtotalBase = totalWithIVA;
  const ivaCalculated = 0;

  const docInfo = useMemo(() => {
    if (isConsumidorFinal) return { text: "Consumidor Final activo", isError: false };
    const val = clientData.ruc;
    if (val.length === 0) return { text: "", isError: false };
    if (val.length === 10) return { text: "Es Cédula", isError: false };
    if (val.length === 13) return { text: "Es RUC", isError: false };
    return { text: "Identificación inválida", isError: true };
  }, [clientData.ruc, isConsumidorFinal]);

  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    return availableProducts.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [availableProducts, productSearch]);

  const handleSelectProduct = (itemId: string, product: any) => {
    if (product.stock !== undefined && product.stock <= 0) {
      toast({ title: "Producto Agotado", description: `El producto ${product.name} está agotado. Llene el stock desde Ingreso de Mercadería o en el Inventario.`, variant: "destructive" });
      return;
    }
    const currentItem = items.find(i => i.id === itemId);
    const currentQty = currentItem?.quantity || 1;
    const newQty = (product.stock !== undefined && currentQty > product.stock) ? product.stock : currentQty;
    if (newQty < currentQty) {
       toast({ title: "Stock Insuficiente", description: `Se ajustó a ${newQty} unidades. Si necesita más, llene el stock desde Ingreso de Mercadería.`, variant: "destructive" });
    }
    setItems(items.map(item => item.id === itemId ? { ...item, description: product.name, unitPrice: product.price, productId: product.id, maxStock: product.stock !== undefined ? product.stock : null, quantity: newQty } : item));
    setProductSearch("");
    setOpenPopoverId(null);
  };

  const handleSave = async (customStatus?: string) => {
    if (!db || !noteRef) return;
    setLoadingAction('save');
    try {
      await updateDoc(noteRef, {
        clientData: { ...clientData },
        items: items.filter(i => i.description.trim() !== ""),
        total: totalWithIVA,
        observations,
        status: customStatus || existingNote?.status || "Pendiente",
        date: date.toISOString(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Nota actualizada" });
      if (!customStatus) router.push('/dashboard/sales-notes');
    } catch (err) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  const handleGeneratePDF = () => {
    setLoadingAction('pdf');
    try {
      generateBillingPDF({
        title: "Nota de Venta",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        date: format(date, "dd/MM/yyyy"),
        docNumber: noteNumber,
        observations,
        color: [41, 136, 163] 
      });
      toast({ title: "PDF Generado" });
    } finally { setLoadingAction(null); }
  };

  const handlePrintTicket = () => {
    setLoadingAction('ticket');
    try {
      generateThermalPDF({
        title: "Nota de Venta",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        date: format(date, "dd/MM/yyyy"),
        docNumber: noteNumber,
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
      const pdfBase64 = getBillingPDFBase64({
        title: "Nota de Venta",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        date: format(date, "dd/MM/yyyy"),
        docNumber: noteNumber,
        observations,
        color: [41, 136, 163] 
      });

      const res = await sendBillingEmail({
        to: clientData.email,
        subject: `Nota de Venta Apm Inox - #${noteNumber}`,
        clientName: clientData.name,
        docType: "Nota de Venta",
        total: totalWithIVA,
        docNumber: noteNumber,
        pdfBase64,
        observations: observations
      });

      if (res.success) toast({ title: "¡Enviado!" });
      else toast({ title: "Error", description: res.error, variant: "destructive" });
    } finally { setLoadingAction(null); }
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
  };

  if (loadingDoc) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in duration-700 p-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sticky top-0 z-20 bg-background/95 backdrop-blur-lg py-4 border-b rounded-xl px-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-black">Editar Nota de Venta</h1>
            <Badge variant="outline" className="mt-1 bg-slate-100"><Hash className="h-3 w-3 mr-1" /> {noteNumber}</Badge>
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
          <Button onClick={() => handleSave()} className="bg-[#2988a3] hover:bg-[#1f6a80]">
            {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-sm bg-white rounded-xl p-8 space-y-8">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Información del Receptor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">R.U.C / C.I.</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Identificación" 
                    value={clientData.ruc} 
                    maxLength={13} 
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setClientData({...clientData, ruc: val});
                      if (val.length === 10) fetchCedulaData(val, (data) => setClientData(prev => ({
                        ...prev, 
                        name: data.name || prev.name,
                        address: data.address || prev.address,
                        email: data.email || prev.email,
                        phone: data.phone || prev.phone
                      })));
                    }}
                    className="bg-slate-50 h-11" 
                  />
                  <Button variant={isConsumidorFinal ? "default" : "outline"} className={cn("h-11 px-3 text-[10px] font-black uppercase", isConsumidorFinal && "bg-[#2988a3] text-white")} onClick={handleConsumidorFinal}><UserCheck className="h-3 w-3 mr-1" /> C. Final</Button>
                </div>
                {docInfo.text && <p className={cn("text-[10px] font-black uppercase pl-1", docInfo.isError ? "text-destructive" : "text-[#2988a3]")}>{docInfo.text}</p>}
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px] flex items-center gap-2">
                  Nombre:
                  {isSearchingCedula && <Loader2 className="h-3 w-3 animate-spin text-[#2988a3]" />}
                </Label>
                <Input placeholder="Nombre completo" value={clientData.name} onChange={(e) => setClientData({...clientData, name: e.target.value})} className="bg-slate-50 h-11" disabled={isConsumidorFinal} />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Email:</Label>
                <Input type="email" placeholder="correo@ejemplo.com" value={clientData.email} onChange={(e) => setClientData({...clientData, email: e.target.value})} className="bg-slate-50 h-11" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Teléfono:</Label>
                <Input placeholder="0998765432" value={clientData.phone} onChange={(e) => setClientData({...clientData, phone: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Dirección:</Label>
                <Input placeholder="Calle, Ciudad" value={clientData.address} onChange={(e) => setClientData({...clientData, address: e.target.value})} className="bg-slate-50 h-11" disabled={isConsumidorFinal} />
              </div>
            </div>
          </Card>

          <Card className="border-none shadow-sm bg-white rounded-xl p-8 space-y-4">
            <Label className="font-bold text-slate-700 uppercase text-[10px]">Observaciones del Registro:</Label>
            <Textarea placeholder="Ej: Notas de entrega, aclaraciones..." value={observations} onChange={(e) => setObservations(e.target.value)} className="bg-slate-50 border-slate-200 rounded-xl min-h-[100px]" />
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="border-none shadow-sm bg-white rounded-xl p-8 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-4">Emisión</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Fecha:</Label>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start bg-slate-50 h-11"><CalendarIcon className="mr-2 h-4 w-4" />{format(date, "dd/MM/yyyy")}</Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setIsCalendarOpen(false); } }} locale={es} /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Forma de Pago:</Label>
                <Select value={clientData.paymentMethod} onValueChange={(v) => setClientData({...clientData, paymentMethod: v})}>
                  <SelectTrigger className="bg-slate-50 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => (<SelectItem key={m.code} value={m.code}>{m.code} - {m.label}</SelectItem>))}</SelectContent>
                </Select>
                {clientData.paymentMethod === "20" && (
                  <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                    <Label className="font-bold text-primary uppercase text-[10px]">No. Transferencia / Referencia:</Label>
                    <Input 
                      placeholder="Referencia bancaria" 
                      value={clientData.transferNumber} 
                      onChange={(e) => setClientData({...clientData, transferNumber: e.target.value})} 
                      className="bg-primary/5 border-primary/20 h-11 font-bold mt-1" 
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="col-span-full">
          <Card className="border-none shadow-xl bg-white rounded-3xl p-8">
            <h3 className="text-xl font-bold mb-6 border-b pb-4">Detalle de Productos</h3>
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-6 bg-slate-50/50 rounded-2xl border flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Producto</Label>
                    <Popover open={openPopoverId === (item.id || idx)} onOpenChange={(open) => setOpenPopoverId(open ? (item.id || idx) : null)}>
                      <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-11 bg-white">{item.description || "Buscar..."}</Button></PopoverTrigger>
                      <PopoverContent className="p-0 w-[450px]">
                        <div className="p-2"><Input placeholder="Filtrar..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} /></div>
                        <div className="max-h-[250px] overflow-y-auto">
                          {filteredProducts.map((p: any) => (
                            <button key={p.id} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between border-b" onClick={() => { handleSelectProduct(item.id || idx, p); }}>
                              <span className="font-bold">{p.name}</span>
                              <div className="flex gap-2 items-center">
                                {p.stock !== undefined && <span className={cn("text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest", p.stock <= 10 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>Stock: {p.stock}</span>}
                                <span className="text-[#2988a3] font-black">${p.price.toFixed(2)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-full md:w-24 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Cant.</Label>
                    <Input type="number" value={item.quantity} onChange={(e) => {
                      let val = parseFloat(e.target.value) || 0;
                      if (item.maxStock !== null && val > item.maxStock) {
                        toast({ title: "Stock Insuficiente", description: `Solo hay ${item.maxStock} unidades. Llene el stock desde Ingreso de Mercadería.`, variant: "destructive" });
                        val = item.maxStock;
                      }
                      const newItems = [...items];
                      newItems[idx].quantity = val;
                      setItems(newItems);
                    }} className="h-11 text-center font-bold bg-white" />
                  </div>
                  <div className="w-full md:w-32 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">P. Final</Label>
                    <Input type="number" value={item.unitPrice} onChange={(e) => {
                      const newItems = [...items];
                      newItems[idx].unitPrice = parseFloat(e.target.value) || 0;
                      setItems(newItems);
                    }} className="h-11 text-right font-black text-[#2988a3] bg-white" />
                  </div>
                  <div className="flex items-end h-11 pt-6 md:pt-0">
                    <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-rose-500 h-11 w-11">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0 }])} variant="outline" className="mt-6 border-dashed border-2 w-full h-14 font-bold text-[#2988a3]"><Plus className="mr-2 h-4 w-4" /> Añadir Item</Button>
          </Card>
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <Card className="bg-[#2988a3] text-white rounded-3xl p-8 w-full md:w-96 shadow-xl">
          <div className="flex justify-between text-sm opacity-90"><span>Subtotal (0%):</span><span className="font-mono">${subtotalBase.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm opacity-90"><span>IVA (0%):</span><span className="font-mono">${ivaCalculated.toFixed(2)}</span></div>
          <div className="pt-4 border-t border-white/20"><div className="flex justify-between items-end"><span className="text-xs uppercase font-black">Total a Cobrar</span><span className="text-4xl font-black font-mono">${totalWithIVA.toFixed(2)}</span></div></div>
        </Card>
      </div>
    </div>
  );
}
