"use client";

import { useState, useEffect, useMemo } from "react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, orderBy, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { Package, CalendarIcon, ArrowDownToLine, Loader2, Save, FileText, CheckCircle2 } from "lucide-react";

export default function InventoryIntakePage() {
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [loadingRole, setLoadingRole] = useState(true);

  // Form states
  const [date, setDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState<number | "">("");
  const [reference, setReference] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    const savedRole = localStorage.getItem('amec_user_role');
    const savedName = localStorage.getItem('amec_user_name') || 'Admin';
    if (savedRole !== 'admin') {
      router.push('/dashboard');
      toast({ title: "Acceso denegado", description: "Esta sección es solo para administradores.", variant: "destructive" });
    } else {
      setRole(savedRole);
      setUserName(savedName);
      setLoadingRole(false);
    }
  }, [router, toast]);

  // Load Products
  const productsRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "products"));
  }, [db]);
  const { data: products, loading: loadingProducts } = useCollection(productsRef);

  // Load Intakes History
  const intakesRef = useMemo(() => {
    if (!db) return null;
    return query(collection(db, "inventoryIntakes"), orderBy("createdAt", "desc"));
  }, [db]);
  const { data: intakes, loading: loadingIntakes } = useCollection(intakesRef);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p: any) => 
      (p.name || "").toLowerCase().includes(productSearch.toLowerCase())
    ).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [products, productSearch]);

  const paginatedIntakes = useMemo(() => {
    if (!intakes) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return intakes.slice(startIndex, startIndex + itemsPerPage);
  }, [intakes, currentPage]);

  const totalPages = Math.ceil((intakes?.length || 0) / itemsPerPage);

  const handleSaveIntake = async () => {
    if (!db || !selectedProduct || !quantity || quantity <= 0) {
      toast({ title: "Campos incompletos", description: "Selecciona un producto y una cantidad válida.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      // 1. Guardar el registro de ingreso
      const intakeData = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: Number(quantity),
        reference: reference,
        intakeDate: date,
        createdAt: serverTimestamp(),
        createdBy: userName
      };
      await addDoc(collection(db, "inventoryIntakes"), intakeData);

      // 2. Actualizar el stock del producto usando increment
      const productDocRef = doc(db, "products", selectedProduct.id);
      await updateDoc(productDocRef, {
        stock: increment(Number(quantity))
      });

      toast({ title: "Ingreso Exitoso", description: `Se añadieron ${quantity} unidades a ${selectedProduct.name}.` });
      
      // Limpiar formulario
      setSelectedProduct(null);
      setQuantity("");
      setReference("");
      setProductSearch("");
      setDate(new Date());

    } catch (error) {
      console.error("Error guardando ingreso:", error);
      toast({ title: "Error", description: "No se pudo procesar el ingreso de mercadería.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(d, "dd MMM yyyy, HH:mm", { locale: es });
    } catch (e) {
      return "N/A";
    }
  };

  if (loadingRole) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
          <ArrowDownToLine className="h-8 w-8 text-indigo-600" /> Ingreso de Mercadería
        </h1>
        <p className="text-muted-foreground mt-2">Registra la llegada de nuevos productos para actualizar automáticamente el inventario.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMNA IZQUIERDA: FORMULARIO */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-indigo-50 border-b border-indigo-100 p-6">
              <h2 className="text-lg font-black text-indigo-900 flex items-center gap-2">
                <Package className="h-5 w-5" /> Nuevo Ingreso
              </h2>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Fecha de Llegada</Label>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start bg-slate-50 h-11 border-slate-200">
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      {format(date, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setIsCalendarOpen(false); } }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Producto</Label>
                <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start h-12 text-left bg-slate-50 border-slate-200 shadow-sm", !selectedProduct && "text-muted-foreground")}>
                      <Package className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{selectedProduct ? selectedProduct.name : "Seleccionar producto..."}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[300px] md:w-[400px]" align="start">
                    <div className="p-2 border-b">
                      <Input 
                        placeholder="Buscar producto por nombre..." 
                        value={productSearch} 
                        onChange={(e) => setProductSearch(e.target.value)} 
                        className="border-none bg-slate-50"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-1">
                      {loadingProducts ? (
                        <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">No se encontraron productos.</div>
                      ) : (
                        filteredProducts.map((p: any) => (
                          <button 
                            key={p.id} 
                            className="w-full text-left px-3 py-3 hover:bg-indigo-50 rounded-lg flex justify-between items-center transition-colors mb-1" 
                            onClick={() => { setSelectedProduct(p); setIsProductPopoverOpen(false); }}
                          >
                            <span className="font-semibold text-sm truncate pr-2">{p.name}</span>
                            <Badge variant="outline" className={cn("shrink-0 text-[10px]", p.stock <= 5 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                              Stock Actual: {p.stock || 0}
                            </Badge>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Cantidad Ingresada</Label>
                <Input 
                  type="number" 
                  min="1"
                  placeholder="Ej: 50"
                  className="h-12 text-lg font-black bg-slate-50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Referencia / Factura Compra <span className="lowercase text-[10px] font-normal text-slate-400">(Opcional)</span></Label>
                <Input 
                  placeholder="Ej: FAC-001-Proveedor"
                  className="h-11 bg-slate-50"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <Button 
                  onClick={handleSaveIntake} 
                  disabled={isSaving || !selectedProduct || !quantity || quantity <= 0}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  {isSaving ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Procesando...</>
                  ) : (
                    <><CheckCircle2 className="h-5 w-5 mr-2" /> Confirmar Ingreso</>
                  )}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* COLUMNA DERECHA: HISTORIAL */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden h-full flex flex-col">
            <CardHeader className="bg-slate-900 border-b border-slate-800 p-6 flex-shrink-0">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" /> Historial de Ingresos
              </h2>
              <p className="text-xs text-slate-400">Auditoría completa de todas las entradas al inventario.</p>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-bold py-4">Fecha y Hora</TableHead>
                    <TableHead className="font-bold py-4">Producto</TableHead>
                    <TableHead className="font-bold py-4">Ref.</TableHead>
                    <TableHead className="font-bold py-4">Admin</TableHead>
                    <TableHead className="text-right font-bold py-4">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingIntakes ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                      </TableCell>
                    </TableRow>
                  ) : !intakes || intakes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                        No hay ingresos registrados en el sistema.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedIntakes.map((data: any) => {
                      return (
                        <TableRow key={data.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="text-xs font-medium text-slate-500">
                            {formatDocDate(data.createdAt || data.intakeDate)}
                          </TableCell>
                          <TableCell className="font-bold text-slate-700">
                            {data.productName}
                          </TableCell>
                          <TableCell className="text-xs text-slate-400">
                            {data.reference || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 font-medium text-[10px]">
                              {data.createdBy || 'Admin'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-center font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                              +{data.quantity}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 mt-auto">
                <span className="text-sm text-slate-500 font-medium">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, intakes?.length || 0)} de {intakes?.length} registros
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="h-8 rounded-lg font-bold"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="h-8 rounded-lg font-bold"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
}
