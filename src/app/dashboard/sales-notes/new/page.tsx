"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, Save, Loader2, Calendar as CalendarIcon, Mail, FileDown, Hash, DollarSign, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useFirestore, useCollection } from "@/firebase";
import { collection } from "firebase/firestore";

import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { generateBillingPDF, getBillingPDFBase64, generateThermalPDF } from "@/lib/pdf-service";
import { sendBillingEmail } from "@/app/actions/email-actions";

import { useSalesNote } from "@/hooks/useSalesNote";
import { CustomerInfoForm } from "@/components/sales/CustomerInfoForm";
import { ProductListForm } from "@/components/sales/ProductListForm";

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

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: availableProducts } = useCollection(productsRef);

  const {
    date, setDate,
    loadingAction, setLoadingAction,
    isConsumidorFinal, handleConsumidorFinal,
    noteNumber,
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
  } = useSalesNote(db);

  const handleSave = async (customStatus?: string) => {
    if (!salesService) return null;
    if (!clientData.name || (!isConsumidorFinal && clientData.ruc.length < 10)) { 
      toast({ title: "Datos incompletos", description: "Verifique la identificación y nombre del cliente.", variant: "destructive" }); 
      return null; 
    }

    setLoadingAction('save');
    try {
      const sellerName = localStorage.getItem('amec_user_name') || 'Vendedor';
      const dateString = format(date, "yyyy-MM-dd");
      
      const note = {
        noteNumber,
        clientData,
        items: items.filter(i => i.description.trim() !== ""),
        total: totalWithIVA,
        deposit,
        balance,
        observations,
        status: customStatus || "Pendiente",
        date: date.toISOString(),
        createdBy: sellerName
      };

      await salesService.processSalesNote(note, dateString, sellerName);

      toast({ title: "Nota guardada" });
      if (!customStatus) router.push('/dashboard/sales-notes');
      return true;
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
        deposit,
        balance,
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
        subject: `Nota de Venta Apm Inox - #${noteNumber}`,
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
          <Button variant="outline" onClick={handlePrintTicket} disabled={loadingAction !== null}>
            {loadingAction === 'ticket' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />} Ticket
          </Button>
          <Button onClick={() => handleSave()} disabled={loadingAction !== null} className="bg-[#2988a3] hover:bg-[#1f6a80]">
            {loadingAction === 'save' ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-none shadow-sm bg-white rounded-xl p-8 space-y-8">
            <CustomerInfoForm
              clientData={clientData}
              setClientData={setClientData}
              isConsumidorFinal={isConsumidorFinal}
              handleConsumidorFinal={handleConsumidorFinal}
              loadingAction={loadingAction}
              handleLookupCustomer={handleLookupCustomer}
              handleSaveCustomerToDirectory={handleSaveCustomerToDirectory}
              isSearchingCedula={isSearchingCedula}
              fetchCedulaData={fetchCedulaData}
              docInfo={docInfo}
            />
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
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start bg-slate-50 h-11"><CalendarIcon className="mr-2 h-4 w-4" />{format(date, "dd/MM/yyyy")}</Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => { if (d) setDate(d) }} locale={es} /></PopoverContent>
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
          </Card>
        </div>

        <div className="col-span-full">
          <Card className="border-none shadow-xl bg-white rounded-3xl p-8">
            <ProductListForm 
              items={items} 
              setItems={setItems} 
              availableProducts={availableProducts || []} 
            />
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
