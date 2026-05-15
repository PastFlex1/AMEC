"use client";

import { useMemo, useState, useEffect } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { 
  TrendingUp, 
  Users, 
  FileText, 
  AlertCircle, 
  Plus, 
  Receipt,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from "next/link";
import { useFirestore, useCollection } from "@/firebase";
import { collection } from "firebase/firestore";
import { parseISO, getMonth } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminDashboard() {
  const db = useFirestore();
  const [activeSource, setActiveSource] = useState<string>("all");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const invoicesRef = useMemo(() => (db ? collection(db, "invoices") : null), [db]);
  const proformasRef = useMemo(() => (db ? collection(db, "proformas") : null), [db]);
  const salesNotesRef = useMemo(() => (db ? collection(db, "salesNotes") : null), [db]);
  const customersRef = useMemo(() => (db ? collection(db, "customers") : null), [db]);
  
  const { data: invoices } = useCollection(invoicesRef);
  const { data: proformas } = useCollection(proformasRef);
  const { data: salesNotes } = useCollection(salesNotesRef);
  const { data: customers } = useCollection(customersRef);

  const allSales = useMemo(() => {
    return [
      ...(invoices || []).map(i => ({ ...i, type: 'Factura' })),
      ...(proformas || []).map(p => ({ ...p, type: 'Proforma' })),
      ...(salesNotes || []).map(n => ({ ...n, type: 'Nota de Venta' }))
    ];
  }, [invoices, proformas, salesNotes]);

  const filteredSales = useMemo(() => {
    if (activeSource === "all") return allSales;
    return allSales.filter((s: any) => s.type === activeSource);
  }, [allSales, activeSource]);

  const stats = useMemo(() => {
    const revenue = filteredSales.reduce((acc, sale: any) => acc + (sale.total || 0), 0);
    const pendingCount = filteredSales.filter((s: any) => 
      !['autorizado', 'pagado', 'aceptada'].includes((s.status || "").toLowerCase())
    ).length;
    
    return {
      revenue,
      pendingCount,
      customersCount: customers?.length || 0,
      totalDocs: filteredSales.length
    };
  }, [filteredSales, customers]);

  const chartData = useMemo(() => {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentYear = new Date().getFullYear();
    const dataMap = monthNames.map(name => ({ name, revenue: 0 }));

    filteredSales.forEach((sale: any) => {
      try {
        let date;
        if (sale.date?.toDate) {
          date = sale.date.toDate();
        } else if (typeof sale.date === 'string') {
          date = parseISO(sale.date);
        } else {
          date = new Date(sale.date || 0);
        }

        if (date.getFullYear() === currentYear) {
          const monthIndex = getMonth(date);
          dataMap[monthIndex].revenue += (sale.total || 0);
        }
      } catch (e) {}
    });

    return dataMap;
  }, [filteredSales]);

  const recentActivity = useMemo(() => {
    return [...allSales]
      .sort((a: any, b: any) => {
        const dateA = a.date?.toDate?.() || new Date(a.date || 0);
        const dateB = b.date?.toDate?.() || new Date(b.date || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);
  }, [allSales]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Panel Ejecutivo</h1>
          <p className="text-muted-foreground font-medium">Análisis de rendimiento comercial y facturación.</p>
        </div>
        <div className="flex gap-3">
          <Button asChild className="shadow-lg h-11 px-6 rounded-xl">
            <Link href="/dashboard/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              Nueva Factura
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title={`Ingresos ${activeSource === 'all' ? 'Consolidados' : activeSource + 's'}`} 
          value={`$${stats.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
          description={activeSource === 'all' ? "Total de todas las fuentes" : `Total en ${activeSource}s`}
          icon={TrendingUp}
          trend={{ value: "En vivo", positive: true }}
          className="border-none shadow-sm"
        />
        <StatCard 
          title="Clientes" 
          value={stats.customersCount.toString()} 
          description="Registros en base"
          icon={Users}
          className="border-none shadow-sm"
        />
        <StatCard 
          title="Documentos" 
          value={stats.totalDocs.toString()} 
          description={activeSource === 'all' ? 'F + P + N' : activeSource + 's'}
          icon={FileText}
          className="border-none shadow-sm"
        />
        <StatCard 
          title="Seguimientos" 
          value={stats.pendingCount.toString()} 
          description="Por gestionar"
          icon={AlertCircle}
          className="border-none shadow-sm border-l-4 border-l-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-2xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold">Resumen de Ingresos Mensuales</CardTitle>
              <CardDescription>Crecimiento basado en documentos de {new Date().getFullYear()}</CardDescription>
            </div>
            <Tabs defaultValue="all" value={activeSource} onValueChange={setActiveSource} className="w-full sm:w-auto">
              <TabsList className="bg-slate-100 p-1 h-10 rounded-xl">
                <TabsTrigger value="all" className="text-[10px] uppercase font-bold px-4">Todo</TabsTrigger>
                <TabsTrigger value="Factura" className="text-[10px] uppercase font-bold px-4">Facturas</TabsTrigger>
                <TabsTrigger value="Proforma" className="text-[10px] uppercase font-bold px-4">Proformas</TabsTrigger>
                <TabsTrigger value="Nota de Venta" className="text-[10px] uppercase font-bold px-4">Notas</TabsTrigger>
              </TabsList>
            </Tabs>
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
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ingresos']}
                    contentStyle={{ backgroundColor: 'white', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill={
                      activeSource === 'Factura' ? 'hsl(var(--primary))' : 
                      activeSource === 'Proforma' ? 'hsl(235 80% 60%)' : 
                      activeSource === 'Nota de Venta' ? 'hsl(173 58% 39%)' : 
                      'hsl(var(--primary))'
                    } 
                    radius={[6, 6, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full bg-slate-50 animate-pulse rounded-xl" />
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden bg-white rounded-2xl">
          <CardHeader className="bg-slate-50/50 p-6 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Actividad Reciente</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-primary" asChild>
                <Link href="/dashboard/invoices">Ver Todo</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentActivity.length > 0 ? recentActivity.map((sale: any, i) => (
                <div key={sale.id || i} className="flex items-start gap-4 p-5 hover:bg-slate-50 transition-colors">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    sale.type === 'Factura' ? 'bg-primary/10 text-primary' :
                    sale.type === 'Proforma' ? 'bg-indigo-500/10 text-indigo-600' :
                    'bg-emerald-500/10 text-emerald-600'
                  }`}>
                    {sale.type === 'Factura' ? <FileText className="h-5 w-5" /> : 
                     sale.type === 'Proforma' ? <FileSpreadsheet className="h-5 w-5" /> : 
                     <Receipt className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {sale.clientData?.name || sale.customerName || "Consumidor Final"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-black uppercase tracking-tight opacity-50">{sale.type}</span>
                      <span className="text-[10px] font-bold text-slate-400">•</span>
                      <span className="text-[10px] font-bold text-slate-400">{sale.invoiceNumber || sale.proformaNumber || sale.noteNumber || "Interno"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">${(sale.total || 0).toFixed(2)}</p>
                    <p className="text-[9px] font-black uppercase text-emerald-500">Reciente</p>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-muted-foreground italic text-sm">Sin actividad registrada.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
