import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ProductListFormProps {
  items: any[];
  setItems: (items: any[]) => void;
  availableProducts: any[];
}

export function ProductListForm({ items, setItems, availableProducts }: ProductListFormProps) {
  const { toast } = useToast();
  const [productSearch, setProductSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const filteredProducts = availableProducts?.filter((p: any) => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ) || [];

  return (
    <>
      <h3 className="text-xl font-bold mb-6 border-b pb-4">Detalle de Productos</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="p-6 bg-slate-50/50 rounded-2xl border flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400">Producto</Label>
              <Popover open={openPopoverId === item.id} onOpenChange={(open) => setOpenPopoverId(open ? item.id : null)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start h-11 bg-white">
                    {item.description || "Buscar..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[450px]">
                  <div className="p-2">
                    <Input placeholder="Filtrar..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                  </div>
                  <div className="max-h-[250px] overflow-y-auto">
                    {filteredProducts.map((p: any) => (
                      <button key={p.id} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between border-b items-center" onClick={() => { 
                        if (p.stock !== undefined && p.stock <= 0) {
                          toast({ title: "Producto Agotado", description: `El producto ${p.name} está agotado.`, variant: "destructive" });
                          return;
                        }
                        const newQty = (p.stock !== undefined && item.quantity > p.stock) ? p.stock : item.quantity;
                        if (newQty < item.quantity) {
                           toast({ title: "Stock Insuficiente", description: `Se ajustó a ${newQty} unidades.`, variant: "destructive" });
                        }
                        setItems(items.map(i => i.id === item.id ? { ...i, description: p.name, unitPrice: p.price, productId: p.id, maxStock: p.stock !== undefined ? p.stock : null, quantity: newQty } : i)); 
                        setOpenPopoverId(null); 
                      }}>
                        <span className="font-bold">{p.name}</span>
                        <div className="flex gap-2 items-center">
                          {p.stock !== undefined && <span className={cn("text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest", p.stock <= 10 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>Stock: {p.stock}</span>}
                          <span className="text-[#2988a3] font-black">${p.price.toFixed(2)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="w-full md:w-24 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400">Cant.</Label>
              <Input type="number" value={item.quantity} onChange={(e) => {
                let val = parseFloat(e.target.value) || 0;
                if (item.maxStock !== null && val > item.maxStock) {
                  toast({ title: "Stock Insuficiente", description: `Solo hay ${item.maxStock} unidades.`, variant: "destructive" });
                  val = item.maxStock;
                }
                setItems(items.map(i => i.id === item.id ? { ...i, quantity: val } : i));
              }} className="h-11 text-center font-bold bg-white" />
            </div>
            <div className="w-full md:w-32 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400">P. Final</Label>
              <Input type="number" value={item.unitPrice} onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, unitPrice: parseFloat(e.target.value) || 0 } : i))} className="h-11 text-right font-black text-[#2988a3] bg-white" />
            </div>
            <div className="flex items-end h-11 pt-6 md:pt-0">
              <Button variant="ghost" size="icon" onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-rose-500 h-11 w-11">
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={() => setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: "", quantity: 1, unitPrice: 0, productId: null, maxStock: null }])} variant="outline" className="mt-6 border-dashed border-2 w-full h-14 font-bold text-[#2988a3]">
        <Plus className="mr-2 h-4 w-4" /> Añadir Item
      </Button>
    </>
  );
}
