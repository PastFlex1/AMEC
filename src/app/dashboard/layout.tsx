"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import Image from 'next/image';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarInset, SidebarInput, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { LogOut, Search, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<'admin' | 'sales' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const savedRole = localStorage.getItem('amec_user_role') as any;
      if (!savedRole) {
        router.push('/login');
      } else {
        setRole(savedRole);
      }
      // Tiempo de carga optimizado para permitir la sincronización inicial de Firebase
      const timer = setTimeout(() => setIsLoading(false), 1000);
      return () => clearTimeout(timer);
    };

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('amec_user_role');
    router.push('/login');
  };

  if (isLoading || !role) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] space-y-8 animate-in fade-in duration-700">
        <div className="relative h-40 w-40 drop-shadow-2xl bg-white rounded-[2rem] p-6 shadow-xl border border-slate-100">
          <Image 
            src="/Amec.png" 
            alt="Logo AMEC" 
            fill 
            className="object-contain p-4 animate-pulse" 
            priority
          />
        </div>
        <div className="flex flex-col items-center space-y-4 text-center px-6">
          <div className="flex items-center gap-3 text-slate-900 font-black uppercase tracking-tighter text-2xl">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span>Iniciando AMEC Cloud</span>
          </div>
          <div className="space-y-1">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Sincronizando base de datos en tiempo real</p>
            <p className="text-slate-400 text-[10px] font-medium italic">Preparando su entorno de trabajo...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r-0 shadow-2xl transition-all duration-300">
        <SidebarHeader className="space-y-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 relative shrink-0">
              <Image 
                src="/Amec.png" 
                alt="Logo AMEC" 
                fill 
                sizes="40px"
                className="object-contain" 
              />
            </div>
            <div className="group-data-[collapsible=icon]:hidden overflow-hidden">
              <span className="font-black text-xl tracking-tighter block leading-none truncate">AMEC</span>
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest truncate">Billing System</span>
            </div>
          </div>
          <div className="relative group-data-[collapsible=icon]:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <SidebarInput 
              placeholder="Buscar..." 
              className="pl-10 bg-slate-100 border-none h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/20 text-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          <SidebarNav role={role} searchQuery={searchQuery} />
        </SidebarContent>
        <SidebarFooter className="p-6 group-data-[collapsible=icon]:p-2 border-t border-slate-50">
          <div className="group-data-[collapsible=icon]:hidden mb-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase text-primary tracking-widest">Premium Support</span>
            </div>
            <p className="text-[10px] text-slate-500 font-bold leading-tight">Acceso prioritario activado.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-500 font-bold hover:text-destructive hover:bg-destructive/5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center h-12 rounded-xl"
              >
                <LogOut className="h-5 w-5 mr-3 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">Cerrar Sesión</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Seguro que quieres cerrar sesión?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se cerrará tu sesión actual y tendrás que volver a ingresar tus credenciales.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl">
                  Cerrar Sesión
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-[#f8fafc] flex flex-col min-w-0">
        <header className="h-16 sticky top-0 z-40 flex items-center justify-between px-6 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="h-9 w-9 border border-slate-200 bg-white shadow-sm hover:bg-slate-50 rounded-lg text-slate-600 transition-all" />
            <div className="flex flex-col">
              <div className="text-sm font-black text-slate-900 leading-none mb-0.5">
                Panel de Control
              </div>
              <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                Rol: {role === 'admin' ? 'Administrador' : 'Ventas'}
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-tighter">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Sistema en Línea
          </div>
        </header>

        <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </main>
        
        <footer className="p-8 border-t border-slate-100 bg-white/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">© 2024 AMEC Billing • v2.0</p>
            <p className="text-[9px] font-bold text-slate-400/80 uppercase tracking-tighter">Palma Nexus Solutions</p>
          </div>
          <div className="flex gap-6">
             <Link href="#" className="text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors tracking-widest">Soporte</Link>
             <Link href="#" className="text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-colors tracking-widest">Privacidad</Link>
          </div>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
