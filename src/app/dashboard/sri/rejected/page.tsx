"use client";

import { useState, useMemo } from "react";
import { 
  XCircle, 
  Search, 
  Edit, 
  AlertTriangle,
  Calendar,
  Loader2,
  Trash2,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, doc, deleteDoc, limit } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export default function RejectedInvoicesPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");

  // Eliminamos el orderBy de la consulta para evitar requerir un índice compuesto manual
  const invoicesRef = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, "invoices"), 
      where("status", "==", "Rechazado"),
      limit(100)
    );
  }, [db]);

  const { data: rejectedInvoices, loading } = useCollection(invoicesRef);

  const filtered = useMemo(() => {
    if (!rejectedInvoices) return [];
    
    // Filtramos por término de búsqueda y luego ordenamos en el cliente
    return rejectedInvoices
      .filter((inv: any) => {
        const customer = inv.clientData?.name || inv.customerName || "";
        const num = inv.invoiceNumber || "";
        const error = inv.sriError || "";
        const term = searchTerm.toLowerCase();
        
        return customer.toLowerCase().includes(term) || 
               num.toLowerCase().includes(term) ||
               error.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => {
        // Ordenamiento por fecha de actualización descendente (más reciente primero)
        const dateA = a.updatedAt?.toDate?.() || new Date(a.updatedAt || 0);
        const dateB = b.updatedAt?.toDate?.() || new Date(b.updatedAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
  }, [rejectedInvoices, searchTerm]);

  const handleDelete = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "invoices", id));
      toast({ title: "Registro eliminado" });
    } catch (e) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      if (typeof dateVal === 'string') return format(parseISO(dateVal), "dd/MM/yyyy", { locale: es });
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(d, "dd/MM/yyyy", { locale: es });
    } catch (e) { return "N/A"; }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900">Documentos Rechazados</h1>
          <p className="text-muted-foreground font-medium">Facturas que requieren corrección inmediata para validez legal.</p>
        </div>
      </div>

      <Alert variant="destructive" className="bg-rose-50 border-rose-200 text-rose-700 rounded-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs font-black uppercase tracking-tight">
          Importante: Los documentos en esta lista han sido procesados pero el SRI detectó errores en la información.
        </AlertDescription>
      </Alert>

      <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 p-8 border-b">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente o motivo de error..."
                className="pl-11 h-12 bg-white border-slate-100 rounded-2xl shadow-sm"
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
                <TableRow className="bg-slate-50/10">
                  <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">No. Factura</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Cliente</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Fecha Fallo</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Monto</TableHead>
                  <TableHead className="w-[350px] font-black uppercase text-[10px] tracking-widest text-slate-400">Motivo del Rechazo (SRI)</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filtered.length > 0 ? (
                  filtered.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-rose-50/20 transition-colors border-b last:border-0 group">
                      <TableCell className="px-8 font-mono text-xs font-bold text-rose-600">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-900">{inv.clientData?.name || "Consumidor Final"}</div>
                        <div className="text-[10px] text-slate-400">{inv.clientData?.ruc}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                         <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                           <Calendar className="h-3.5 w-3.5" /> 
                           {formatDocDate(inv.updatedAt)}
                         </div>
                      </TableCell>
                      <TableCell className="font-black text-slate-900">${(inv.total || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="bg-rose-100/50 p-3 rounded-xl border border-rose-200">
                          <p className="text-[11px] text-rose-700 font-bold leading-tight line-clamp-2">{inv.sriError || "Error desconocido en validación de campos."}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-8 space-x-1">
                        <Button variant="ghost" size="icon" asChild className="hover:bg-primary/10 text-primary" title="Corregir y Reintentar">
                          <Link href={`/dashboard/invoices/${inv.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="hover:bg-rose-100 text-rose-600" 
                          onClick={() => handleDelete(inv.id)}
                          title="Eliminar Intento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <p>No hay documentos rechazados. ¡Excelente trabajo!</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
