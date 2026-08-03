"use client";

import { useState, useMemo } from "react";
import { 
  Plus, 
  Search, 
  UserPlus, 
  Mail, 
  Lock, 
  Trash2, 
  Loader2,
  ShieldCheck,
  MoreHorizontal,
  User
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useFirestore, useCollection } from "@/firebase";
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export default function SalespeoplePage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });

  const salespeopleRef = useMemo(() => (db ? collection(db, "salespeople") : null), [db]);
  const { data: salespeople, loading } = useCollection(salespeopleRef);

  const filtered = useMemo(() => {
    if (!salespeople) return [];
    return salespeople.filter((s: any) => 
      (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
      (s.email || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [salespeople, searchTerm]);

  const handleAddSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    if (!newUser.name || !newUser.email || !newUser.password) {
      toast({ title: "Campos incompletos", description: "Todos los campos son obligatorios.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const userData = {
      name: newUser.name,
      email: newUser.email,
      password: newUser.password,
      status: "Activo",
      createdAt: serverTimestamp()
    };

    addDoc(collection(db, "salespeople"), userData)
      .then(() => {
        setIsDialogOpen(false);
        setNewUser({ name: "", email: "", password: "" });
        toast({ title: "Vendedor registrado", description: "La cuenta ha sido creada exitosamente en Firestore." });
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ 
          path: "salespeople", 
          operation: "create", 
          requestResourceData: userData 
        }));
      })
      .finally(() => setIsSaving(false));
  };

  const handleDelete = (id: string) => {
    if (!db) return;
    deleteDoc(doc(db, "salespeople", id))
      .then(() => {
        toast({ title: "Registro eliminado", description: "El acceso del vendedor ha sido revocado." });
      })
      .catch(async () => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({ 
          path: `salespeople/${id}`, 
          operation: "delete" 
        }));
      });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Gestión de Vendedores</h1>
          <p className="text-muted-foreground font-medium">Crea y administra las cuentas que acceden al panel de ventas.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary h-11 px-6 rounded-xl shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Vendedor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Registrar Vendedor</DialogTitle>
              <DialogDescription>
                Esta cuenta se guardará en tu Firestore y permitirá el acceso al panel de ventas.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSalesperson} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Nombre Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Ej: Roberto Sánchez" 
                    className="pl-10 h-11 rounded-xl"
                    value={newUser.name}
                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="email"
                    placeholder="vendedor@apminox.com" 
                    className="pl-10 h-11 rounded-xl"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="text"
                    placeholder="Crear contraseña..." 
                    className="pl-10 h-11 rounded-xl"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    required
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full h-11 rounded-xl bg-primary font-bold">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Habilitar Vendedor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-xl bg-white rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b bg-slate-50/50 p-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o correo..."
              className="pl-10 h-11 border-slate-200 rounded-xl bg-white shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="px-6 font-bold uppercase text-[10px] tracking-widest text-slate-500">Vendedor</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500">Email Acceso</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500">Contraseña</TableHead>
                  <TableHead className="text-center font-bold uppercase text-[10px] tracking-widest text-slate-500">Estado</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filtered.length > 0 ? (
                  filtered.map((person: any) => (
                    <TableRow key={person.id} className="border-b last:border-0 group hover:bg-slate-50/50 transition-colors">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs uppercase">
                            {person.name?.[0] || 'V'}
                          </div>
                          <span className="font-bold text-slate-900">{person.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 font-medium">{person.email}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-400 select-all">{person.password}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 uppercase text-[10px] font-bold tracking-tight">
                          {person.status || "Activo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl hover:bg-white shadow-sm transition-all border border-transparent hover:border-slate-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400">Acciones</DropdownMenuLabel>
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/5 cursor-pointer" onSelect={(e) => { e.preventDefault(); handleDelete(person.id); }}>
                              <Trash2 className="mr-3 h-4 w-4" /> Eliminar Acceso
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic">No hay vendedores registrados aún.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}