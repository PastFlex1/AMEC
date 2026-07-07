
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
  Clock,
  Loader2,
  Trash2,
  Info,
  Hash,
  Edit2,
  CreditCard,
  AlertTriangle
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
import { collection, doc, deleteDoc, query, orderBy, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { generateBillingPDF, generateThermalPDF } from "@/lib/pdf-service";

const PAYMENT_METHODS = [
  { code: "01", label: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO" },
  { code: "15", label: "COMPENSACIÓN DE DEUDAS" },
  { code: "16", label: "TARJETA DE DÉBITO" },
  { code: "17", label: "DINERO ELECTRÓNICO" },
  { code: "18", label: "TARJETA PREPAGO" },
  { code: "19", label: "TARJETA DE CRÉDITO" },
  { code: "20", label: "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO" },
];

export default function ProformasPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setUserRole(localStorage.getItem('amec_user_role') || 'sales');
    setUserName(localStorage.getItem('amec_user_name') || '');
  }, []);

  const [selectedProforma, setSelectedProforma] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [proformaToDelete, setProformaToDelete] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [proformaForPayment, setProformaForPayment] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("01");
  const [paymentTransferNumber, setPaymentTransferNumber] = useState("");

  const proformasRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "proformas"), orderBy("proformaNumber", "desc"));
  }, [db]);
  
  const { data: proformas, loading } = useCollection(proformasRef);

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
    if (!proformas) return [];
    return proformas.filter((p: any) => {
      if (userRole === 'sales' && p.createdBy !== userName) return false;

      const customer = p.clientData?.name || p.customerName || "Cliente";
      const id = p.id || "";
      const num = p.proformaNumber || "";
      const ruc = p.clientData?.ruc || p.ruc || "";
      return customer.toLowerCase().includes(searchTerm.toLowerCase()) || 
             id.toLowerCase().includes(searchTerm.toLowerCase()) ||
             num.toLowerCase().includes(searchTerm.toLowerCase()) ||
             ruc.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [proformas, searchTerm, userRole, userName]);

  const paginatedData = useMemo(() => {
    if (!filtered) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil((filtered?.length || 0) / itemsPerPage);

  const stats = useMemo(() => {
    if (!filtered) return { total: 0, count: 0 };
    return filtered.reduce((acc, curr: any) => {
      acc.total += curr.total || 0;
      acc.count += 1;
      return acc;
    }, { total: 0, count: 0 });
  }, [filtered]);

  const getStatusStyle = (status: string) => {
    const s = status || 'Pendiente';
    switch (s) {
      case 'Aceptada': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Vencida': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'Enviado': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'Pendiente': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const handleDownloadPDF = (prof: any) => {
    try {
      const total = prof.total || 0;
      const subtotal = total;
      const iva = 0;
      
      generateBillingPDF({
        title: "Proforma",
        color: [79, 70, 229], // Color Indigo para Proformas
        client: {
          name: prof.clientData?.name || prof.customerName || "Cliente",
          ruc: prof.clientData?.ruc || prof.ruc || "9999999999999",
          address: prof.clientData?.address || "S/N",
          email: prof.clientData?.email || "N/A"
        },
        items: (prof.items || []).map((item: any) => ({
          description: item.description || "Producto",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0
        })),
        subtotal,
        iva,
        total,
        date: formatDocDate(prof.date),
        docNumber: prof.proformaNumber || prof.id.substring(0, 8),
        observations: prof.observations
      });
      toast({ title: "PDF Generado", description: "La proforma se ha descargado correctamente." });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el PDF.", variant: "destructive" });
    }
  };

  const handlePrintTicket = (prof: any) => {
    try {
      const total = prof.total || 0;
      const subtotal = total;
      const iva = 0;
      
      generateThermalPDF({
        title: "Proforma",
        client: {
          name: prof.clientData?.name || prof.customerName || "Cliente",
          ruc: prof.clientData?.ruc || prof.ruc || "9999999999999",
          address: prof.clientData?.address || "S/N",
          email: prof.clientData?.email || "N/A"
        },
        items: (prof.items || []).map((item: any) => ({
          description: item.description || "Producto",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0
        })),
        subtotal,
        iva,
        total,
        date: formatDocDate(prof.date),
        docNumber: prof.proformaNumber || prof.id.substring(0, 8),
        observations: prof.observations
      });
      toast({ title: "Ticket Generado" });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el Ticket.", variant: "destructive" });
    }
  };

  const handleDelete = () => {
    if (!db || !proformaToDelete) return;
    deleteDoc(doc(db, "proformas", proformaToDelete))
      .then(() => {
        toast({ title: "Proforma borrada", description: "El registro ha sido retirado del sistema." });
        setProformaToDelete(null);
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `proformas/${proformaToDelete}`, operation: 'delete' }));
        setProformaToDelete(null);
      });
  };

  const openPaymentModal = (prof: any) => {
    setProformaForPayment(prof);
    setPaymentAmount(prof.balance !== undefined ? prof.balance : 0);
    setSelectedPaymentMethod(prof.clientData?.paymentMethod || "01");
    setPaymentTransferNumber(prof.clientData?.transferNumber || "");
    setPaymentModalOpen(true);
  };

  const handleRegisterPayment = async () => {
    if (!db || !proformaForPayment) return;
    
    const currentDeposit = proformaForPayment.deposit || 0;
    const newDeposit = currentDeposit + paymentAmount;
    const newBalance = Math.max(0, proformaForPayment.total - newDeposit);

    setLoadingPayment(true);
    try {
      await updateDoc(doc(db, "proformas", proformaForPayment.id), {
        deposit: newDeposit,
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, "payments"), {
        type: "Proforma",
        docId: proformaForPayment.id,
        docNumber: proformaForPayment.proformaNumber || proformaForPayment.id.substring(0, 8),
        amount: paymentAmount,
        sellerName: userName,
        clientName: proformaForPayment.clientData?.name || proformaForPayment.customerName || "Cliente",
        paymentMethod: selectedPaymentMethod,
        transferNumber: paymentTransferNumber,
        createdAt: serverTimestamp()
      });

      toast({ title: "Pago Registrado", description: "El saldo ha sido actualizado." });
      setPaymentModalOpen(false);
    } catch (error: any) {
      toast({ title: "Error al registrar pago", description: error.message, variant: "destructive" });
    } finally {
      setLoadingPayment(false);
    }
  };

  const openDetails = (prof: any) => {
    setSelectedProforma(prof);
    setIsDetailsOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900">Proformas</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground font-medium">Gestione sus cotizaciones de alto impacto.</p>
            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/50 border-slate-200">Sin Validez SRI</Badge>
          </div>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-200 h-12 px-6 rounded-xl font-bold">
          <Link href="/dashboard/proformas/new">
            <Plus className="mr-2 h-5 w-5" />
            Nueva Proforma
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-100 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Cartera en Seguimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-indigo-100/80 mt-1">{stats.count} proformas activas</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Tasa de Proyección
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900">Activo</div>
            <p className="text-xs text-muted-foreground mt-1">Sincronizado con Firestore</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-gray-900">{stats.count}</div>
            <p className="text-xs text-muted-foreground mt-1">Registros totales</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/30 p-8">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Buscar por cliente o folio..."
                className="pl-11 h-12 bg-white border-gray-100 focus:ring-indigo-500 rounded-2xl shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-50 bg-gray-50/10">
                  <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Proforma #</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-gray-400">Cliente</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-gray-400">Fecha</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-gray-400">Estado</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-gray-400">Estado Pago</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Total</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((prof: any) => (
                    <TableRow 
                      key={prof.id} 
                      className="group hover:bg-indigo-50/50 transition-all duration-300 cursor-pointer"
                      onClick={() => openDetails(prof)}
                    >
                      <TableCell className="px-8 font-mono text-sm font-bold text-indigo-600">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 opacity-50" />
                          {prof.proformaNumber || prof.id.substring(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="font-black text-gray-900">{prof.clientData?.name || prof.customerName || "Cliente"}</TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDocDate(prof.date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("rounded-lg font-black text-[10px] uppercase tracking-wider px-3 py-1", getStatusStyle(prof.status))}>
                          {prof.status || 'Pendiente'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const balance = prof.balance !== undefined ? prof.balance : 0;
                          const isPaid = balance <= 0 && prof.total > 0;
                          return (
                            <Badge variant="outline" className={cn("rounded-lg font-black text-[10px] uppercase tracking-wider px-3 py-1", isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>
                              {isPaid ? 'Pagado' : 'Pendiente Pago'}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right px-8 font-black text-gray-900 text-lg">
                        ${(prof.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-10 w-10 p-0 rounded-xl hover:bg-white shadow-sm transition-all">
                              <MoreHorizontal className="h-5 w-5 text-gray-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-gray-100">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase text-gray-400 px-3 py-2">Gestión de Proforma</DropdownMenuLabel>
                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50">
                              <Link href={`/dashboard/proformas/${prof.id}/edit`}>
                                <Edit2 className="mr-3 h-4 w-4 text-indigo-600" /> Editar Proforma
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50" 
                              onSelect={(e) => { e.preventDefault(); openDetails(prof); }}
                            >
                              <Eye className="mr-3 h-4 w-4 text-indigo-600" /> Ver Detalles
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50">
                              <Link href={`/dashboard/invoices/new?proformaId=${prof.id}`}>
                                <FileText className="mr-3 h-4 w-4 text-indigo-600" /> Convertir a Factura
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50"
                              onSelect={(e) => { e.preventDefault(); handleDownloadPDF(prof); }}
                            >
                              <Download className="mr-3 h-4 w-4 text-indigo-600" /> Descargar PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50"
                              onSelect={(e) => { e.preventDefault(); handlePrintTicket(prof); }}
                            >
                              <Printer className="mr-3 h-4 w-4 text-indigo-600" /> Imprimir Ticket
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl cursor-pointer py-3 hover:bg-indigo-50 focus:bg-indigo-50"
                              onSelect={(e) => { e.preventDefault(); openPaymentModal(prof); }}
                            >
                              <CreditCard className="mr-3 h-4 w-4 text-indigo-600" /> Registrar Pago
                            </DropdownMenuItem>
                            {userRole === 'admin' && (
                              <>
                                <DropdownMenuSeparator className="my-2 bg-gray-50" />
                                <DropdownMenuItem 
                                  className="rounded-xl cursor-pointer py-3 text-destructive hover:bg-rose-50 focus:bg-rose-50 font-bold" 
                                  onSelect={(e) => { e.preventDefault(); setProformaToDelete(prof.id); }}
                                >
                                  <Trash2 className="mr-3 h-4 w-4" /> Eliminar Proforma
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">No hay proformas registradas en Firestore.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50 bg-gray-50/30">
              <div className="text-xs text-gray-500 font-medium">
                Mostrando {filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} proformas
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
                <div className="flex items-center px-2 text-xs font-bold text-gray-400">
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

      {/* Modal de Detalles de Proforma */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden bg-white shadow-2xl border-none">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 p-8 text-white">
            <DialogTitle className="text-2xl font-black tracking-tight">Detalle de Proforma</DialogTitle>
            <DialogDescription className="text-indigo-100 font-bold mt-1">
              Documento #{selectedProforma?.proformaNumber || selectedProforma?.id?.substring(0, 8)}
            </DialogDescription>
          </div>
          
          <div className="p-8 space-y-8 bg-white max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Cliente</p>
                <p className="text-lg font-black text-slate-900 leading-tight">{selectedProforma?.clientData?.name || selectedProforma?.customerName || "Cliente"}</p>
                <p className="text-xs font-mono text-slate-500">{selectedProforma?.clientData?.ruc || selectedProforma?.ruc || ""}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Fecha Emisión</p>
                <p className="text-lg font-black text-slate-900">{formatDocDate(selectedProforma?.date)}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Estado</p>
                <div className="pt-1">
                  <Badge className={cn("rounded-lg uppercase text-[10px] font-black px-3 py-1 border shadow-sm", getStatusStyle(selectedProforma?.status))}>
                    {selectedProforma?.status || 'Pendiente'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y py-6 border-slate-50">
               <div className="space-y-1.5">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Dirección</p>
                <p className="text-sm font-medium text-slate-700">{selectedProforma?.clientData?.address || "No registrada"}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Pago / Referencia</p>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-indigo-500" />
                  <p className="text-sm font-bold text-slate-700">
                    {selectedProforma?.clientData?.paymentMethod || "01"} 
                    {selectedProforma?.clientData?.transferNumber ? ` - Ref: ${selectedProforma.clientData.transferNumber}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-black text-slate-900 uppercase tracking-tighter">Items de Cotización</h3>
              <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-black text-[10px] uppercase text-slate-400">Descripción</TableHead>
                      <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Cant.</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">P. Final</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedProforma?.items || []).map((item: any, idx: number) => (
                      <TableRow key={idx} className="border-b last:border-0">
                        <TableCell className="font-medium text-slate-800">{item.description}</TableCell>
                        <TableCell className="text-center font-bold">{item.quantity}</TableCell>
                        <TableCell className="text-right font-bold text-indigo-600">${(item.unitPrice || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-black text-slate-900">${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {selectedProforma?.observations && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Observaciones</p>
                <div className="bg-indigo-50/30 p-4 rounded-xl text-sm text-slate-700 italic border border-indigo-100/50">
                  {selectedProforma.observations}
                </div>
              </div>
            )}

            <div className="flex flex-col items-end pt-4">
              <div className="w-full md:w-80 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100/50 space-y-2 text-right">
                <div className="flex justify-between text-xs font-bold text-indigo-400 uppercase tracking-widest"><span>Subtotal (IVA 0%):</span><span>${(selectedProforma?.total || 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs font-bold text-indigo-400 uppercase tracking-widest"><span>IVA 0%:</span><span>$0.00</span></div>
                <div className="flex justify-between text-3xl font-black text-indigo-700 border-t border-indigo-100 pt-3 mt-2"><span>TOTAL:</span><span>${(selectedProforma?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                {(selectedProforma?.deposit > 0 || selectedProforma?.balance !== undefined) && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-emerald-600 uppercase tracking-widest pt-2"><span>Monto Abonado:</span><span>${(selectedProforma?.deposit || 0).toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm font-black text-rose-600 uppercase tracking-widest"><span>Saldo Pendiente:</span><span>${(selectedProforma?.balance !== undefined ? selectedProforma.balance : 0).toFixed(2)}</span></div>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
            <Button onClick={() => setIsDetailsOpen(false)} className="bg-slate-900 text-white font-black rounded-xl px-10 h-12 shadow-lg hover:scale-105 transition-transform">
              Cerrar Vista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación de Eliminación */}
      <AlertDialog open={!!proformaToDelete} onOpenChange={(open) => !open && setProformaToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center">¿Deseas retirar esta proforma del sistema?</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-slate-600">
              Al confirmar, el registro se borrará por completo de tu historial. Asegúrate de que ya no la necesitas, pues esta acción no se puede revertir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-3">
            <AlertDialogCancel className="rounded-xl border-slate-200">Mantener proforma</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              Sí, borrar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-[10px] text-muted-foreground text-center italic flex items-center justify-center gap-1">
        <Info className="h-3 w-3" /> Las proformas son documentos comerciales de uso interno sin validez legal ante el SRI.
      </div>

      {/* Modal Registrar Pago */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => !open && !loadingPayment && setPaymentModalOpen(false)}>
        <DialogContent className="rounded-3xl bg-white border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900">Registrar Pago</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">
              Abono para proforma #{proformaForPayment?.proformaNumber || proformaForPayment?.id?.substring(0, 8)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Total:</span>
                <span className="font-black text-slate-900">${(proformaForPayment?.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Monto Abonado:</span>
                <span className="font-black text-emerald-600">${(proformaForPayment?.deposit || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-3">
                <span className="font-black text-slate-700 uppercase tracking-wider text-xs">Saldo Actual:</span>
                <span className="font-black text-rose-600 text-lg">${(proformaForPayment?.balance !== undefined ? proformaForPayment.balance : 0).toFixed(2)}</span>
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-indigo-600 tracking-widest">Monto a abonar ahora</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-600 font-black">$</span>
                <Input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={(e) => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-8 h-14 font-black text-xl bg-indigo-50/50 border-indigo-100 text-indigo-600 rounded-xl"
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-indigo-600 tracking-widest">Forma de Pago</Label>
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
                <Label className="text-xs font-black uppercase text-indigo-600 tracking-widest">No. Transferencia / Comprobante</Label>
                <Input 
                  placeholder="Referencia bancaria" 
                  value={paymentTransferNumber} 
                  onChange={(e) => setPaymentTransferNumber(e.target.value)}
                  className="pl-4 h-14 font-black bg-indigo-50/50 border-indigo-100 text-indigo-600 rounded-xl"
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)} disabled={loadingPayment} className="rounded-xl h-12 font-bold border-slate-200">Cancelar</Button>
            <Button onClick={handleRegisterPayment} disabled={loadingPayment || paymentAmount <= 0} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-8 font-bold shadow-lg shadow-indigo-200">
              {loadingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
