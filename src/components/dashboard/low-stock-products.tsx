"use client";

import { useMemo } from "react";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, where, limit } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function LowStockProducts() {
  const db = useFirestore();
  const productsRef = useMemo(() => (db ? query(collection(db, "products"), where("stock", "<=", 10), limit(20)) : null), [db]);
  const { data: products, loading } = useCollection(productsRef);

  const lowStockProducts = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p: any) => p.stock !== undefined && p.stock <= 10)
      .sort((a: any, b: any) => a.stock - b.stock);
  }, [products]);

  if (loading) {
    return (
      <Card className="border-none shadow-sm bg-white rounded-2xl animate-pulse">
        <CardHeader className="bg-slate-50/50 p-6 border-b">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Cargando Inventario...</CardTitle>
        </CardHeader>
        <CardContent className="h-48"></CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm overflow-hidden bg-white rounded-2xl">
      <CardHeader className="bg-rose-50/50 p-6 border-b border-rose-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-rose-800">
            Alertas de Bajo Stock
          </CardTitle>
        </div>
        <Badge variant="outline" className="bg-white border-rose-200 text-rose-700 font-black">
          {lowStockProducts.length} críticos
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
          {lowStockProducts.length > 0 ? lowStockProducts.map((product: any) => (
            <div key={product.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <PackageSearch className="h-5 w-5 text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate" title={product.name}>
                    {product.name}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {product.category || "Sin categoría"} • {product.sku || "Sin SKU"}
                  </p>
                </div>
              </div>
              <div className="text-right pl-2 shrink-0">
                <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-black uppercase ${
                  product.stock === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {product.stock === 0 ? 'Agotado' : `Quedan ${product.stock}`}
                </span>
              </div>
            </div>
          )) : (
            <div className="p-12 text-center text-muted-foreground italic text-sm">
              Todos los productos tienen stock saludable.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
