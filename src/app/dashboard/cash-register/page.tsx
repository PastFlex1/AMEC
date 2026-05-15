"use client";

import { useState, useEffect, useMemo } from "react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Banknote, CreditCard, ArrowRightLeft, FileText, ShoppingBag, Loader2, Calendar, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function CashRegisterPage() {
  const db = useFirestore();
  const { toast } = useToast();
  
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data states
  const [myClosings, setMyClosings] = useState<any[]>([]);
  const [allClosings, setAllClosings] = useState<any[]>([]);
  
  // Current shift calculations
  const [shiftStats, setShiftStats] = useState({
    totalAmount: 0,
    cash: 0,
    transfers: 0,
    cards: 0,
    invoicesCount: 0,
    notesCount: 0,
    lastClosingDate: null as any,
    documents: [] as any[]
  });

  const [selectedClosingDocs, setSelectedClosingDocs] = useState<any[] | null>(null);

  useEffect(() => {
    const savedRole = localStorage.getItem('amec_user_role') || 'sales';
    const savedName = localStorage.getItem('amec_user_name') || 'Vendedor';
    setRole(savedRole);
    setUserName(savedName);
  }, []);

  useEffect(() => {
    if (!db || !role || !userName) return;
    loadData();
  }, [db, role, userName]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (role === 'admin') {
        // Admin loads all closings
        const q = query(collection(db, "cashClosings"));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
          const tA = a.closingDate?.toMillis() || 0;
          const tB = b.closingDate?.toMillis() || 0;
          return tB - tA;
        });
        setAllClosings(docs);
      } else {
        // Sales loads their own closings
        const qClosings = query(collection(db, "cashClosings"), where("sellerName", "==", userName));
        const snapClosings = await getDocs(qClosings);
        const closings = snapClosings.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
          const tA = a.closingDate?.toMillis() || 0;
          const tB = b.closingDate?.toMillis() || 0;
          return tB - tA;
        });
        setMyClosings(closings);

        const lastClosing: any = closings[0]; // because it's sorted desc
        const lastClosingTime = lastClosing?.closingDate?.toMillis() || 0;

        // Load invoices and notes for current user
        const qInvoices = query(collection(db, "invoices"), where("createdBy", "==", userName));
        const snapInvoices = await getDocs(qInvoices);
        const newInvoices = snapInvoices.docs.map(d => d.data()).filter((d: any) => d.createdAt && d.createdAt.toMillis() > lastClosingTime && d.status === "Autorizado");

        const qNotes = query(collection(db, "salesNotes"), where("createdBy", "==", userName));
        const snapNotes = await getDocs(qNotes);
        const newNotes = snapNotes.docs.map(d => d.data()).filter((d: any) => d.createdAt && d.createdAt.toMillis() > lastClosingTime && d.status !== "Anulado");

        let cash = 0; let transfers = 0; let cards = 0; let totalAmount = 0;
        let documents: any[] = [];
        
        const processDocs = (docs: any[], typeName: string, idField: string, useDepositOnly: boolean = false) => {
          docs.forEach(doc => {
            const method = doc.clientData?.paymentMethod || "01";
            const amount = useDepositOnly ? (doc.deposit || 0) : (doc.total || 0);
            totalAmount += amount;
            if (method === "01") cash += amount;
            else if (method === "16" || method === "18" || method === "19") cards += amount;
            else if (method === "20") transfers += amount;
            else cash += amount; // default others to cash
            
            documents.push({
              type: typeName,
              num: doc[idField] || "S/N",
              amount: amount,
              client: doc.clientData?.name || doc.customerName || "Consumidor Final"
            });
          });
        };

        processDocs(newInvoices, "Factura", "invoiceNumber");
        processDocs(newNotes, "Nota de Venta", "noteNumber");

        setShiftStats({
          totalAmount,
          cash,
          transfers,
          cards,
          invoicesCount: newInvoices.length,
          notesCount: newNotes.length,
          lastClosingDate: lastClosing ? lastClosing.closingDate.toDate() : null,
          documents
        });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error al cargar datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRegister = async () => {
    if (!db || shiftStats.totalAmount === 0) {
      toast({ title: "No hay ventas para cerrar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const closingData = {
        sellerName: userName,
        closingDate: serverTimestamp(),
        totalAmount: shiftStats.totalAmount,
        cash: shiftStats.cash,
        transfers: shiftStats.transfers,
        cards: shiftStats.cards,
        invoicesCount: shiftStats.invoicesCount,
        notesCount: shiftStats.notesCount,
        documents: shiftStats.documents
      };
      await addDoc(collection(db, "cashClosings"), closingData);
      toast({ title: "Cierre de caja exitoso" });
      loadData(); // reload
    } catch (e) {
      toast({ title: "Error al cerrar caja", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">Cierre de Caja</h1>
        <p className="text-muted-foreground">Gestión y control de ventas por turno.</p>
      </div>

      {role === 'sales' ? (
        <div className="space-y-8">
          {/* VISTA VENDEDOR */}
          <Card className="border-none shadow-xl bg-gradient-to-br from-[#2988a3] to-[#1f6a80] text-white rounded-3xl overflow-hidden">
            <CardContent className="p-8 md:p-12">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div className="space-y-2">
                  <h2 className="text-xl font-medium text-white/80">Total del Turno Actual</h2>
                  <div className="text-5xl md:text-7xl font-black font-mono tracking-tighter">
                    ${shiftStats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="flex items-center gap-2 text-white/70 text-sm mt-4">
                    <Calendar className="h-4 w-4" />
                    Desde: {shiftStats.lastClosingDate ? format(shiftStats.lastClosingDate, "dd/MM/yyyy HH:mm", { locale: es }) : 'El primer registro de ventas'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/80 mb-2">
                      <Banknote className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-wider">Efectivo</span>
                    </div>
                    <div className="text-2xl font-black">${shiftStats.cash.toFixed(2)}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/80 mb-2">
                      <ArrowRightLeft className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-wider">Transfer.</span>
                    </div>
                    <div className="text-2xl font-black">${shiftStats.transfers.toFixed(2)}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/80 mb-2">
                      <CreditCard className="h-4 w-4" /> <span className="text-xs font-bold uppercase tracking-wider">Tarjetas</span>
                    </div>
                    <div className="text-2xl font-black">${shiftStats.cards.toFixed(2)}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-center items-center text-center">
                    <div className="text-xs font-bold uppercase tracking-wider text-white/80 mb-1">Documentos</div>
                    <div className="text-sm font-bold">{shiftStats.invoicesCount} Fact. / {shiftStats.notesCount} Notas</div>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-white/20 flex justify-end">
                <Button 
                  onClick={handleCloseRegister}
                  disabled={saving || shiftStats.totalAmount === 0}
                  className="bg-white text-[#2988a3] hover:bg-white/90 h-14 px-8 rounded-2xl font-black text-lg shadow-2xl"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Wallet className="h-5 w-5 mr-2" />}
                  Cerrar Caja Ahora
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#2988a3]" /> Mi Historial de Cierres
              </h3>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold">Fecha de Cierre</TableHead>
                    <TableHead className="text-right font-bold">Efectivo</TableHead>
                    <TableHead className="text-right font-bold">Transferencias</TableHead>
                    <TableHead className="text-right font-bold">Tarjetas</TableHead>
                    <TableHead className="text-center font-bold">Docs.</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myClosings.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-slate-700">
                        {c.closingDate ? format(c.closingDate.toDate(), "dd MMM yyyy, HH:mm", { locale: es }) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">${c.cash?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-600">${c.transfers?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-600">${c.cards?.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedClosingDocs(c.documents || [])}
                          className="h-8 text-[#2988a3]"
                        >
                          <Eye className="h-4 w-4 mr-2" /> Ver
                        </Button>
                      </TableCell>
                      <TableCell className="text-right font-black text-[#2988a3]">${c.totalAmount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {myClosings.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground italic">No tienes cierres de caja previos.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-8">
          {/* VISTA ADMIN */}
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-900 border-b text-white p-8">
              <h3 className="text-2xl font-black flex items-center gap-3">
                <Wallet className="h-6 w-6 text-emerald-400" /> Historial Global de Cierres
              </h3>
              <p className="text-slate-400">Todos los cierres de caja de todos los vendedores.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-bold py-4">Fecha</TableHead>
                    <TableHead className="font-bold py-4">Vendedor</TableHead>
                    <TableHead className="text-right font-bold py-4">Efectivo</TableHead>
                    <TableHead className="text-right font-bold py-4">Transfer / Tarj</TableHead>
                    <TableHead className="text-center font-bold py-4">Docs.</TableHead>
                    <TableHead className="text-right font-bold py-4">Total Entregado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allClosings.map((c) => (
                    <TableRow key={c.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium text-slate-700">
                        {c.closingDate ? format(c.closingDate.toDate(), "dd MMM yyyy, HH:mm", { locale: es }) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {c.sellerName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-700">${c.cash?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-500 text-xs">
                        T: ${c.transfers?.toFixed(2)} <br/>
                        C: ${c.cards?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center text-slate-500 text-xs">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedClosingDocs(c.documents || [])}
                          className="h-7 text-xs font-bold text-emerald-600"
                        >
                          <Eye className="h-3 w-3 mr-1.5" /> 
                          {c.invoicesCount} F / {c.notesCount} N
                        </Button>
                      </TableCell>
                      <TableCell className="text-right font-black text-lg text-emerald-600">${c.totalAmount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {allClosings.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center h-32 text-muted-foreground italic">No hay registros de cierres en el sistema.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MODAL PARA VER DOCUMENTOS */}
      <Dialog open={selectedClosingDocs !== null} onOpenChange={(open) => !open && setSelectedClosingDocs(null)}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-50 border-b">
            <DialogTitle className="text-xl font-black text-slate-800">
              Documentos de este Cierre
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {selectedClosingDocs && selectedClosingDocs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Tipo</TableHead>
                    <TableHead className="font-bold">N° Documento</TableHead>
                    <TableHead className="font-bold">Cliente</TableHead>
                    <TableHead className="text-right font-bold">Monto (Efectivo/Caja)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedClosingDocs.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          d.type === 'Factura' ? "bg-blue-50 text-blue-700" : 
                          d.type === 'Proforma' ? "bg-amber-50 text-amber-700" : 
                          "bg-purple-50 text-purple-700"
                        )}>
                          {d.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.num}</TableCell>
                      <TableCell className="text-slate-600">{d.client}</TableCell>
                      <TableCell className="text-right font-black">${d.amount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No hay documentos registrados para este cierre antiguo.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
