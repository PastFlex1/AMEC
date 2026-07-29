"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Calendar, 
  FileText,
  Download,
  Eye,
  Loader2,
  Trash2,
  Hash,
  Edit2,
  Code,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Ban,
  ShieldAlert,
  CreditCard,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, deleteDoc, query, orderBy, updateDoc, serverTimestamp, addDoc, getDoc, limit } from "firebase/firestore";
import { syncDailyCashClosing } from "@/lib/cash-register-service";
import { DEFAULT_TAX_CONFIG, TaxConfig } from "@/lib/config-helper";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { generateBillingPDF, getBillingPDFBase64, generateThermalPDF } from "@/lib/pdf-service";
import { generateInvoiceXML, generateCreditNoteXML, downloadXML } from "@/lib/sri-xml-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { emitirFacturaAction } from "@/app/actions/sri-actions";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function InvoicesPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(DEFAULT_TAX_CONFIG);
  const [searchTerm, setSearchTerm] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "taxConfig", "current")).then((snap) => {
      if (snap.exists()) {
        setTaxConfig(snap.data() as TaxConfig);
      }
    }).catch((err) => console.error("Error al cargar config de emisor:", err));
  }, [db]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setUserRole(localStorage.getItem('amec_user_role') || 'sales');
    setUserName(localStorage.getItem('amec_user_name') || '');
  }, []);

  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [invoiceToAnnul, setInvoiceToAnnul] = useState<any | null>(null);
  const [loadingAnnul, setLoadingAnnul] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [invoiceForPayment, setInvoiceForPayment] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("01");
  const [paymentTransferNumber, setPaymentTransferNumber] = useState("");

  const invoicesRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "invoices"), orderBy("invoiceNumber", "desc"), limit(100));
  }, [db]);
  
  const { data: invoices, loading } = useCollection(invoicesRef);

  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      if (typeof dateVal === 'string') {
        return format(parseISO(dateVal), "dd/MM/yyyy", { locale: es });
      }
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(d, "dd/MM/yyyy", { locale: es });
    } catch (e) {
      return "N/A";
    }
  };

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv: any) => {
      if (userRole === 'sales' && inv.createdBy !== userName) return false;

      const customer = inv.clientData?.name || inv.customerName || "Consumidor Final";
      const num = inv.invoiceNumber || "";
      const ruc = inv.clientData?.ruc || inv.customerRuc || "";
      
      return customer.toLowerCase().includes(searchTerm.toLowerCase()) || 
             num.toLowerCase().includes(searchTerm.toLowerCase()) ||
             ruc.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [invoices, searchTerm, userRole, userName]);

  const paginatedData = useMemo(() => {
    if (!filtered) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil((filtered?.length || 0) / itemsPerPage);

  const stats = useMemo(() => {
    if (!filtered) return { total: 0, count: 0, authorized: 0 };
    return filtered.reduce((acc, curr: any) => {
      if (curr.status !== 'Anulada') {
        acc.total += curr.total || 0;
        acc.count += 1;
        if (curr.status === 'Autorizado') acc.authorized += 1;
      }
      return acc;
    }, { total: 0, count: 0, authorized: 0 });
  }, [filtered]);

  const getStatusStyle = (status: string) => {
    const s = (status || 'Pendiente').toLowerCase();
    switch (s) {
      case 'autorizado': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'anulada': return 'bg-slate-100 text-slate-400 border-slate-200 line-through';
      case 'rechazado': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'pendiente': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'enviado': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const handleDownloadRIDE = (inv: any) => {
    try {
      generateBillingPDF({
        title: "Factura",
        client: {
          name: inv.clientData?.name || inv.customerName || "Consumidor Final",
          ruc: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          address: inv.clientData?.address || "S/N",
          email: inv.clientData?.email || "N/A",
          paymentMethod: inv.clientData?.paymentMethod || "01",
          transferNumber: inv.clientData?.transferNumber
        },
        items: inv.items || [],
        total: inv.total || 0,
        subtotal: inv.subtotalBase !== undefined ? inv.subtotalBase : (inv.total || 0),
        iva: inv.ivaCalculated !== undefined ? inv.ivaCalculated : 0,
        subtotal15: inv.subtotal15 !== undefined ? inv.subtotal15 : 0,
        subtotal0: inv.subtotal0 !== undefined ? inv.subtotal0 : (inv.total || 0),
        subtotalNoObjeto: inv.subtotalNoObjeto !== undefined ? inv.subtotalNoObjeto : 0,
        subtotalExento: inv.subtotalExento !== undefined ? inv.subtotalExento : 0,
        iva15: inv.ivaCalculated !== undefined ? inv.ivaCalculated : 0,
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
        date: formatDocDate(inv.date),
        docNumber: inv.invoiceNumber,
        accessKey: inv.claveAcceso,
        status: inv.status,
        time: inv.authDate,
        observations: inv.observations
      });
      toast({ title: "RIDE Generado" });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el RIDE.", variant: "destructive" });
    }
  };

  const handlePrintTicket = (inv: any) => {
    try {
      generateThermalPDF({
        title: "Factura",
        client: {
          name: inv.clientData?.name || inv.customerName || "Consumidor Final",
          ruc: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          address: inv.clientData?.address || "S/N",
          email: inv.clientData?.email || "N/A",
          paymentMethod: inv.clientData?.paymentMethod || "01",
          transferNumber: inv.clientData?.transferNumber
        },
        items: inv.items || [],
        total: inv.total || 0,
        subtotal: inv.subtotalBase !== undefined ? inv.subtotalBase : (inv.total || 0),
        iva: inv.ivaCalculated !== undefined ? inv.ivaCalculated : 0,
        subtotal15: inv.subtotal15 !== undefined ? inv.subtotal15 : 0,
        subtotal0: inv.subtotal0 !== undefined ? inv.subtotal0 : (inv.total || 0),
        subtotalNoObjeto: inv.subtotalNoObjeto !== undefined ? inv.subtotalNoObjeto : 0,
        subtotalExento: inv.subtotalExento !== undefined ? inv.subtotalExento : 0,
        iva15: inv.ivaCalculated !== undefined ? inv.ivaCalculated : 0,
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
        date: formatDocDate(inv.date),
        docNumber: inv.invoiceNumber,
        accessKey: inv.claveAcceso,
        status: inv.status,
        time: inv.authDate,
        observations: inv.observations
      });
      toast({ title: "Ticket Generado" });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el ticket.", variant: "destructive" });
    }
  };

  const handleDownloadXML = (inv: any) => {
    try {
      if (inv.status === 'Autorizado' && inv.authorizedXml) {
        downloadXML(inv.authorizedXml, `Factura_Autorizada_${inv.invoiceNumber}.xml`);
        toast({ title: "XML Oficial Descargado" });
        return;
      }

      const xml = generateInvoiceXML({
        rucEmisor: taxConfig.ruc,
        razonSocialEmisor: taxConfig.razonSocial,
        dirMatriz: taxConfig.dirMatriz,
        estab: taxConfig.estab,
        ptoEmi: taxConfig.ptoEmi,
        secuencial: inv.invoiceNumber.split("-")[2],
        fechaEmision: formatDocDate(inv.date),
        cliente: {
          razonSocial: inv.clientData?.name || inv.customerName || "CONSUMIDOR FINAL",
          identificacion: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          direccion: inv.clientData?.address || "S/N",
          email: inv.clientData?.email
        },
        items: (inv.items || []).map((item: any) => ({
          descripcion: item.description,
          cantidad: item.quantity,
          precioUnitario: item.unitPrice
        })),
        formaPago: inv.clientData?.paymentMethod || "01"
      });
      downloadXML(xml, `Factura_${inv.invoiceNumber}.xml`);
      toast({ title: "XML Generado" });
    } catch (e) {
      toast({ title: "Error XML", variant: "destructive" });
    }
  };

  const handleResendEmail = async (inv: any) => {
    const clientEmail = inv.clientData?.email;
    if (!clientEmail) {
      toast({ title: "Sin Correo", description: "El cliente no tiene un email configurado.", variant: "destructive" });
      return;
    }

    setSendingEmailId(inv.id);
    try {
      const base64 = getBillingPDFBase64({
        title: "Factura",
        client: {
          name: inv.clientData?.name || inv.customerName || "Consumidor Final",
          ruc: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          address: inv.clientData?.address || "S/N",
          email: clientEmail,
          paymentMethod: inv.clientData?.paymentMethod || "01",
          transferNumber: inv.clientData?.transferNumber
        },
        items: inv.items || [],
        total: inv.total || 0,
        subtotal: inv.total || 0,
        iva: 0,
        date: formatDocDate(inv.date),
        docNumber: inv.invoiceNumber,
        accessKey: inv.claveAcceso,
        status: inv.status,
        time: inv.authDate,
        observations: inv.observations
      });

      const xmlBase64 = inv.authorizedXml ? btoa(unescape(encodeURIComponent(inv.authorizedXml))) : undefined;

      const res = await sendBillingEmail({
        to: clientEmail,
        subject: `Factura AMEC - Comprobante #${inv.invoiceNumber}`,
        clientName: inv.clientData?.name || "Cliente",
        docType: "Factura",
        total: inv.total || 0,
        docNumber: inv.invoiceNumber,
        pdfBase64: base64,
        xmlContent: xmlBase64,
        observations: inv.observations
      });

      if (res.success) {
        toast({ title: "Email Enviado", description: `Comprobante enviado a ${clientEmail}` });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ title: "Error de envío", description: error.message, variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleDelete = () => {
    if (!db || !invoiceToDelete) return;
    deleteDoc(doc(db, "invoices", invoiceToDelete))
      .then(() => {
        toast({ title: "Factura eliminada" });
        setInvoiceToDelete(null);
      })
      .catch(() => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `invoices/${invoiceToDelete}`, operation: 'delete' }));
        setInvoiceToDelete(null);
      });
  };

  const handleAnnul = async () => {
    if (!db || !invoiceToAnnul) return;
    
    setLoadingAnnul(true);
    try {
      const ncXml = generateCreditNoteXML({
        rucEmisor: taxConfig.ruc,
        razonSocialEmisor: taxConfig.razonSocial,
        dirMatriz: taxConfig.dirMatriz,
        estab: taxConfig.estab,
        ptoEmi: taxConfig.ptoEmi,
        secuencial: "999" + invoiceToAnnul.invoiceNumber.split("-")[2].substring(3), 
        fechaEmision: format(new Date(), "dd/MM/yyyy"),
        cliente: {
          razonSocial: invoiceToAnnul.clientData?.name || invoiceToAnnul.customerName,
          identificacion: invoiceToAnnul.clientData?.ruc || invoiceToAnnul.customerRuc
        },
        items: invoiceToAnnul.items,
        formaPago: invoiceToAnnul.clientData?.paymentMethod || "01",
        tipoComprobante: "04",
        facturaModificada: {
          numero: invoiceToAnnul.invoiceNumber,
          fecha: formatDocDate(invoiceToAnnul.date)
        }
      });

      const res = await emitirFacturaAction(ncXml);
      
      if (!res.success) {
        throw new Error(res.error || "El SRI rechazó la Nota de Crédito de anulación.");
      }

      await updateDoc(doc(db, "invoices", invoiceToAnnul.id), {
        status: "Anulada",
        annulledAt: serverTimestamp(),
        annulledBy: localStorage.getItem('amec_user_name') || 'Admin',
        creditNoteAccessKey: res.claveAcceso,
        creditNoteXml: res.autorizacion
      });

      toast({ 
        title: "Factura Anulada Legalmente", 
        description: "Se ha procesado y autorizado la Nota de Crédito con el SRI." 
      });
      
      const invoiceDate = invoiceToAnnul.date ? (invoiceToAnnul.date.toDate ? invoiceToAnnul.date.toDate() : new Date(invoiceToAnnul.date)) : new Date();
      const dateString = format(invoiceDate, "yyyy-MM-dd");
      const sellerName = invoiceToAnnul.createdBy || userName;
      await syncDailyCashClosing(db, sellerName, dateString);

      setInvoiceToAnnul(null);
    } catch (error: any) {
      toast({ 
        title: "Error en Anulación SRI", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoadingAnnul(false);
    }
  };

  const openPaymentModal = (inv: any) => {
    setInvoiceForPayment(inv);
    setPaymentAmount(inv.balance !== undefined ? inv.balance : 0);
    setSelectedPaymentMethod(inv.clientData?.paymentMethod || "01");
    setPaymentTransferNumber(inv.clientData?.transferNumber || "");
    setPaymentModalOpen(true);
  };

  const handleRegisterPayment = async () => {
    if (!db || !invoiceForPayment) return;
    
    const currentDeposit = invoiceForPayment.deposit || 0;
    const newDeposit = currentDeposit + paymentAmount;
    const newBalance = Math.max(0, invoiceForPayment.total - newDeposit);

    setLoadingPayment(true);
    try {
      await updateDoc(doc(db, "invoices", invoiceForPayment.id), {
        deposit: newDeposit,
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, "payments"), {
        type: "Factura",
        docId: invoiceForPayment.id,
        docNumber: invoiceForPayment.invoiceNumber,
        amount: paymentAmount,
        sellerName: userName,
        clientName: invoiceForPayment.clientData?.name || invoiceForPayment.customerName || "Consumidor Final",
        paymentMethod: selectedPaymentMethod,
        transferNumber: paymentTransferNumber,
        createdAt: serverTimestamp()
      });

      toast({ title: "Pago Registrado", description: "El saldo ha sido actualizado." });
      
      const dateString = format(new Date(), "yyyy-MM-dd");
      await syncDailyCashClosing(db, userName, dateString);

      setPaymentModalOpen(false);
    } catch (error: any) {
      toast({ title: "Error al registrar pago", description: error.message, variant: "destructive" });
    } finally {
      setLoadingPayment(false);
    }
  };

  const openDetails = (inv: any) => {
    setSelectedInvoice(inv);
    setIsDetailsOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900">Facturación Electrónica</h1>
          <p className="text-muted-foreground font-medium">Gestión de comprobantes legales bajo esquema SRI.</p>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 h-12 px-6 rounded-xl font-bold">
          <Link href="/dashboard/invoices/new">
            <Plus className="mr-2 h-5 w-5" />
            Emitir Nueva Factura
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-xl bg-primary text-white rounded-3xl overflow-hidden relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Facturación del Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-white/60 mt-1">{stats.authorized} facturas autorizadas</p>
          </CardContent>
          <div className="absolute right-[-10%] bottom-[-20%] opacity-10">
            <FileText className="h-32 w-32 rotate-12" />
          </div>
        </Card>
        
        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Estado SRI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">Conectado</div>
            <p className="text-xs text-muted-foreground mt-1">Ambiente de Producción</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <Hash className="h-4 w-4" /> Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.count}</div>
            <p className="text-xs text-muted-foreground mt-1">Emitidos este periodo</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-slate-50 bg-slate-50/30 p-8">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, RUC o # factura..."
              className="pl-11 h-12 bg-white border-slate-100 rounded-2xl shadow-sm focus:ring-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-50 bg-slate-50/10">
                  <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">No. Factura</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Cliente / Receptor</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Fecha</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Estado SRI</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Estado Pago</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">Monto Total</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((inv: any) => {
                    const isAuthorized = inv.status === 'Autorizado';
                    const isAnnulled = inv.status === 'Anulada';
                    return (
                      <TableRow 
                        key={inv.id} 
                        className={cn(
                          "group transition-all cursor-pointer",
                          isAnnulled ? "bg-slate-50/50 grayscale opacity-60" : "hover:bg-slate-50"
                        )}
                        onClick={() => openDetails(inv)}
                      >
                        <TableCell className="px-8 font-mono text-sm font-bold text-primary">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-black text-slate-900">{inv.clientData?.name || inv.customerName || "Consumidor Final"}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{inv.clientData?.ruc || inv.customerRuc || "9999999999999"}</div>
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDocDate(inv.date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg font-black text-[10px] uppercase tracking-wider px-3 py-1", getStatusStyle(inv.status))}>
                            {inv.status || 'Pendiente'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const balance = inv.balance !== undefined ? inv.balance : 0;
                            const isPaid = balance <= 0 && inv.total > 0;
                            return (
                              <Badge variant="outline" className={cn("rounded-lg font-black text-[10px] uppercase tracking-wider px-3 py-1", isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>
                                {isPaid ? 'Pagado' : 'Pendiente Pago'}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right px-8 font-black text-slate-900 text-lg">
                          ${(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-10 w-10 p-0 rounded-xl hover:bg-white shadow-sm">
                                <MoreHorizontal className="h-5 w-5 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-slate-100">
                              <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 px-3 py-2">Acciones Legales</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => handleDownloadRIDE(inv)} className="rounded-xl cursor-pointer py-3">
                                <Download className="mr-3 h-4 w-4 text-primary" /> Descargar RIDE
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handlePrintTicket(inv)} className="rounded-xl cursor-pointer py-3">
                                <Printer className="mr-3 h-4 w-4 text-primary" /> Imprimir Ticket
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleDownloadXML(inv)} className="rounded-xl cursor-pointer py-3">
                                <Code className="mr-3 h-4 w-4 text-primary" /> Descargar XML
                              </DropdownMenuItem>
                              
                              {(!isAnnulled) && (
                                <DropdownMenuItem onSelect={() => openPaymentModal(inv)} className="rounded-xl cursor-pointer py-3">
                                  <CreditCard className="mr-3 h-4 w-4 text-primary" /> Registrar Pago
                                </DropdownMenuItem>
                              )}
                              
                              {(isAuthorized && !isAnnulled) && (
                                <DropdownMenuItem onSelect={() => handleResendEmail(inv)} className="rounded-xl cursor-pointer py-3">
                                  <Mail className="mr-3 h-4 w-4 text-primary" /> Reenviar Email
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3">
                                <Link href={`/dashboard/invoices/${inv.id}/edit`}>
                                  {isAuthorized || isAnnulled ? (
                                    <><Eye className="mr-3 h-4 w-4 text-primary" /> Ver Comprobante</>
                                  ) : (
                                    <><Edit2 className="mr-3 h-4 w-4 text-primary" /> Editar Datos</>
                                  )}
                                </Link>
                              </DropdownMenuItem>
                              
                              {(userRole === 'admin' && !isAuthorized && !isAnnulled) && (
                                <>
                                  <DropdownMenuSeparator className="my-2" />
                                  <DropdownMenuItem 
                                    className="rounded-xl cursor-pointer py-3 text-destructive hover:bg-rose-50 font-bold" 
                                    onSelect={() => setInvoiceToDelete(inv.id)}
                                  >
                                    <Trash2 className="mr-3 h-4 w-4" /> Eliminar Factura
                                  </DropdownMenuItem>
                                </>
                              )}
                              
                              {(isAuthorized && !isAnnulled) && (
                                <>
                                  <DropdownMenuSeparator className="my-2" />
                                  <DropdownMenuItem 
                                    className="rounded-xl cursor-pointer py-3 text-amber-600 hover:bg-amber-50 font-bold"
                                    onSelect={() => setInvoiceToAnnul(inv)}
                                  >
                                    <Ban className="mr-3 h-4 w-4" /> Anular Factura (NC)
                                  </DropdownMenuItem>
                                </>
                              )}

                              {isAnnulled && (
                                <>
                                  <DropdownMenuSeparator className="my-2" />
                                  <DropdownMenuItem disabled className="opacity-50 grayscale py-3 px-3">
                                    <Lock className="mr-3 h-4 w-4" /> Documento Anulado
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">No se encontraron facturas registradas.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-50 bg-slate-50/30">
              <div className="text-xs text-slate-500 font-medium">
                Mostrando {filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} facturas
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="font-bold rounded-lg"
                >
                  Anterior
                </Button>
                <div className="flex items-center px-2 text-xs font-bold text-slate-400">
                  {currentPage} / {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="font-bold rounded-lg"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Detalles Factura */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden bg-white">
          <div className={cn(
            "p-8 text-white relative overflow-hidden",
            selectedInvoice?.status === 'Anulada' ? "bg-slate-500" : "bg-primary"
          )}>
            <DialogTitle className="text-2xl font-black tracking-tight">Detalle de Factura</DialogTitle>
            <DialogDescription className="text-white/70 font-bold mt-1">
              Documento #{selectedInvoice?.invoiceNumber}
            </DialogDescription>
            <div className="absolute right-[-5%] top-[-20%] opacity-10">
              <FileText className="h-40 w-40" />
            </div>
          </div>
          
          <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
            {selectedInvoice?.status === 'Anulada' && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3">
                <Ban className="h-5 w-5 text-rose-500" />
                <div>
                  <p className="text-rose-700 text-xs font-black uppercase tracking-tight">Este documento fue ANULADO el {selectedInvoice.annulledAt ? formatDocDate(selectedInvoice.annulledAt) : 'recientemente'}.</p>
                  {selectedInvoice.creditNoteAccessKey && (
                    <p className="text-[10px] font-mono text-rose-600 mt-1">NC Ref: {selectedInvoice.creditNoteAccessKey}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clave de Acceso SRI</p>
                <p className="text-xs font-mono break-all text-primary font-bold">{selectedInvoice?.claveAcceso}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ambiente / Emisión</p>
                <p className="text-xs font-bold text-slate-700">PRODUCCIÓN / NORMAL</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-b pb-8">
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Receptor</p>
                <p className="text-lg font-black text-slate-900 leading-tight">{selectedInvoice?.clientData?.name || selectedInvoice?.customerName}</p>
                <p className="text-xs font-mono text-slate-500">{selectedInvoice?.clientData?.ruc || selectedInvoice?.customerRuc}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Fecha Emisión</p>
                <p className="text-lg font-black text-slate-900">{formatDocDate(selectedInvoice?.date)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Estado Legal</p>
                <Badge className={cn("mt-1 rounded-lg uppercase text-[10px] font-black px-3 py-1", getStatusStyle(selectedInvoice?.status))}>
                  {selectedInvoice?.status || 'Pendiente'}
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-black text-slate-900 uppercase tracking-tighter">Detalle de Productos (IVA 0%)</h3>
              <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-black text-[10px] uppercase text-slate-400">Descripción</TableHead>
                      <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Cant.</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedInvoice?.items || []).map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-slate-800">{item.description}</TableCell>
                        <TableCell className="text-center font-bold">{item.quantity || item.cantidad}</TableCell>
                        <TableCell className="text-right font-black text-slate-900">${((item.quantity || item.cantidad || 0) * (item.unitPrice || 0)).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col items-end pt-4">
              <div className="w-full md:w-80 p-6 bg-primary/5 rounded-3xl border border-primary/10 space-y-2 text-right">
                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>Subtotal (IVA 0%):</span><span>${(selectedInvoice?.total || 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>IVA 0%:</span><span>$0.00</span></div>
                <div className="flex justify-between text-3xl font-black text-primary border-t border-primary/20 pt-3 mt-2"><span>TOTAL:</span><span>${(selectedInvoice?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                {(selectedInvoice?.deposit > 0 || selectedInvoice?.balance !== undefined) && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-emerald-600 uppercase pt-2"><span>Monto Abonado:</span><span>${(selectedInvoice?.deposit || 0).toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm font-black text-rose-600 uppercase"><span>Saldo Pendiente:</span><span>${(selectedInvoice?.balance !== undefined ? selectedInvoice.balance : 0).toFixed(2)}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100 flex gap-2">
            <Button variant="outline" onClick={() => handleDownloadRIDE(selectedInvoice)} className="rounded-xl h-12 px-6 font-bold">
              <Download className="mr-2 h-4 w-4" /> RIDE
            </Button>
            <Button variant="outline" onClick={() => handlePrintTicket(selectedInvoice)} className="rounded-xl h-12 px-6 font-bold">
              <Printer className="mr-2 h-4 w-4" /> Ticket
            </Button>
            <Button onClick={() => setIsDetailsOpen(false)} className="bg-slate-900 text-white font-black rounded-xl px-10 h-12">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alerta de Eliminación */}
      <AlertDialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 bg-rose-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <XCircle className="h-6 w-6 text-rose-600" />
            </div>
            <AlertDialogTitle className="text-center">¿Eliminar Factura?</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Esta acción eliminará el registro de la base de datos. Solo puede eliminar documentos que no hayan sido autorizados por el SRI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-3">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              Sí, eliminar registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alerta de Anulación Legal (Nota de Crédito) */}
      <AlertDialog open={!!invoiceToAnnul} onOpenChange={(open) => !open && !loadingAnnul && setInvoiceToAnnul(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center">¿Anulación Legal vía Nota de Crédito?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">Esta acción generará una **Nota de Crédito Electrónica (04)** ante el SRI para invalidar legalmente la factura #{invoiceToAnnul?.invoiceNumber}.</p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-left">
                  <p className="font-bold text-slate-700 mb-1">Impacto legal:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Se firma digitalmente el documento de anulación.</li>
                    <li>Se envía a autorización definitiva al SRI.</li>
                    <li>La factura quedará marcada como "Anulada" irreversiblemente.</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-3">
            <AlertDialogCancel disabled={loadingAnnul} className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAnnul} 
              disabled={loadingAnnul}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl min-w-[140px]"
            >
              {loadingAnnul ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Procesando SRI...</> : "Sí, procesar anulación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Registrar Pago */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => !open && !loadingPayment && setPaymentModalOpen(false)}>
        <DialogContent className="rounded-3xl bg-white border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900">Registrar Pago</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">
              Abono para el documento #{invoiceForPayment?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Total Factura:</span>
                <span className="font-black text-slate-900">${(invoiceForPayment?.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Monto Abonado:</span>
                <span className="font-black text-emerald-600">${(invoiceForPayment?.deposit || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-3">
                <span className="font-black text-slate-700 uppercase tracking-wider text-xs">Saldo Actual:</span>
                <span className="font-black text-rose-600 text-lg">${(invoiceForPayment?.balance !== undefined ? invoiceForPayment.balance : 0).toFixed(2)}</span>
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-primary tracking-widest">Monto a abonar ahora</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">$</span>
                <Input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={(e) => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-8 h-14 font-black text-xl bg-primary/5 border-primary/20 text-primary rounded-xl"
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-primary tracking-widest">Forma de Pago</Label>
              <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                <SelectTrigger className="h-14 font-bold bg-slate-50 border-slate-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.code} value={m.code}>{m.code} - {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPaymentMethod === "20" && (
              <div className="space-y-2 pt-2 animate-in slide-in-from-top-2 duration-300">
                <Label className="text-xs font-black uppercase text-primary tracking-widest">No. Transferencia / Comprobante</Label>
                <Input 
                  placeholder="Referencia bancaria" 
                  value={paymentTransferNumber} 
                  onChange={(e) => setPaymentTransferNumber(e.target.value)}
                  className="h-14 font-black bg-primary/5 border-primary/20 text-primary rounded-xl"
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)} disabled={loadingPayment} className="rounded-xl h-12 font-bold">Cancelar</Button>
            <Button onClick={handleRegisterPayment} disabled={loadingPayment || paymentAmount <= 0} className="rounded-xl bg-primary h-12 px-8 font-bold">
              {loadingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
