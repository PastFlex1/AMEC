
"use client";

import { useMemo, useState, useEffect } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { LowStockProducts } from "@/components/dashboard/low-stock-products";
import { 
  Target, 
  Users, 
  FilePlus, 
  Clock, 
  Plus,
  Search,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Zap,
  Star,
  DollarSign,
  Wallet,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import { Badge } from "@/components/ui/badge";

export default function SalesDashboard() {
  const db = useFirestore();
  const [userName, setUserName] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setUserName(localStorage.getItem('amec_user_name') || "Vendedor");
  }, []);

  // Referencias a colecciones
  const invoicesRef = useMemo(() => (db ? collection(db, "invoices") : null), [db]);
  const proformasRef = useMemo(() => (db ? collection(db, "proformas") : null), [db]);
  const salesNotesRef = useMemo(() => (db ? collection(db, "salesNotes") : null), [db]);

  // Obtenemos todos los datos para filtrar localmente por creador
  // (Esto evita configuraciones complejas de índices en esta etapa)
  const { data: invoices, loading: invLoading } = useCollection(invoicesRef);
  const { data: proformas, loading: profLoading } = useCollection(proformasRef);
  const { data: notes, loading: noteLoading } = useCollection(salesNotesRef);

  const stats = useMemo(() => {
    if (!userName) return { revenue: 0, count: 0, commission: 0, customers: 0 };

    const myInvoices = (invoices || []).filter((i: any) => i.createdBy === userName);
    const myProformas = (proformas || []).filter((p: any) => p.createdBy === userName);
    const myNotes = (notes || []).filter((n: any) => n.createdBy === userName);

    const allMyDocs = [...myInvoices, ...myProformas, ...myNotes];
    const revenue = allMyDocs.reduce((acc, doc: any) => acc + (doc.total || 0), 0);
    const commission = revenue * 0.05;

    // Conteo único de clientes por RUC
    const uniqueCustomers = new Set(allMyDocs.map((d: any) => d.clientData?.ruc || d.customerRuc || d.ruc)).size;

    return {
      revenue,
      count: allMyDocs.length,
      commission,
      customers: uniqueCustomers,
      invoicesCount: myInvoices.length,
      proformasCount: myProformas.length
    };
  }, [invoices, proformas, notes, userName]);

  const quickActions = [
    { title: "Nueva Factura", href: "/dashboard/invoices/new", icon: Plus, color: "bg-primary text-primary-foreground" },
    { title: "Crear Proforma", href: "/dashboard/proformas/new", icon: FilePlus, color: "bg-accent text-accent-foreground" },
    { title: "Nota de Venta", href: "/dashboard/sales-notes/new", icon: Zap, color: "bg-emerald-500 text-white" },
  ];

  if (!isClient) return null;

  const isLoading = invLoading || profLoading || noteLoading;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Welcome Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/90 to-accent p-8 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <Badge variant="outline" className="text-white border-white/30 bg-white/10 backdrop-blur-md px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              Panel de Rendimiento Personal
            </Badge>
            <h1 className="text-4xl font-black tracking-tighter">¡Hola, {userName}! 🚀</h1>
            <p className="text-primary-foreground/80 font-medium text-lg max-w-md">
              Has generado <strong>${stats.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> en comisiones hasta hoy.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action, i) => (
              <Button key={i} asChild className={`${action.color} border-none shadow-lg hover:scale-105 active:scale-95 transition-transform rounded-2xl h-14 px-6 font-bold`}>
                <Link href={action.href}>
                  <action.icon className="mr-2 h-5 w-5" />
                  {action.title}
                </Link>
              </Button>
            ))}
          </div>
        </div>
        {/* Abstract background shapes */}
        <div className="absolute top-[-20%] right-[-10%] h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[10%] h-48 w-48 rounded-full bg-accent/20 blur-2xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Mis Ventas Totales" 
          value={isLoading ? "..." : `$${stats.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
          description="Ventas brutas acumuladas"
          icon={TrendingUp}
          className="border-none shadow-xl bg-white hover:shadow-2xl transition-shadow"
        />
        <StatCard 
          title="Mi Comisión (5%)" 
          value={isLoading ? "..." : `$${stats.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
          description="Ganancia neta por ventas"
          icon={Wallet}
          className="border-none shadow-xl bg-emerald-50 text-emerald-900 border-l-4 border-l-emerald-500"
          trend={{ value: "5% fijo", positive: true }}
        />
        <StatCard 
          title="Documentos" 
          value={isLoading ? "..." : stats.count.toString()} 
          description="F + P + N emitidos"
          icon={FilePlus}
          className="border-none shadow-xl bg-white hover:shadow-2xl transition-shadow"
        />
        <StatCard 
          title="Mis Clientes" 
          value={isLoading ? "..." : stats.customers.toString()} 
          description="Cartera gestionada"
          icon={Users}
          className="border-none shadow-xl bg-white hover:shadow-2xl transition-shadow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-slate-800">Progreso de Comprobantes</CardTitle>
                <CardDescription className="font-medium">Distribución de documentos generados por ti</CardDescription>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <TrendingUp className="h-6 w-6 text-primary" />}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-10">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">Facturas SRI</p>
                    <p className="text-xs text-muted-foreground">{stats.invoicesCount} emitidas</p>
                  </div>
                </div>
                <span className="text-lg font-black text-slate-900">{stats.invoicesCount}</span>
              </div>
              <Progress value={stats.count > 0 ? (stats.invoicesCount / stats.count) * 100 : 0} className="h-3 bg-slate-100" />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <FilePlus className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">Proformas / Cotizaciones</p>
                    <p className="text-xs text-muted-foreground">{stats.proformasCount} en seguimiento</p>
                  </div>
                </div>
                <span className="text-lg font-black text-slate-900">{stats.proformasCount}</span>
              </div>
              <Progress value={stats.count > 0 ? (stats.proformasCount / stats.count) * 100 : 0} className="h-3 bg-slate-100" />
            </div>

            <div className="pt-6 border-t border-dashed flex justify-center">
              <Button variant="ghost" asChild className="text-primary font-bold hover:bg-primary/5 rounded-xl group h-12 px-6">
                <Link href="/dashboard/invoices">
                  Ver mi historial completo <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
            <CardTitle className="text-xl font-black text-slate-800">Info de Comisión</CardTitle>
            <CardDescription className="font-medium">Detalles de tu facturación</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-6 bg-emerald-500/5 m-6 rounded-2xl border border-emerald-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-emerald-600 tracking-widest">Saldo a Liquidar</p>
                  <p className="text-2xl font-black text-slate-900">${stats.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic leading-relaxed">
                * Tu comisión se calcula sobre el total de facturas, proformas y notas de venta emitidas bajo tu usuario.
              </p>
            </div>
            
            <div className="divide-y divide-slate-50">
              {[
                { label: "Check de Comprobantes", sub: "Valida tus facturas SRI", icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-50" },
                { label: "Soporte Vendedor", sub: "Acceso a ayuda rápida", icon: Star, color: "text-amber-500", bg: "bg-amber-50" },
              ].map((item, i) => (
                <div key={i} className="flex items-center p-6 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group">
                  <div className={`h-12 w-12 rounded-2xl ${item.bg} flex items-center justify-center shrink-0 mr-4 ${item.color} group-hover:scale-110 transition-transform`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 font-medium">{item.sub}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center bg-white shadow-sm">
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-8 mt-8">
        <LowStockProducts />
      </div>
      <div className="text-center pt-8 border-t border-slate-100">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Desarrollado por Palma Nexus Solutions</p>
      </div>
    </div>
  );
}
