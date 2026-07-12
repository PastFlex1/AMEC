"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  FileText, 
  User, 
  Wallet,
  Calendar as CalendarIcon,
  Loader2,
  FileDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFirestore, useCollection } from "@/firebase";
import { collection } from "firebase/firestore";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateMonthlyReportPDF, generateWeeklyReportPDF } from "@/lib/pdf-service";
import { parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, format } from "date-fns";
import { es } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b'];

const MONTHS = [
  { value: "0", label: "Enero" },
  { value: "1", label: "Febrero" },
  { value: "2", label: "Marzo" },
  { value: "3", label: "Abril" },
  { value: "4", label: "Mayo" },
  { value: "5", label: "Junio" },
  { value: "6", label: "Julio" },
  { value: "7", label: "Agosto" },
  { value: "8", label: "Septiembre" },
  { value: "9", label: "Octubre" },
  { value: "10", label: "Noviembre" },
  { value: "11", label: "Diciembre" },
];

export default function ReportsPage() {
  const db = useFirestore();
  const [isClient, setIsClient] = useState(false);
  
  // Monthly State
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().getMonth().toString());
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [isGeneratingMonthly, setIsGeneratingMonthly] = useState(false);

  // Weekly State
  const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(new Date());
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const invoicesRef = useMemo(() => (db ? collection(db, "invoices") : null), [db]);
  const proformasRef = useMemo(() => (db ? collection(db, "proformas") : null), [db]);
  const salesNotesRef = useMemo(() => (db ? collection(db, "salesNotes") : null), [db]);

  const { data: invoices } = useCollection(invoicesRef);
  const { data: proformas } = useCollection(proformasRef);
  const { data: notes } = useCollection(salesNotesRef);

  const allDocs = useMemo(() => [
    ...(invoices || []).map(i => ({ ...i, type: 'Factura' })),
    ...(proformas || []).map(p => ({ ...p, type: 'Proforma' })),
    ...(notes || []).map(n => ({ ...n, type: 'Nota de Venta' }))
  ], [invoices, proformas, notes]);

  // --- LÓGICA MENSUAL ---
  const monthlyFilteredDocs = useMemo(() => {
    return allDocs.filter((doc: any) => {
      try {
        const date = doc.date?.toDate ? doc.date.toDate() : (typeof doc.date === 'string' ? parseISO(doc.date) : new Date(doc.date));
        return date.getMonth().toString() === selectedMonth && date.getFullYear().toString() === selectedYear && doc.status !== 'Anulada';
      } catch (e) {
        return false;
      }
    });
  }, [allDocs, selectedMonth, selectedYear]);

  const monthlyStats = useMemo(() => {
    const facturasTotal = monthlyFilteredDocs.filter(d => d.type === 'Factura').reduce((acc, d: any) => acc + (d.total || 0), 0);
    const notesTotal = monthlyFilteredDocs.filter(d => d.type === 'Nota de Venta').reduce((acc, d: any) => acc + (d.total || 0), 0);
    const proformasTotal = monthlyFilteredDocs.filter(d => d.type === 'Proforma').reduce((acc, d: any) => acc + (d.total || 0), 0);
    
    const totalRev = facturasTotal + notesTotal; 
    const count = monthlyFilteredDocs.filter(d => d.type !== 'Proforma').length;
    const totalCommission = totalRev * 0.05;
    
    return { totalRev, count, totalCommission, facturasTotal, proformasTotal, notesTotal };
  }, [monthlyFilteredDocs]);

  const performanceBySalesperson = useMemo(() => {
    const map: Record<string, any> = {};
    
    monthlyFilteredDocs.forEach((doc: any) => {
      const seller = doc.createdBy || 'Admin / No asignado';
      if (!map[seller]) {
        map[seller] = { 
          name: seller, 
          total: 0, 
          count: 0,
          invoicesCount: 0,
          proformasCount: 0,
          notesCount: 0
        };
      }
      
      if (doc.type !== 'Proforma') {
        map[seller].total += (doc.total || 0);
        map[seller].count += 1;
      }
      
      if (doc.type === 'Factura') map[seller].invoicesCount += 1;
      else if (doc.type === 'Proforma') map[seller].proformasCount += 1;
      else if (doc.type === 'Nota de Venta') map[seller].notesCount += 1;
    });

    return Object.values(map)
      .map(s => ({ ...s, commission: s.total * 0.05 }))
      .sort((a, b) => b.total - a.total);
  }, [monthlyFilteredDocs]);

  const typeDistribution = useMemo(() => {
    const invCount = monthlyFilteredDocs.filter(d => d.type === 'Factura').length;
    const proCount = monthlyFilteredDocs.filter(d => d.type === 'Proforma').length;
    const noteCount = monthlyFilteredDocs.filter(d => d.type === 'Nota de Venta').length;
    
    return [
      { name: 'Facturas', value: invCount },
      { name: 'Notas', value: noteCount },
      { name: 'Proformas (Ref)', value: proCount },
    ].filter(t => t.value > 0);
  }, [monthlyFilteredDocs]);

  const handleDownloadMonthlyReport = () => {
    setIsGeneratingMonthly(true);
    try {
      const monthName = MONTHS.find(m => m.value === selectedMonth)?.label || "Mes";
      generateMonthlyReportPDF({
        monthName,
        year: selectedYear,
        stats: monthlyStats,
        performance: performanceBySalesperson as any
      });
    } finally {
      setIsGeneratingMonthly(false);
    }
  };

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  }, []);

  // --- LÓGICA SEMANAL ---
  const weekStart = startOfWeek(selectedWeekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeekDate, { weekStartsOn: 1 });
  
  const weeklyFilteredDocs = useMemo(() => {
    return allDocs.filter((doc: any) => {
      try {
        const date = doc.date?.toDate ? doc.date.toDate() : (typeof doc.date === 'string' ? parseISO(doc.date) : new Date(doc.date));
        return date >= weekStart && date <= weekEnd && doc.status !== 'Anulada' && doc.type !== 'Proforma';
      } catch (e) {
        return false;
      }
    });
  }, [allDocs, weekStart, weekEnd]);

  const weeklyStats = useMemo(() => {
    let concretadasCount = 0, concretadasTotal = 0;
    let abonadasCount = 0, abonadasTotal = 0, abonadasCobrado = 0;
    let pendientesCount = 0, pendientesTotal = 0;
    let totalSaldoPendiente = 0;
    
    weeklyFilteredDocs.forEach((doc: any) => {
      const stat = (doc.status || "").toLowerCase();
      const bal = Number(doc.balance || 0);
      const dep = Number(doc.deposit || 0);
      const tot = Number(doc.total || 0);
      
      let finalStatus = "Pendiente";
      if (stat === 'pagado' || stat === 'concretada' || stat === 'cancelado' || bal <= 0) {
        finalStatus = "Concretada";
      } else if (stat === 'abonado' || (dep > 0 && bal > 0)) {
        finalStatus = "Abonada";
      } else {
        finalStatus = "Pendiente";
      }

      if (doc.type !== 'Proforma') {
        if (finalStatus === "Concretada") {
          concretadasCount++;
          concretadasTotal += tot;
        } else if (finalStatus === "Abonada") {
          abonadasCount++;
          abonadasTotal += tot;
          abonadasCobrado += dep;
        } else {
          pendientesCount++;
          pendientesTotal += tot;
        }
        
        totalSaldoPendiente += bal;
      }
    });

    return { 
      concretadasCount, concretadasTotal, 
      abonadasCount, abonadasTotal, abonadasCobrado, 
      pendientesCount, pendientesTotal,
      totalVentas: concretadasTotal + abonadasCobrado,
      totalCount: concretadasCount + abonadasCount + pendientesCount,
      totalSaldoPendiente
    };
  }, [weeklyFilteredDocs]);

  const handleDownloadWeeklyReport = () => {
    setIsGeneratingWeekly(true);
    try {
      generateWeeklyReportPDF({
        weekStart: format(weekStart, "dd MMM yyyy", { locale: es }),
        weekEnd: format(weekEnd, "dd MMM yyyy", { locale: es }),
        stats: weeklyStats,
        items: weeklyFilteredDocs
      });
    } finally {
      setIsGeneratingWeekly(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900">Reportes de Ventas</h1>
        <p className="text-muted-foreground font-medium">Análisis de facturación y estados de cobro.</p>
      </div>

      <Tabs defaultValue="mensual" className="w-full">
        <TabsList className="grid w-[400px] grid-cols-2 mb-8 bg-slate-100 p-1 rounded-2xl">
          <TabsTrigger value="mensual" className="rounded-xl font-bold">Reporte Mensual</TabsTrigger>
          <TabsTrigger value="semanal" className="rounded-xl font-bold">Reporte Semanal</TabsTrigger>
        </TabsList>
        
        {/* PESTAÑA MENSUAL */}
        <TabsContent value="mensual" className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-32 h-10 border-none bg-slate-50 font-bold focus:ring-0">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-24 h-10 border-none bg-slate-50 font-bold focus:ring-0">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="h-8 w-px bg-slate-100 hidden sm:block mx-2" />
              <Button 
                onClick={handleDownloadMonthlyReport} 
                className="bg-primary hover:bg-primary/90 h-10 rounded-xl font-bold px-6 shadow-lg shadow-primary/20"
                disabled={isGeneratingMonthly || (monthlyStats.facturasTotal === 0 && monthlyStats.notesTotal === 0)}
              >
                {isGeneratingMonthly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Descargar Reporte (PDF)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Facturas del Mes" 
              value={`$${monthlyStats.facturasTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description="Comprobantes SRI"
              icon={TrendingUp}
              className="border-none shadow-xl bg-gradient-to-br from-primary to-primary/80 text-white"
            />
            <StatCard 
              title="Notas de Venta" 
              value={`$${monthlyStats.notesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description="Venta Interna Real"
              icon={Wallet}
              className="border-none shadow-xl bg-cyan-600 text-white"
            />
            <StatCard 
              title="Comisiones (5%)" 
              value={`$${monthlyStats.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description="Sobre Ventas Reales"
              icon={Users}
              className="border-none shadow-xl bg-emerald-500 text-white"
            />
            <StatCard 
              title="Proformas (Ref)" 
              value={`$${monthlyStats.proformasTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description="Sólo Informativo"
              icon={FileText}
              className="border-none shadow-sm bg-white text-slate-400 opacity-60"
            />
          </div>

          {monthlyStats.facturasTotal === 0 && monthlyStats.notesTotal === 0 ? (
            <Card className="border-none shadow-sm bg-slate-50 border-2 border-dashed flex flex-col items-center justify-center p-20 text-center space-y-4">
              <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-300">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Sin ventas reales en este mes</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Selecciona otro mes para ver el rendimiento del equipo.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50/50 p-8 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-800">Mejores Vendedores (Venta Real)</CardTitle>
                        <CardDescription>Ranking basado únicamente en Facturas y Notas de Venta.</CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold px-3 py-1">Ventas Reales</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="h-[350px]">
                      {isClient ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={performanceBySalesperson} layout="vertical" margin={{ left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                            <XAxis type="number" hide />
                            <YAxis 
                              dataKey="name" 
                              type="category" 
                              axisLine={false} 
                              tickLine={false} 
                              width={120} 
                              tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }} 
                            />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(val: any) => [`$${val.toLocaleString()}`, 'Venta Real']}
                            />
                            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full w-full bg-slate-50 animate-pulse rounded-xl" />
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="bg-slate-50/50 p-8 border-b">
                    <CardTitle className="text-xl font-bold text-slate-800">Distribución Mensual</CardTitle>
                    <CardDescription>Mix de documentos en el periodo.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 flex flex-col items-center justify-center">
                    <div className="h-[300px] w-full">
                      {isClient ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={typeDistribution}
                              innerRadius={65}
                              outerRadius={85}
                              paddingAngle={8}
                              dataKey="value"
                            >
                              {typeDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-40 w-40 rounded-full border-8 border-slate-100 border-t-primary animate-spin" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-none shadow-sm bg-white rounded-2xl">
                <CardHeader className="p-8 border-b bg-slate-50/20">
                  <CardTitle className="text-xl font-bold text-slate-800">Arquitectura de Cierre Mensual</CardTitle>
                  <CardDescription>Detalle de documentos con valor comercial por integrante.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50 border-b">
                        <tr>
                          <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500">Personal</th>
                          <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-center">Facturas</th>
                          <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-center">Notas</th>
                          <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Comisión (5%)</th>
                          <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Venta Real</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {performanceBySalesperson.map((seller, i) => (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-6">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] text-slate-500">
                                  {seller.name.charAt(0)}
                                </div>
                                <span className="font-bold text-slate-900">{seller.name}</span>
                              </div>
                            </td>
                            <td className="p-6 text-center font-medium text-slate-600">{seller.invoicesCount}</td>
                            <td className="p-6 text-center font-medium text-slate-600">{seller.notesCount}</td>
                            <td className="p-6 text-right font-black text-emerald-600">
                              ${(seller.commission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-6 text-right font-black text-slate-900 text-lg">
                              ${seller.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* PESTAÑA SEMANAL */}
        <TabsContent value="semanal" className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 px-2">
                <Button variant="ghost" size="icon" onClick={() => setSelectedWeekDate(subWeeks(selectedWeekDate, 1))}>
                  <ChevronLeft className="h-5 w-5 text-slate-500" />
                </Button>
                <div className="flex flex-col items-center min-w-[160px]">
                  <span className="text-sm font-bold text-slate-800">
                    {format(weekStart, "dd MMM", { locale: es })} - {format(weekEnd, "dd MMM yyyy", { locale: es })}
                  </span>
                  <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Semana Seleccionada</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedWeekDate(addWeeks(selectedWeekDate, 1))}>
                  <ChevronRight className="h-5 w-5 text-slate-500" />
                </Button>
              </div>
              <div className="h-8 w-px bg-slate-100 hidden sm:block mx-2" />
              <Button 
                onClick={() => setSelectedWeekDate(new Date())}
                variant="outline" 
                className="h-10 rounded-xl font-bold"
              >
                Esta Semana
              </Button>
              <Button 
                onClick={handleDownloadWeeklyReport} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-10 rounded-xl font-bold px-6 shadow-lg shadow-indigo-500/30"
                disabled={isGeneratingWeekly || weeklyStats.totalCount === 0}
              >
                {isGeneratingWeekly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Descargar Reporte Semanal (PDF)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              title="Ventas Concretadas" 
              value={`$${weeklyStats.concretadasTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description={`${weeklyStats.concretadasCount} docs pagados`}
              icon={CheckCircle2}
              className="border-none shadow-xl bg-emerald-50 text-emerald-900 border-l-4 border-l-emerald-500"
            />
            <StatCard 
              title="Abonos Recaudados" 
              value={`$${weeklyStats.abonadasCobrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description={`${weeklyStats.abonadasCount} docs con abono`}
              icon={TrendingUp}
              className="border-none shadow-xl bg-amber-50 text-amber-900 border-l-4 border-l-amber-500"
            />
            <StatCard 
              title="Saldo Pendiente Total" 
              value={`$${weeklyStats.totalSaldoPendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
              description="Por cobrar en total"
              icon={Wallet}
              className="border-none shadow-xl bg-rose-50 text-rose-900 border-l-4 border-l-rose-500"
            />
          </div>

          {weeklyStats.totalCount === 0 ? (
            <Card className="border-none shadow-sm bg-slate-50 border-2 border-dashed flex flex-col items-center justify-center p-20 text-center space-y-4">
              <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-300">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Sin ventas en esta semana</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Selecciona otra semana o registra nuevas ventas.</p>
              </div>
            </Card>
          ) : (
            <Card className="border-none shadow-sm bg-white rounded-2xl">
              <CardHeader className="p-8 border-b bg-slate-50/20">
                <CardTitle className="text-xl font-bold text-slate-800">Detalle de Ventas de la Semana</CardTitle>
                <CardDescription>Resumen de todas las ventas (Facturas y Notas de Venta).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50 border-b">
                      <tr>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500">Documento</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500">Cliente</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500">Fecha</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-center">Estado</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Abono</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Saldo</th>
                        <th className="p-6 font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {weeklyFilteredDocs.map((doc: any, i: number) => {
                        const dateFormatted = doc.date?.toDate 
                          ? format(doc.date.toDate(), "dd/MM/yyyy") 
                          : typeof doc.date === 'string' ? format(parseISO(doc.date), "dd/MM/yyyy") : "";
                        
                        const stat = (doc.status || "").toLowerCase();
                        const bal = Number(doc.balance || 0);
                        const dep = Number(doc.deposit || 0);
                        
                        let badgeColor = "bg-rose-100 text-rose-700";
                        let statusText = "Pendiente";
                        
                        if (doc.type === 'Proforma') {
                          badgeColor = "bg-slate-100 text-slate-700";
                          statusText = "Cotización";
                        } else if (stat === 'pagado' || stat === 'concretada' || stat === 'cancelado' || bal <= 0) {
                          badgeColor = "bg-emerald-100 text-emerald-700";
                          statusText = "Al Día (Pagado)";
                        } else if (stat === 'abonado' || (dep > 0 && bal > 0)) {
                          badgeColor = "bg-amber-100 text-amber-700";
                          statusText = "Abonado";
                        }

                        return (
                          <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-6">
                              <span className="font-bold text-slate-900">{doc.type}</span>
                              <div className="text-xs text-slate-500">{doc.noteNumber || doc.docNumber || 'S/N'}</div>
                            </td>
                            <td className="p-6 font-medium text-slate-700">
                              {doc.clientData?.name || doc.client?.name || 'Consumidor Final'}
                            </td>
                            <td className="p-6 text-sm text-slate-600">{dateFormatted}</td>
                            <td className="p-6 text-center">
                              <Badge className={`${badgeColor} border-none`}>{statusText}</Badge>
                            </td>
                            <td className="p-6 text-right text-slate-600">
                              ${Number(doc.deposit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-6 text-right text-slate-600">
                              ${Number(doc.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-6 text-right font-black text-slate-900">
                              ${Number(doc.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
