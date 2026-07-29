
"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Calendar, 
  ShoppingBag, 
  Download,
  Eye,
  FileText,
  Info,
  XCircle,
  Loader2,
  Trash2,
  CreditCard,
  Edit2,
  AlertTriangle,
  Hash,
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
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useFirestore, useCollection } from "@/firebase";
import { collection, deleteDoc, doc, updateDoc, serverTimestamp, addDoc, query, orderBy, limit } from "firebase/firestore";
import { syncDailyCashClosing } from "@/lib/cash-register-service";
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

export default function SalesNotesPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [noteForPayment, setNoteForPayment] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("01");
  const [paymentTransferNumber, setPaymentTransferNumber] = useState("");
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

  const notesRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "salesNotes"), orderBy("noteNumber", "desc"), limit(100));
  }, [db]);
  
  const { data: notes, loading } = useCollection(notesRef);

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

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    return notes.filter((note: any) => {
      if (userRole === 'sales' && note.createdBy !== userName) return false;

      const customer = note.clientData?.name || note.customerName || "Cliente";
      const id = note.id || "";
      const num = note.noteNumber || "";
      const ruc = note.clientData?.ruc || note.ruc || "";
      
      return customer.toLowerCase().includes(searchTerm.toLowerCase()) || 
             id.toLowerCase().includes(searchTerm.toLowerCase()) ||
             num.toLowerCase().includes(searchTerm.toLowerCase()) ||
             ruc.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [notes, searchTerm, userRole, userName]);

  const paginatedData = useMemo(() => {
    if (!filteredNotes) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNotes.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNotes, currentPage]);

  const totalPages = Math.ceil((filteredNotes?.length || 0) / itemsPerPage);

  const stats = useMemo(() => {
    if (!filteredNotes) return { total: 0, count: 0 };
    return filteredNotes.reduce((acc, curr: any) => {
      acc.total += curr.total || 0;
      acc.count += 1;
      return acc;
    }, { total: 0, count: 0 });
  }, [filteredNotes]);

  const getStatusStyle = (status: string) => {
    const s = (status || 'Pendiente').toLowerCase();
    switch (s) {
      case 'enviado': 
        return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'pendiente': 
        return 'bg-amber-50 text-amber-600 border-amber-100';
      default: 
        return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const handleDownloadPDF = (note: any) => {
    try {
      const total = note.total || 0;
      const subtotal = total;
      const iva = 0;
      
      generateBillingPDF({
        title: "Nota de Venta",
        color: [41, 136, 163], // Color AMEC Cyan para Notas de Venta
        client: {
          name: note.clientData?.name || note.customerName || "Cliente",
          ruc: note.clientData?.ruc || note.ruc || "9999999999999",
          address: note.clientData?.address || "S/N",
          email: note.clientData?.email || "N/A"
        },
        items: (note.items || []).map((item: any) => ({
          description: item.description || "Producto",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0
        })),
        subtotal,
        iva,
        total,
        date: formatDocDate(note.date),
        docNumber: note.noteNumber || note.id.substring(0, 8),
        observations: note.observations
      });
      toast({ title: "PDF Generado", description: "La nota de venta se ha descargado exitosamente." });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el PDF.", variant: "destructive" });
    }
  };

  const handlePrintTicket = (note: any) => {
    try {
      const total = note.total || 0;
      const subtotal = total;
      const iva = 0;
      
      generateThermalPDF({
        title: "Nota de Venta",
        client: {
          name: note.clientData?.name || note.customerName || "Cliente",
          ruc: note.clientData?.ruc || note.ruc || "9999999999999",
          address: note.clientData?.address || "S/N",
          email: note.clientData?.email || "N/A"
        },
        items: (note.items || []).map((item: any) => ({
          description: item.description || "Producto",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0
        })),
        subtotal,
        iva,
        total,
        date: formatDocDate(note.date),
        docNumber: note.noteNumber || note.id.substring(0, 8),
        observations: note.observations
      });
      toast({ title: "Ticket Generado" });
    } catch (error) {
      toast({ title: "Error", description: "No se pudo generar el Ticket.", variant: "destructive" });
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
  };

  const handleDelete = () => {
    if (!db || !noteToDelete) return;
    const note = notes?.find((n: any) => n.id === noteToDelete);
    deleteDoc(doc(db, "salesNotes", noteToDelete))
      .then(async () => {
        toast({ title: "Nota eliminada", description: "El registro interno ha sido removido definitivamente." });
        
        const noteDate = note?.date ? (note.date.toDate ? note.date.toDate() : new Date(note.date)) : new Date();
        const dateString = format(noteDate, "yyyy-MM-dd");
        const sellerName = note?.createdBy || userName;
        await syncDailyCashClosing(db, sellerName, dateString);

        setNoteToDelete(null);
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `salesNotes/${noteToDelete}`, operation: 'delete' }));
        setNoteToDelete(null);
      });
  };

  const openPaymentModal = (note: any) => {
    setNoteForPayment(note);
    setPaymentAmount(note.balance !== undefined ? note.balance : 0);
    setSelectedPaymentMethod(note.clientData?.paymentMethod || "01");
    setPaymentTransferNumber(note.clientData?.transferNumber || "");
    setPaymentModalOpen(true);
  };

  const handleRegisterPayment = async () => {
    if (!db || !noteForPayment) return;
    
    const currentDeposit = noteForPayment.deposit || 0;
    const newDeposit = currentDeposit + paymentAmount;
    const newBalance = Math.max(0, noteForPayment.total - newDeposit);

    setLoadingPayment(true);
    try {
      await updateDoc(doc(db, "salesNotes", noteForPayment.id), {
        deposit: newDeposit,
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, "payments"), {
        type: "Nota de Venta",
        docId: noteForPayment.id,
        docNumber: noteForPayment.noteNumber || noteForPayment.id.substring(0, 8),
        amount: paymentAmount,
        sellerName: userName,
        clientName: noteForPayment.clientData?.name || noteForPayment.customerName || "Cliente",
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

  const openDetails = (note: any) => {
    setSelectedNote(note);
    setIsDetailsOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Notas de Venta</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
            Registro de transacciones internas conectadas a Firestore. 
            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/50">Sin Validez SRI</Badge>
          </div>
        </div>
        <Button asChild className="shadow-lg shadow-primary/20">
          <Link href="/dashboard/sales-notes/new">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Nota de Venta
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              Facturación Interna Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-emerald-500/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-500" />
              Notas Registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.count}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-indigo-500/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-indigo-500" />
              Estado Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">En Vivo</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="flex flex-1 gap-4 flex-col md:flex-row">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por # de nota o cliente..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <XCircle className="h-4 w-4 mr-2" />
                  Limpiar Búsqueda
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border bg-card/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="px-6 w-[150px] font-bold uppercase text-[10px] tracking-wider">Nota #</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-wider">Cliente</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-wider">Fecha</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-wider text-center">Estado</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-wider text-center">Estado Pago</TableHead>
                  <TableHead className="text-right px-6 font-bold uppercase text-[10px] tracking-wider">Monto Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((note: any) => (
                    <TableRow 
                      key={note.id} 
                      className="hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => openDetails(note)}
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-[#2988a3]">
                          <Hash className="h-3 w-3 opacity-50" />
                          {note.noteNumber || note.id.substring(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="font-semibold text-slate-800">{note.clientData?.name || note.customerName || "Cliente"}</div>
                        <div className="text-[10px] text-muted-foreground">{note.clientData?.ruc || ""}</div>
                      </TableCell>
                      <TableCell className="py-4 text-muted-foreground text-sm">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDocDate(note.date)}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-center">
                        <Badge variant="outline" className={cn(
                          "rounded-lg uppercase text-[9px] font-black tracking-wider px-3 py-1",
                          getStatusStyle(note.status)
                        )}>
                          {note.status || 'Pendiente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-center">
                        {(() => {
                          const balance = note.balance !== undefined ? note.balance : 0;
                          const isPaid = balance <= 0 && note.total > 0;
                          return (
                            <Badge variant="outline" className={cn("rounded-lg font-black text-[10px] uppercase tracking-wider px-3 py-1", isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')}>
                              {isPaid ? 'Pagado' : 'Pendiente Pago'}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-black text-slate-900 text-lg">
                        ${(note.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-9 w-9 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] uppercase font-black text-slate-400">Acciones</DropdownMenuLabel>
                            <DropdownMenuItem 
                              className="cursor-pointer" 
                              onSelect={(e) => { e.preventDefault(); openDetails(note); }}
                            >
                              <Eye className="mr-2 h-4 w-4" /> Ver Detalles
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/sales-notes/${note.id}/edit`}>
                                <Edit2 className="mr-2 h-4 w-4" /> Editar Nota
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="cursor-pointer text-primary"
                              onSelect={(e) => { e.preventDefault(); handleDownloadPDF(note); }}
                            >
                              <Download className="mr-2 h-4 w-4" /> Descargar PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="cursor-pointer text-primary"
                              onSelect={(e) => { e.preventDefault(); handlePrintTicket(note); }}
                            >
                              <Printer className="mr-2 h-4 w-4" /> Imprimir Ticket
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="cursor-pointer text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700"
                              onSelect={(e) => { e.preventDefault(); openPaymentModal(note); }}
                            >
                              <CreditCard className="mr-2 h-4 w-4" /> Registrar Pago
                            </DropdownMenuItem>
                            {userRole === 'admin' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="cursor-pointer text-destructive focus:bg-destructive/5 font-bold" 
                                  onSelect={(e) => { e.preventDefault(); setNoteToDelete(note.id); }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar Nota
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">
                      No hay notas de venta en la base de datos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-50 bg-slate-50/30">
              <div className="text-xs text-slate-500 font-medium">
                Mostrando {filteredNotes.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a {Math.min(currentPage * itemsPerPage, filteredNotes.length)} de {filteredNotes.length} notas
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

      {/* Modal de Detalles de Nota de Venta */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden bg-white shadow-2xl border-none">
          <div className="bg-[#2988a3] p-8 text-white">
            <DialogTitle className="text-2xl font-black tracking-tight">Detalle de Nota de Venta</DialogTitle>
            <DialogDescription className="text-blue-100 font-bold mt-1">
              Registro Interno #{selectedNote?.noteNumber || selectedNote?.id?.substring(0, 8)}
            </DialogDescription>
          </div>
          
          <div className="p-8 space-y-8 bg-white max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Receptor</p>
                <p className="text-lg font-black text-slate-900 leading-tight">{selectedNote?.clientData?.name || selectedNote?.customerName || "Cliente"}</p>
                <p className="text-xs font-mono text-slate-500">{selectedNote?.clientData?.ruc || selectedNote?.ruc || ""}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Fecha Registro</p>
                <p className="text-lg font-black text-slate-900">{formatDocDate(selectedNote?.date)}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Estado</p>
                <div className="pt-1">
                  <Badge variant="outline" className={cn(
                    "rounded-lg uppercase text-[10px] font-black px-3 py-1 border shadow-sm",
                    getStatusStyle(selectedNote?.status)
                  )}>
                    {selectedNote?.status || 'Pendiente'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y py-6 border-slate-50">
               <div className="space-y-1.5">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Dirección de Entrega</p>
                <p className="text-sm font-medium text-slate-700">{selectedNote?.clientData?.address || "S/N"}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Método de Pago</p>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#2988a3]" />
                  <p className="text-sm font-bold text-slate-700 uppercase">
                    {selectedNote?.clientData?.paymentMethod || "01"} 
                    {selectedNote?.clientData?.transferNumber ? ` - REF: ${selectedNote.clientData.transferNumber}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-black text-slate-900 uppercase tracking-tighter">Productos Entregados</h3>
              <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-black text-[10px] uppercase text-slate-400">Descripción</TableHead>
                      <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Cant.</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Precio</TableHead>
                      <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedNote?.items || []).map((item: any, idx: number) => (
                      <TableRow key={idx} className="border-b last:border-0">
                        <TableCell className="font-medium text-slate-800">{item.description}</TableCell>
                        <TableCell className="text-center font-bold">{item.quantity}</TableCell>
                        <TableCell className="text-right font-bold text-[#2988a3]">${(item.unitPrice || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-black text-slate-900">${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {selectedNote?.observations && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-[#2988a3] uppercase tracking-widest">Observaciones</p>
                <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 italic border border-slate-100">
                  {selectedNote.observations}
                </div>
              </div>
            )}

            <div className="flex flex-col items-end pt-4">
              <div className="w-full md:w-80 p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-1 text-right">
                <p className="text-xs text-muted-foreground">Subtotal (Sin IVA): ${(selectedNote?.total || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">IVA (0%): $0.00</p>
                <p className="text-3xl font-black text-slate-900 border-t pt-3 mt-2">TOTAL: ${(selectedNote?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                {(selectedNote?.deposit > 0 || selectedNote?.balance !== undefined) && (
                  <div className="pt-3 mt-3 border-t border-slate-200">
                    <p className="text-xs font-bold text-emerald-600 uppercase">Monto Abonado: ${(selectedNote?.deposit || 0).toFixed(2)}</p>
                    <p className="text-sm font-black text-rose-600 uppercase mt-1">Saldo Pendiente: ${(selectedNote?.balance !== undefined ? selectedNote.balance : 0).toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
            <Button onClick={() => setIsDetailsOpen(false)} className="bg-slate-900 text-white font-black rounded-xl px-10 h-12 shadow-lg hover:scale-105 transition-transform">
              Cerrar Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-center">¿Quitar esta nota de venta de la base?</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-slate-600">
              Al aceptar, el registro interno desaparecerá por completo de tu sistema AMEC. Esta acción limpiará el historial de esta transacción sin opción de recuperarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-3">
            <AlertDialogCancel className="rounded-xl border-slate-200">Mantener nota</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              Sí, borrar registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-[10px] text-muted-foreground text-center italic flex items-center justify-center gap-1">
        <Info className="h-3 w-3" /> Las notas de venta son documentos de uso interno sincronizados con Firestore.
      </div>

      {/* Modal Registrar Pago */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => !open && !loadingPayment && setPaymentModalOpen(false)}>
        <DialogContent className="rounded-3xl bg-white border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900">Registrar Pago</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">
              Abono para la nota de venta #{noteForPayment?.noteNumber || noteForPayment?.id?.substring(0, 8)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Total:</span>
                <span className="font-black text-slate-900">${(noteForPayment?.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Monto Abonado:</span>
                <span className="font-black text-emerald-600">${(noteForPayment?.deposit || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-3">
                <span className="font-black text-slate-700 uppercase tracking-wider text-xs">Saldo Actual:</span>
                <span className="font-black text-rose-600 text-lg">${(noteForPayment?.balance !== undefined ? noteForPayment.balance : 0).toFixed(2)}</span>
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-[#2988a3] tracking-widest">Monto a abonar ahora</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2988a3] font-black">$</span>
                <Input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={(e) => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-8 h-14 font-black text-xl bg-[#2988a3]/5 border-[#2988a3]/20 text-[#2988a3] rounded-xl"
                />
              </div>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-black uppercase text-[#2988a3] tracking-widest">Forma de Pago</Label>
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
                <Label className="text-xs font-black uppercase text-[#2988a3] tracking-widest">No. Transferencia / Comprobante</Label>
                <Input 
                  placeholder="Referencia bancaria" 
                  value={paymentTransferNumber} 
                  onChange={(e) => setPaymentTransferNumber(e.target.value)}
                  className="pl-4 h-14 font-black bg-[#2988a3]/5 border-[#2988a3]/20 text-[#2988a3] rounded-xl"
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)} disabled={loadingPayment} className="rounded-xl h-12 font-bold border-slate-200">Cancelar</Button>
            <Button onClick={handleRegisterPayment} disabled={loadingPayment || paymentAmount <= 0} className="rounded-xl bg-[#2988a3] hover:bg-[#206a80] text-white h-12 px-8 font-bold shadow-lg shadow-[#2988a3]/20">
              {loadingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
