
"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Search, MoreHorizontal, Edit2, Trash2, DollarSign, Package, Save, Loader2, Layers, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection } from "@/firebase";
import { collection, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export default function ProductsPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", stock: "0", ivaRate: "15" });
  const [isSaving, setIsSaving] = useState(false);
  const [stockFilter, setStockFilter] = useState("all");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stockFilter]);

  useEffect(() => {
    setUserRole(localStorage.getItem('amec_user_role'));
  }, []);

  const productsRef = useMemo(() => (db ? collection(db, "products") : null), [db]);
  const { data: products, loading: productsLoading } = useCollection(productsRef);

  useEffect(() => {
    if (!isDialogOpen) {
      setEditingProduct(null);
      setNewProduct({ name: "", price: "", stock: "0", ivaRate: "15" });
      setIsSaving(false);
    }
  }, [isDialogOpen]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = searchTerm.toLowerCase();
    return products
      .filter((p: any) => {
        const matchesSearch = (p.name || "").toLowerCase().includes(term);
        const matchesStock = stockFilter === "all" 
          ? true 
          : stockFilter === "in-stock" 
            ? p.stock > 0 
            : (p.stock === 0 || p.stock === undefined);
        return matchesSearch && matchesStock;
      })
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [products, searchTerm, stockFilter]);

  const paginatedData = useMemo(() => {
    if (!filtered) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil((filtered?.length || 0) / itemsPerPage);

  const handleOpenDialog = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      setNewProduct({ 
        name: product.name || "", 
        price: product.price ? product.price.toString() : "",
        stock: product.stock !== undefined ? product.stock.toString() : "0",
        ivaRate: product.ivaRate !== undefined ? product.ivaRate.toString() : "15"
      });
    } else {
      setEditingProduct(null);
      setNewProduct({ name: "", price: "", stock: "0", ivaRate: "15" });
    }
    setIsDialogOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    if (!newProduct.name || !newProduct.price || newProduct.stock === "") {
      toast({
        title: "Campos incompletos",
        description: "Por favor ingresa nombre, precio y stock.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    const productData = {
      name: newProduct.name,
      price: parseFloat(newProduct.price),
      stock: parseInt(newProduct.stock) || 0,
      ivaRate: newProduct.ivaRate
    };

    if (editingProduct) {
      const docRef = doc(db, "products", editingProduct.id);
      updateDoc(docRef, productData)
        .then(() => {
          setIsDialogOpen(false);
          toast({ title: "Actualizado", description: "Producto modificado exitosamente." });
        })
        .catch((err) => {
          errorEmitter.emit("permission-error", new FirestorePermissionError({
            path: `products/${editingProduct.id}`,
            operation: "update",
            requestResourceData: productData,
          }));
        })
        .finally(() => {
          setIsSaving(false);
        });
    } else {
      addDoc(collection(db, "products"), productData)
        .then(() => {
          setIsDialogOpen(false);
          toast({ title: "Añadido", description: "Producto agregado al catálogo." });
        })
        .catch((err) => {
          errorEmitter.emit("permission-error", new FirestorePermissionError({
            path: "products",
            operation: "create",
            requestResourceData: productData,
          }));
        })
        .finally(() => {
          setIsSaving(false);
        });
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (!db) return;
    deleteDoc(doc(db, "products", id))
      .then(() => {
        toast({ title: "Eliminado", description: "Producto removido del catálogo." });
      })
      .catch(() => {
        errorEmitter.emit("permission-error", new FirestorePermissionError({
          path: `products/${id}`,
          operation: "delete",
        }));
      });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Catálogo de Productos</h1>
          <p className="text-muted-foreground font-medium">Gestión de nombres, precios y tarifas de IVA del catálogo.</p>
        </div>

        <Button 
          onClick={() => handleOpenDialog()}
          className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 h-11 px-6 rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      <Card className="border-none shadow-xl bg-white rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre..." 
                className="pl-10 h-11 bg-muted/30 border-none rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="h-11 bg-muted/30 border-none rounded-xl">
                  <SelectValue placeholder="Filtro de Inventario" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl">
                  <SelectItem value="all">Todo el Catálogo</SelectItem>
                  <SelectItem value="in-stock">En Stock (&gt; 0)</SelectItem>
                  <SelectItem value="out-of-stock">Agotados (0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-b">
                  <TableHead className="w-[80px] text-center font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Icono</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Producto / Servicio</TableHead>
                  <TableHead className="text-center font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Stock</TableHead>
                  <TableHead className="text-center font-bold uppercase text-[10px] tracking-widest text-muted-foreground">IVA</TableHead>
                  <TableHead className="text-right font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Precio</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell>
                  </TableRow>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((product: any) => (
                    <TableRow 
                      key={product.id} 
                      className="hover:bg-muted/10 transition-colors group cursor-pointer"
                      onClick={() => handleOpenDialog(product)}
                    >
                      <TableCell className="text-center">
                        <div className="h-9 w-9 bg-primary/5 text-primary rounded-lg flex items-center justify-center mx-auto group-hover:bg-primary group-hover:text-white transition-all">
                          <Package className="h-4 w-4" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-gray-800">{product.name}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {product.stock !== undefined ? (
                          <div className={cn("inline-flex items-center font-black text-[11px] px-2.5 py-1 rounded-md", product.stock <= 10 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                            {product.stock <= 10 && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {product.stock}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded",
                          product.ivaRate === "15" ? "bg-indigo-100 text-indigo-700 font-extrabold" :
                          product.ivaRate === "0" ? "bg-slate-100 text-slate-600" :
                          "bg-amber-100 text-amber-700"
                        )}>
                          {product.ivaRate === "No objeto" ? "No Objeto" :
                           product.ivaRate === "Exento" ? "Exento" :
                           product.ivaRate !== undefined ? `${product.ivaRate}%` : "15%"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center font-black text-primary text-lg">
                          <DollarSign className="h-4 w-4 mr-0.5 opacity-50" />
                          {(product.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-9 w-9 p-0 hover:bg-white shadow-sm transition-all rounded-lg">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl p-2 shadow-2xl border-gray-100">
                            <DropdownMenuLabel className="text-[10px] font-black uppercase text-gray-400">Acciones</DropdownMenuLabel>
                            {userRole === 'admin' ? (
                              <>
                                <DropdownMenuItem 
                                  className="rounded-lg cursor-pointer py-2.5"
                                  onSelect={(e) => { e.preventDefault(); handleOpenDialog(product); }}
                                >
                                  <Edit2 className="mr-2 h-4 w-4 text-primary" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="rounded-lg cursor-pointer py-2.5 text-destructive hover:bg-destructive/5"
                                  onSelect={(e) => { e.preventDefault(); handleDeleteProduct(product.id); }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem disabled className="rounded-lg py-2.5 text-muted-foreground text-xs italic">
                                Sólo administradores pueden editar/eliminar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                      No se encontraron productos registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-50 bg-slate-50/30">
              <div className="text-xs text-slate-500 font-medium">
                Mostrando {filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} productos
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="font-bold rounded-lg"
                >
                  Anterior
                </Button>
                <div className="flex items-center px-2 text-xs font-bold text-slate-400">
                  {currentPage} / {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="font-bold rounded-lg"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingProduct ? "Editar Producto" : "Nuevo Producto"}
            </DialogTitle>
            <DialogDescription>
              Ingrese los detalles del producto en el catálogo oficial.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase text-muted-foreground">Nombre / Descripción</Label>
              <Input 
                id="name" 
                placeholder="Ej: Licencia de Software Anual" 
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="rounded-xl h-12"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price" className="text-xs font-bold uppercase text-muted-foreground">Precio Base (Sin IVA)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="price" 
                    type="number" 
                    step="0.01"
                    placeholder="0.00" 
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="rounded-xl h-12 pl-10 font-bold"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock" className="text-xs font-bold uppercase text-muted-foreground">Stock Disponible</Label>
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="stock" 
                    type="number" 
                    placeholder="0" 
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                    className="rounded-xl h-12 pl-10 font-bold"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ivaRate" className="text-xs font-bold uppercase text-slate-500">Tarifa de IVA</Label>
              <Select 
                value={newProduct.ivaRate} 
                onValueChange={(val) => setNewProduct({ ...newProduct, ivaRate: val })}
              >
                <SelectTrigger className="h-12 rounded-xl border bg-white border-slate-200">
                  <SelectValue placeholder="Seleccione Tarifa IVA" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="15">Tarifa 15%</SelectItem>
                  <SelectItem value="0">Tarifa 0%</SelectItem>
                  <SelectItem value="No objeto">No objeto de IVA</SelectItem>
                  <SelectItem value="Exento">Exento de IVA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full h-12 rounded-xl bg-primary font-bold">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {editingProduct ? "Guardar Cambios" : "Añadir al Catálogo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="text-center pt-8 border-t border-slate-100">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Desarrollado por Palma Nexus Solutions</p>
      </div>
    </div>
  );
}
