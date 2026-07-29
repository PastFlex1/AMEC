"use client";

import { useState, useMemo } from "react";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Mail, 
  Download,
  Loader2,
  Trash2,
  Edit2,
  Save,
  Info
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useFirestore, useCollection } from "@/firebase";
import { collection, doc, deleteDoc, addDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { cn } from "@/lib/utils";
import { useCedulaSearch } from "@/hooks/useCedulaSearch";

export default function CustomersPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    ruc: "",
    address: "",
    email: "",
    phone: "",
    status: "Activo"
  });

  const { isSearchingCedula, fetchCedulaData } = useCedulaSearch();

  const customersRef = useMemo(() => (db ? query(collection(db, "customers"), orderBy("name", "asc"), limit(150)) : null), [db]);
  const { data: customers, loading } = useCollection(customersRef);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const term = searchTerm.toLowerCase();
    return customers.filter((c: any) => {
      const nameMatch = (c.name || "").toLowerCase().includes(term);
      const rucMatch = (c.ruc || "").toLowerCase().includes(term);
      return nameMatch || rucMatch;
    });
  }, [customers, searchTerm]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    const rucLen = newCustomer.ruc.length;
    if (rucLen !== 10 && rucLen !== 13) {
      toast({ title: "Identificación Inválida", description: "Debe ser de 10 o 13 dígitos.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const customerData = {
      ...newCustomer,
      createdAt: serverTimestamp()
    };

    addDoc(collection(db, "customers"), customerData)
      .then(() => {
        setIsDialogOpen(false);
        setNewCustomer({ name: "", ruc: "", address: "", email: "", phone: "", status: "Activo" });
        toast({ title: "Cliente registrado", description: "Guardado exitosamente." });
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: "customers", operation: "create", requestResourceData: customerData }));
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = (id: string) => {
    if (!db) return;
    deleteDoc(doc(db, "customers", id))
      .then(() => {
        toast({ title: "Cliente eliminado", description: "El registro ha sido removido." });
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ path: `customers/${id}`, operation: "delete" }));
      });
  };

  const getDocTypeInfo = (val: string) => {
    if (val.length === 0) return { text: "", isError: false };
    if (val.length === 10) return { text: "Es Cédula", isError: false };
    if (val.length === 13) return { text: "Es RUC", isError: false };
    return { text: "Ingrese un número de identidad correcto", isError: true };
  };

  const docInfo = getDocTypeInfo(newCustomer.ruc);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Directorio de Clientes</h1>
          <p className="text-muted-foreground font-medium">Gestione la base de datos de sus clientes y prospectos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Añadir Cliente</DialogTitle>
                <DialogDescription>
                  Ingrese los datos básicos para el registro del cliente.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddCustomer} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">R.U.C / C.I.</Label>
                  <Input 
                    placeholder="10 o 13 dígitos" 
                    maxLength={13}
                    value={newCustomer.ruc}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNewCustomer({...newCustomer, ruc: val});
                      if (val.length === 10) {
                        fetchCedulaData(val, (data) => setNewCustomer(prev => ({
                          ...prev, 
                          name: data.name || prev.name, 
                          address: data.address || prev.address, 
                          email: data.email || prev.email, 
                          phone: data.phone || prev.phone 
                        })));
                      }
                    }}
                    className="rounded-xl h-11"
                    required
                  />
                  {docInfo.text && (
                    <p className={cn(
                      "text-[10px] font-black uppercase pl-1",
                      docInfo.isError ? "text-destructive" : "text-primary"
                    )}>
                      {docInfo.text}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                    Razón Social / Nombre
                    {isSearchingCedula && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  </Label>
                  <Input 
                    placeholder="Nombre completo" 
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                    className="rounded-xl h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Email</Label>
                  <Input 
                    type="email"
                    placeholder="correo@ejemplo.com" 
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                    className="rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Dirección</Label>
                  <Input 
                    placeholder="Ubicación física" 
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})}
                    className="rounded-xl h-11"
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" className="w-full h-11 rounded-xl bg-primary font-bold">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Cliente
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden rounded-xl">
        <CardHeader className="pb-3 bg-slate-50/50 border-b">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o identificación..."
              className="pl-10 h-11 bg-white border-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/30">
                <TableHead className="px-6">Identificación</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Email / Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer: any) => (
                  <TableRow key={customer.id} className="hover:bg-slate-50/50 transition-colors border-b last:border-0">
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-slate-900">{customer.ruc}</span>
                        <span className="text-[9px] font-black uppercase text-slate-400">
                          {customer.ruc?.length === 13 ? 'RUC' : 'Cédula'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800">{customer.name}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">{customer.address}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Mail className="h-3.5 w-3.5 text-primary/60" /> {customer.email || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 uppercase text-[10px] font-black px-3 py-0.5">
                        {customer.status || 'Activo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl shadow-2xl">
                          <DropdownMenuLabel className="text-[10px] uppercase font-black text-slate-400">Acciones</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}><Edit2 className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:bg-destructive/5" onSelect={(e) => { e.preventDefault(); handleDelete(customer.id); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">No se encontraron clientes registrados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}