"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Plus, 
  Trash2,
  TrendingUp,
  Calendar as CalendarIcon,
  DollarSign,
  Loader2,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, orderBy, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { format, parseISO, getMonth, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export default function InvestmentsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isClient, setIsClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentType, setPaymentType] = useState<"total" | "partial">("total");
  const [deposit, setDeposit] = useState<number>(0);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const investmentsRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "investments"), orderBy("date", "desc"));
  }, [db]);
  
  const { data: investments, loading: loadingData } = useCollection(investmentsRef);

  const filteredInvestments = useMemo(() => {
    if (!investments) return [];
    return investments.filter((i: any) => 
      (i.description || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [investments, searchTerm]);

  const stats = useMemo(() => {
    if (!investments) return { total: 0, currentMonth: 0 };
    const now = new Date();
    let total = 0;
    let currentMonth = 0;

    investments.forEach((inv: any) => {
      const v = inv.amount || 0;
      total += v;
      let d;
      try {
        d = typeof inv.date === 'string' ? parseISO(inv.date) : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
        if (isSameMonth(d, now) && d.getFullYear() === now.getFullYear()) {
          currentMonth += v;
        }
      } catch (e) {}
    });

    return { total, currentMonth };
  }, [investments]);

  const chartData = useMemo(() => {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentYear = new Date().getFullYear();
    const dataMap = monthNames.map(name => ({ name, value: 0 }));

    (investments || []).forEach((inv: any) => {
      try {
        const d = typeof inv.date === 'string' ? parseISO(inv.date) : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
        if (d.getFullYear() === currentYear) {
          const monthIndex = getMonth(d);
          dataMap[monthIndex].value += (inv.amount || 0);
        }
      } catch (e) {}
    });

    return dataMap;
  }, [investments]);

  const handleAddInvestment = async () => {
    if (!db) return;
    if (amount <= 0) {
      toast({ title: "Monto inválido", description: "El monto debe ser mayor a 0.", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Descripción requerida", description: "Ingrese el detalle de la inversión.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const actualDeposit = paymentType === "total" ? amount : deposit;
      const balance = Math.max(0, amount - actualDeposit);

      await addDoc(collection(db, "investments"), {
        amount,
        deposit: actualDeposit,
        balance,
        paymentType,
        description,
        date: new Date(date).toISOString(),
        createdAt: serverTimestamp()
      });
      toast({ title: "Inversión registrada exitosamente" });
      setIsModalOpen(false);
      setAmount(0);
      setDeposit(0);
      setPaymentType("total");
      setDescription("");
      setDate(format(new Date(), "yyyy-MM-dd"));
    } catch (error: any) {
      toast({ title: "Error al registrar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "investments", id));
      toast({ title: "Registro eliminado" });
    } catch (e) {
      errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `investments/${id}`, operation: 'delete' }));
    }
  };

  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      const d = typeof dateVal === 'string' ? parseISO(dateVal) : (dateVal.toDate ? dateVal.toDate() : new Date(dateVal));
      return format(d, "dd/MM/yyyy", { locale: es });
    } catch (e) {
      return "N/A";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900">Inversiones</h1>
          <p className="text-muted-foreground font-medium mt-1">Gestión de gastos e inversiones de capital.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-200 h-12 px-6 rounded-xl font-bold">
          <Plus className="mr-2 h-5 w-5" />
          Nueva Inversión
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-100 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Inversión Mensual (Mes Actual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">${stats.currentMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Inversión Total Histórica
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-gray-900">${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-white rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Flujo de Inversión Anual</CardTitle>
          <CardDescription>Resumen de inversiones por mes del año en curso</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px] pt-4">
          {isClient ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} 
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Inversión']}
                  contentStyle={{ backgroundColor: 'white', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                />
                <Bar 
                  dataKey="value" 
                  fill="hsl(235 80% 60%)" 
                  radius={[6, 6, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full bg-slate-50 animate-pulse rounded-xl" />
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/30 p-8">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
            <Input
              placeholder="Buscar por descripción..."
              className="pl-11 h-12 bg-white border-gray-100 focus:ring-indigo-500 rounded-2xl shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-50 bg-gray-50/10">
                  <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Fecha</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-gray-400">Descripción</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Costo Total</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Abonado</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-gray-400">Saldo</TableHead>
                  <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-gray-400">Estado</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filteredInvestments.length > 0 ? (
                  filteredInvestments.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-indigo-50/50 transition-all duration-300">
                      <TableCell className="px-8 text-gray-500 text-sm font-medium">
                        {formatDocDate(inv.date)}
                      </TableCell>
                      <TableCell className="font-bold text-gray-900">{inv.description}</TableCell>
                      <TableCell className="text-right px-8 font-black text-indigo-600 text-lg">
                        ${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right px-8 font-bold text-emerald-600">
                        ${(inv.deposit || (inv.amount || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right px-8 font-bold text-rose-600">
                        ${(inv.balance !== undefined ? inv.balance : 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={inv.balance === 0 || inv.balance === undefined ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"}>
                          {inv.balance === 0 || inv.balance === undefined ? "Pagado" : "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-10 w-10 rounded-xl">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No hay inversiones registradas.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={(open) => !loading && setIsModalOpen(open)}>
        <DialogContent className="rounded-3xl bg-white border-none shadow-2xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900">Nueva Inversión</DialogTitle>
            <DialogDescription className="font-bold text-slate-500">
              Registra un nuevo gasto de capital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Monto Total de Inversión ($)</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                <Input 
                  type="number" 
                  value={amount || ''} 
                  onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="pl-8 h-12 font-bold text-lg bg-slate-50 border-slate-200 rounded-xl"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Tipo de Pago</Label>
              <Select value={paymentType} onValueChange={(v: "total" | "partial") => setPaymentType(v)}>
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Pago Total Inmediato</SelectItem>
                  <SelectItem value="partial">Abono Inicial (Pago Parcial)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentType === "partial" && (
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Monto del Abono ($)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
                  <Input 
                    type="number" 
                    value={deposit || ''} 
                    onChange={(e) => setDeposit(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="pl-8 h-12 font-bold text-lg bg-indigo-50 border-indigo-100 text-indigo-700 rounded-xl"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs font-bold text-rose-500 text-right mt-1">Saldo pendiente: ${(amount - deposit).toFixed(2)}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Descripción</Label>
              <Input 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                className="h-12 font-medium bg-slate-50 border-slate-200 rounded-xl"
                placeholder="Ej. Compra de equipos..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">Fecha</Label>
              <Input 
                type="date"
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="h-12 font-medium bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={loading} className="rounded-xl h-12 font-bold border-slate-200">Cancelar</Button>
            <Button onClick={handleAddInvestment} disabled={loading || amount <= 0 || !description} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-8 font-bold shadow-lg shadow-indigo-200">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar Inversión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
