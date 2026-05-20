"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Hash,
  UserCheck,
  MapPin,
  Phone,
  FileWarning,
  Info,
  UserPlus,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { useFirestore, useCollection } from "@/firebase";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, updateDoc, doc, where, getDocs, increment } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { generateBillingPDF, getBillingPDFBase64 } from "@/lib/pdf-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
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

export default function NewSalesNotePage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save' | 'pdf' | 'mail' | 'lookup' | 'save_customer' | null>(null);
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(false);
  const [noteNumber, setNoteNumber] = useState("002-001-000000001");
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<number>(0);
  
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
    const q = query(collection(db, "salesNotes"), orderBy("noteNumber", "desc"), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const lastDoc = snapshot.docs[0].data();
        const lastNum = lastDoc.noteNumber || "002-001-000000000";
        const parts = lastNum.split("-");
        if (parts.length === 3) {
          const sequence = parseInt(parts[2]) + 1;
          setNoteNumber(`002-001-${sequence.toString().padStart(9, '0')}`);
        }
      } else {
        setNoteNumber("002-001-000000001");
      }
    });
    return () => unsubscribe();
  }, [db]);

  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    return availableProducts.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [availableProducts, productSearch]);

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
    if (!db || !clientData.ruc) return;
    if (clientData.ruc.length !== 10 && clientData.ruc.length !== 13) {
      toast({ title: "Identificación inválida", description: "Mínimo 10 dígitos.", variant: "destructive" });
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
    if (!db || !clientData.ruc || !clientData.name) {
      toast({ title: "Datos incompletos", variant: "destructive" });
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

  const handleSave = async (customStatus?: string) => {
    if (!db) return null;
    if (!clientData.name || (!isConsumidorFinal && clientData.ruc.length < 10)) { 
      toast({ title: "Datos incompletos", description: "Verifique la identificación y nombre del cliente.", variant: "destructive" }); 
      return null; 
    }

    setLoadingAction('save');
    try {
      const noteData: any = {
        noteNumber,
        clientData: { ...clientData },
        items: items.filter(i => i.description.trim() !== ""),
        total: totalWithIVA,
        deposit: deposit,
        balance: balance,
        observations,
        status: customStatus || "Pendiente",
        date: date.toISOString(),
        updatedAt: serverTimestamp(),
        createdBy: localStorage.getItem('amec_user_name') || 'Vendedor'
      };

      let currentId = savedDocId;
      if (savedDocId) {
        await updateDoc(doc(db, "salesNotes", savedDocId), noteData);
      } else {
        noteData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, "salesNotes"), noteData);
        currentId = docRef.id;
        setSavedDocId(currentId);

        const batchUpdates = [];
        for (const item of noteData.items) {
          if (item.productId) {
            batchUpdates.push(updateDoc(doc(db, "products", item.productId), {
              stock: increment(-item.quantity)
            }));
          }
        }
        if (batchUpdates.length > 0) await Promise.all(batchUpdates);
      }
      
      toast({ title: "Nota guardada" });
      if (!customStatus) router.push('/dashboard/sales-notes');
      return currentId;
    } catch (e) { 
      toast({ title: "Error", variant: "destructive" }); 
      return null; 
    } finally { 
      setLoadingAction(null); 
    }
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
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: noteNumber,
        observations,
        color: [41, 136, 163] 
      });
      toast({ title: "PDF Generado" });
    } finally { setLoadingAction(null); }
  };

  const handleSendEmail = async () => {
    if (!clientData.email) return toast({ title: "Email requerido", variant: "destructive" });
    setLoadingAction('mail');
    try {
      const base64 = getBillingPDFBase64({
        title: "Nota de Venta",
        client: clientData,
        items: items.filter(i => i.description.trim() !== ""),
        subtotal: subtotalBase,
        iva: ivaCalculated,
        total: totalWithIVA,
        deposit,
        balance,
        date: format(date, "dd/MM/yyyy"),
        docNumber: noteNumber,
        observations,
        color: [41, 136, 163]
      });

      const res = await sendBillingEmail({
        to: clientData.email,
        subject: `Nota de Venta AMEC - #${noteNumber}`,
        clientName: clientData.name,
        docType: "Nota de Venta",
        total: totalWithIVA,
        docNumber: noteNumber,
        pdfBase64: base64,
        observations: observations
      });

      if (res.success) toast({ title: "¡Nota enviada con éxito!" });
      else toast({ title: "Error de envío", description: res.error, variant: "destructive" });
    } finally { setLoadingAction(null); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in duration-700 p-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sticky top-0 z-20 bg-background/95 backdrop-blur-lg py-4 border-b rounded-xl px-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-black">Nueva Nota de Venta</h1>
            <Badge variant="outline" className="mt-1 bg-[#2988a3]/10 text-[#2988a3] border-[#2988a3]/20">
              <Hash className="h-3.5 w-3.5 mr-1" /> {noteNumber}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSendEmail} disabled={loadingAction !== null}>
            {loadingAction === 'mail' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />} Email
          </Button>
          <Button variant="outline" onClick={handleGeneratePDF} disabled={loadingAction !== null}>
            {loadingAction === 'pdf' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <FileDown className="mr-2 h-4 w-4" />} PDF
          </Button>
          <Button onClick={() => handleSave()} disabled={loadingAction !== null} className="bg-[#2988a3] hover:bg-[#1f6a80]">
            {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-sm bg-white rounded-xl p-8 space-y-8">
            <div className="flex items-center justify-between border-b pb-4">
              <h2 className="text-xl font-bold text-slate-800">Información del Receptor</h2>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-[10px] font-black uppercase"
                  onClick={handleLookupCustomer}
                  disabled={loadingAction === 'lookup' || !clientData.ruc}
                >
                  {loadingAction === 'lookup' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Buscar
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-[10px] font-black uppercase text-[#2988a3] hover:text-[#1f6a80]"
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
                  <Input placeholder="Identificación" value={clientData.ruc} maxLength={13} onChange={(e) => setClientData({...clientData, ruc: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
                  <Button variant={isConsumidorFinal ? "default" : "outline"} className={cn("h-11 px-3 text-[10px] font-black uppercase", isConsumidorFinal && "bg-[#2988a3] text-white")} onClick={handleConsumidorFinal}><UserCheck className="h-3 w-3 mr-1" /> C. Final</Button>
                </div>
                {docInfo.text && <p className={cn("text-[10px] font-black uppercase pl-1", docInfo.isError ? "text-destructive" : "text-[#2988a3]")}>{docInfo.text}</p>}
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700 uppercase text-[10px]">Nombre:</Label>
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
            <Textarea placeholder="Ej: Entrega inmediata, pedido especial..." value={observations} onChange={(e) => setObservations(e.target.value)} className="bg-slate-50 border-slate-200 rounded-xl min-h-[100px]" />
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
              </div>
            </div>
          </Card>
        </div>

        <div className="col-span-full">
          <Card className="border-none shadow-xl bg-white rounded-3xl p-8">
            <h3 className="text-xl font-bold mb-6 border-b pb-4">Detalle de Productos</h3>
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={item.id} className="p-6 bg-slate-50/50 rounded-2xl border flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Producto</Label>
                    <Popover open={openPopoverId === item.id} onOpenChange={(open) => setOpenPopoverId(open ? item.id : null)}>
                      <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-11 bg-white">{item.description || "Buscar..."}</Button></PopoverTrigger>
                      <PopoverContent className="p-0 w-[450px]">
                        <div className="p-2"><Input placeholder="Filtrar..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} /></div>
                        <div className="max-h-[250px] overflow-y-auto">
                          {filteredProducts.map((p: any) => (
                            <button key={p.id} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between border-b items-center" onClick={() => { 
                              if (p.stock !== undefined && p.stock <= 0) {
                                toast({ title: "Producto Agotado", description: `El producto ${p.name} no tiene stock disponible.`, variant: "destructive" });
                                return;
                              }
                              const newQty = (p.stock !== undefined && item.quantity > p.stock) ? p.stock : item.quantity;
                              if (newQty < item.quantity) {
                                 toast({ title: "Stock Insuficiente", description: `Se ajustó la cantidad a ${newQty} unidades.`, variant: "destructive" });
                              }
                              setItems(items.map(i => i.id === item.id ? { ...i, description: p.name, unitPrice: p.price, productId: p.id, maxStock: p.stock !== undefined ? p.stock : null, quantity: newQty } : i)); 
                              setOpenPopoverId(null); 
                            }}>
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
                        toast({ title: "Stock Insuficiente", description: `Solo hay ${item.maxStock} unidades en inventario.`, variant: "destructive" });
                        val = item.maxStock;
                      }
                      setItems(items.map(i => i.id === item.id ? { ...i, quantity: val } : i));
                    }} className="h-11 text-center font-bold bg-white" />
                  </div>
                  <div className="w-full md:w-32 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">P. Final</Label>
                    <Input type="number" value={item.unitPrice} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, unitPrice: parseFloat(e.target.value) || 0 } : i))} className="h-11 text-right font-black text-[#2988a3] bg-white" />
                  </div>
                  <div className="flex items-end h-11 pt-6 md:pt-0">
                    <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-rose-500 h-11 w-11">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0, productId: null, maxStock: null }])} variant="outline" className="mt-6 border-dashed border-2 w-full h-14 font-bold text-[#2988a3]"><Plus className="mr-2 h-4 w-4" /> Añadir Item</Button>
          </Card>
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <Card className="bg-[#2988a3] text-white rounded-3xl p-8 w-full md:w-96 shadow-xl space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm opacity-90"><span>Subtotal:</span><span className="font-mono">${subtotalBase.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm opacity-90"><span>IVA (0%):</span><span className="font-mono">${ivaCalculated.toFixed(2)}</span></div>
            <div className="pt-3 border-t border-white/20 flex justify-between items-end">
              <span className="text-xs uppercase font-black">Total</span>
              <span className="text-4xl font-black font-mono">${totalWithIVA.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-white/10">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-blue-100">Monto Recibido (Abono):</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200" />
                <Input 
                  type="number" 
                  value={deposit} 
                  onChange={(e) => setDeposit(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-10 h-12 bg-white/10 border-white/20 text-white font-bold text-lg rounded-xl focus:bg-white/20 transition-colors"
                />
              </div>
            </div>
            <div className="p-4 bg-white/10 rounded-2xl border border-white/10 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-blue-100">Saldo por Cobrar:</span>
              <span className="text-2xl font-black text-white font-mono">${balance.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
