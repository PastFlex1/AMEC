"use client";

import { useState, useEffect } from "react";
import { useFirestore } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { syncDailyCashClosing } from "@/lib/cash-register-service";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Banknote, CreditCard, ArrowRightLeft, FileText, Loader2, Calendar, Eye, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
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
  const [syncing, setSyncing] = useState(false);

  // Data states
  const [myClosings, setMyClosings] = useState<any[]>([]);
  const [allClosings, setAllClosings] = useState<any[]>([]);
  
  // Current active daily stats
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
    loadData(true);
  }, [db, role, userName]);

  const loadData = async (forceSyncToday = true) => {
    setLoading(true);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    
    try {
      if (db && userName && forceSyncToday) {
        setSyncing(true);
        await syncDailyCashClosing(db, userName, todayStr);
      }

      // 1. Obtener cierres de caja (cashClosings)
      let closingsQuery;
      if (role === 'admin') {
        closingsQuery = query(collection(db, "cashClosings"));
      } else {
        closingsQuery = query(collection(db, "cashClosings"), where("sellerName", "==", userName));
      }
      
      const snapClosings = await getDocs(closingsQuery);
      const closings = snapClosings.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => {
        const dateA = a.dateString || "";
        const dateB = b.dateString || "";
        return dateB.localeCompare(dateA); // Más recientes primero
      });

      setAllClosings(closings);
      setMyClosings(closings.filter((c: any) => c.sellerName === userName));

      // 2. Establecer estadísticas del día actual del vendedor activo
      const todayDoc = closings.find((c: any) => c.sellerName === userName && c.dateString === todayStr);
      if (todayDoc) {
        setShiftStats({
          totalAmount: todayDoc.totalAmount || 0,
          cash: todayDoc.cash || 0,
          transfers: todayDoc.transfers || 0,
          cards: todayDoc.cards || 0,
          invoicesCount: todayDoc.invoicesCount || 0,
          notesCount: todayDoc.notesCount || 0,
          lastClosingDate: todayDoc.closingDate ? (todayDoc.closingDate.toDate ? todayDoc.closingDate.toDate() : new Date(todayDoc.closingDate)) : new Date(),
          documents: todayDoc.documents || []
        });
      } else {
        setShiftStats({
          totalAmount: 0,
          cash: 0,
          transfers: 0,
          cards: 0,
          invoicesCount: 0,
          notesCount: 0,
          lastClosingDate: new Date(),
          documents: []
        });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error al cargar datos", variant: "destructive" });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900">Control de Caja Diario</h1>
          <p className="text-muted-foreground mt-1">Cálculo contable sincronizado automáticamente por fecha y vendedor.</p>
        </div>
        <Button 
          onClick={() => loadData(true)} 
          disabled={syncing}
          variant="outline"
          className="border-slate-200 hover:bg-slate-50 rounded-xl h-11 px-4 flex items-center gap-2 font-bold"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <RefreshCw className="h-4 w-4 text-slate-500" />}
          Sincronizar Hoy
        </Button>
      </div>

      <div className="space-y-8">
        {/* VISTA DE CIERRE DE HOY */}
        <Card className="border-none shadow-xl bg-gradient-to-br from-[#2988a3] to-[#1f6a80] text-white rounded-3xl overflow-hidden relative">
          <CardContent className="p-8 md:p-12">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-medium text-white/90">Mi Caja de Hoy ({format(new Date(), "dd/MM/yyyy")})</h2>
                  <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 font-black text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    En Vivo
                  </span>
                </div>
                <div className="text-5xl md:text-7xl font-black font-mono tracking-tighter">
                  ${shiftStats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Calendar className="h-4 w-4" />
                  Última actualización: {shiftStats.lastClosingDate ? format(shiftStats.lastClosingDate, "HH:mm:ss", { locale: es }) : 'Nunca'}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full lg:w-auto">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Banknote className="h-4 w-4 text-emerald-300" /> <span className="text-[10px] font-bold uppercase tracking-wider">Efectivo</span>
                  </div>
                  <div className="text-2xl font-black">${shiftStats.cash.toFixed(2)}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <ArrowRightLeft className="h-4 w-4 text-cyan-300" /> <span className="text-[10px] font-bold uppercase tracking-wider">Transfer.</span>
                  </div>
                  <div className="text-2xl font-black">${shiftStats.transfers.toFixed(2)}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <CreditCard className="h-4 w-4 text-purple-300" /> <span className="text-[10px] font-bold uppercase tracking-wider">Tarjetas</span>
                  </div>
                  <div className="text-2xl font-black">${shiftStats.cards.toFixed(2)}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-center items-center text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/80 mb-1">Documentos</div>
                  <div className="text-sm font-black">{shiftStats.invoicesCount} Fact. / {shiftStats.notesCount} Notas</div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedClosingDocs(shiftStats.documents)}
                    className="h-6 mt-1.5 text-[10px] font-black uppercase text-white bg-white/10 hover:bg-white/20 px-2 rounded"
                  >
                    Detalles
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
          <div className="absolute right-[-5%] bottom-[-15%] opacity-5 pointer-events-none">
            <Wallet className="h-56 w-56 rotate-12" />
          </div>
        </Card>

        {role === 'sales' ? (
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b p-6">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#2988a3]" /> Mi Historial de Cierres Diarios
              </h3>
              <p className="text-xs text-slate-400">Desglose de tus cajas organizadas por día.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider px-6 py-4">Fecha</TableHead>
                    <TableHead className="text-right font-bold uppercase text-[10px] tracking-wider py-4">Efectivo</TableHead>
                    <TableHead className="text-right font-bold uppercase text-[10px] tracking-wider py-4">Transferencias</TableHead>
                    <TableHead className="text-right font-bold uppercase text-[10px] tracking-wider py-4">Tarjetas</TableHead>
                    <TableHead className="text-center font-bold uppercase text-[10px] tracking-wider py-4">Documentos</TableHead>
                    <TableHead className="text-right font-bold uppercase text-[10px] tracking-wider px-6 py-4">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myClosings.map((c) => (
                    <TableRow key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-bold text-slate-700 px-6 py-4">
                        {c.dateString ? format(parseISO(c.dateString), "dd MMM yyyy", { locale: es }) : 'Reciente'}
                      </TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">${c.cash?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">${c.transfers?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">${c.cards?.toFixed(2)}</TableCell>
                      <TableCell className="text-center py-4">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedClosingDocs(c.documents || [])}
                          className="h-8 text-[#2988a3] hover:text-[#1f6a80] font-bold"
                        >
                          <Eye className="h-4 w-4 mr-1.5" /> 
                          {c.invoicesCount} F / {c.notesCount} N
                        </Button>
                      </TableCell>
                      <TableCell className="text-right font-black text-[#2988a3] text-lg px-6 py-4 font-mono">${c.totalAmount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {myClosings.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground italic">No se han registrado cierres de caja para tu usuario.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-900 border-b text-white p-8">
              <h3 className="text-2xl font-black flex items-center gap-3">
                <Wallet className="h-6 w-6 text-emerald-400" /> Historial Global de Caja Diaria
              </h3>
              <p className="text-slate-400">Resumen y auditoría de todas las cajas registradas por el personal de venta.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-bold py-4 px-6 uppercase text-[10px] tracking-wider">Fecha</TableHead>
                    <TableHead className="font-bold py-4 uppercase text-[10px] tracking-wider">Vendedor</TableHead>
                    <TableHead className="text-right font-bold py-4 uppercase text-[10px] tracking-wider">Efectivo</TableHead>
                    <TableHead className="text-right font-bold py-4 uppercase text-[10px] tracking-wider">Transf / Tarjetas</TableHead>
                    <TableHead className="text-center font-bold py-4 uppercase text-[10px] tracking-wider">Documentos</TableHead>
                    <TableHead className="text-right font-bold py-4 px-6 uppercase text-[10px] tracking-wider">Total Recaudado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allClosings.map((c) => (
                    <TableRow key={c.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-bold text-slate-700 px-6 py-4">
                        {c.dateString ? format(parseISO(c.dateString), "dd MMM yyyy", { locale: es }) : 'Reciente'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                          {c.sellerName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-600 font-mono">${c.cash?.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-slate-500 text-xs font-mono">
                        T: ${c.transfers?.toFixed(2)} <br/>
                        C: ${c.cards?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedClosingDocs(c.documents || [])}
                          className="h-8 font-black text-emerald-600 hover:text-emerald-700 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> 
                          {c.invoicesCount} F / {c.notesCount} N
                        </Button>
                      </TableCell>
                      <TableCell className="text-right font-black text-lg text-emerald-600 px-6 py-4 font-mono">${c.totalAmount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {allClosings.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center h-32 text-muted-foreground italic">No se han registrado cierres contables.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* MODAL PARA VER DOCUMENTOS */}
      <Dialog open={selectedClosingDocs !== null} onOpenChange={(open) => !open && setSelectedClosingDocs(null)}>
        <DialogContent className="max-w-3xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl bg-white">
          <DialogHeader className="p-6 bg-slate-50 border-b">
            <DialogTitle className="text-xl font-black text-slate-800">
              Desglose de Documentos
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {selectedClosingDocs && selectedClosingDocs.length > 0 ? (
              <div className="rounded-2xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-bold uppercase text-[10px]">Tipo</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Folio</TableHead>
                      <TableHead className="font-bold uppercase text-[10px]">Cliente</TableHead>
                      <TableHead className="text-right font-bold uppercase text-[10px] px-6">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedClosingDocs.map((d, i) => (
                      <TableRow key={i} className="hover:bg-slate-50/30 transition-colors">
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "font-bold text-[9px] px-2 py-0.5 rounded",
                            d.type === 'Factura' ? "bg-blue-50 text-blue-700 border-blue-100" : 
                            d.type === 'Nota de Venta' ? "bg-purple-50 text-purple-700 border-purple-100" : 
                            "bg-emerald-50 text-emerald-700 border-emerald-100"
                          )}>
                            {d.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-slate-600">{d.num}</TableCell>
                        <TableCell className="text-slate-700 font-semibold text-sm">{d.client}</TableCell>
                        <TableCell className="text-right font-black text-slate-900 px-6 font-mono">${d.amount?.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12 italic">No hay documentos registrados para esta caja.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
