"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Save, 
  Loader2, 
  Info, 
  Building2, 
  Receipt, 
  AlertCircle, 
  ShieldAlert,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFirestore } from "@/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_TAX_CONFIG, TaxConfig } from "@/lib/config-helper";

export default function SriConfigPage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TaxConfig>({ ...DEFAULT_TAX_CONFIG });

  useEffect(() => {
    if (!db) return;

    const fetchConfig = async () => {
      try {
        const docRef = doc(db, "taxConfig", "current");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setConfig({ ...DEFAULT_TAX_CONFIG, ...docSnap.data() } as TaxConfig);
        } else {
          // If it doesn't exist, create it with defaults
          await setDoc(docRef, {
            ...DEFAULT_TAX_CONFIG,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setConfig({ ...DEFAULT_TAX_CONFIG });
          toast({
            title: "Configuración Inicial Creada",
            description: "Se han establecido los datos del contribuyente por defecto."
          });
        }
      } catch (error) {
        console.error("Error al cargar configuración tributaria:", error);
        toast({
          title: "Error al cargar configuración",
          description: "Se están utilizando valores predeterminados de contingencia.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [db, toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    if (!config.ruc || !config.razonSocial || !config.regimen) {
      toast({
        title: "Campos Incompletos",
        description: "El RUC, Razón Social y Régimen son obligatorios.",
        variant: "destructive"
      });
      return;
    }

    if (config.ruc.length !== 13) {
      toast({
        title: "RUC Inválido",
        description: "El RUC debe tener 13 dígitos para facturación electrónica.",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "taxConfig", "current");
      await setDoc(docRef, {
        ...config,
        updatedAt: serverTimestamp()
      });
      toast({
        title: "Configuración Guardada",
        description: "Los parámetros tributarios se actualizaron correctamente."
      });
    } catch (error: any) {
      console.error("Error al guardar la configuración:", error);
      toast({
        title: "Error al guardar",
        description: error.message || "No se pudo actualizar la configuración.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in duration-500 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Configuración Tributaria SRI</h1>
          <p className="text-muted-foreground font-medium">Defina los parámetros legales y del RUC del emisor para la facturación electrónica.</p>
        </div>
      </div>

      {/* Banner / Alerta Informativa */}
      <Alert className="bg-amber-50 border-amber-200 text-amber-900 rounded-2xl p-5 shadow-sm">
        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="ml-3">
          <AlertTitle className="font-bold text-amber-800">Obligación Tributaria Activa</AlertTitle>
          <AlertDescription className="text-sm font-medium text-amber-700 mt-1">
            El contribuyente pertenece a **{config.regimen}** y debe declarar IVA de manera **{config.periodicidad_iva}**. 
            El sistema calculará las tarifas del IVA desglosadas por producto (0% y 15%).
          </AlertDescription>
        </div>
      </Alert>

      <form onSubmit={handleSave} className="space-y-8">
        <Card className="border-none shadow-xl bg-white rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-6 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">Datos del Emisor</CardTitle>
                <CardDescription>Razón social y direcciones comerciales registradas en el SRI.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="ruc" className="text-xs font-bold uppercase text-slate-500">R.U.C. del Contribuyente</Label>
                <Input 
                  id="ruc" 
                  value={config.ruc} 
                  maxLength={13}
                  onChange={(e) => setConfig({ ...config, ruc: e.target.value.replace(/\D/g, '') })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="razonSocial" className="text-xs font-bold uppercase text-slate-500">Razón Social</Label>
                <Input 
                  id="razonSocial" 
                  value={config.razonSocial} 
                  onChange={(e) => setConfig({ ...config, razonSocial: e.target.value.toUpperCase() })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombreComercial" className="text-xs font-bold uppercase text-slate-500">Nombre Comercial</Label>
                <Input 
                  id="nombreComercial" 
                  value={config.nombreComercial} 
                  onChange={(e) => setConfig({ ...config, nombreComercial: e.target.value })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dirMatriz" className="text-xs font-bold uppercase text-slate-500">Dirección Matriz</Label>
                <Input 
                  id="dirMatriz" 
                  value={config.dirMatriz} 
                  onChange={(e) => setConfig({ ...config, dirMatriz: e.target.value })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estab" className="text-xs font-bold uppercase text-slate-500">Cod. Establecimiento</Label>
                  <Input 
                    id="estab" 
                    value={config.estab} 
                    maxLength={3}
                    onChange={(e) => setConfig({ ...config, estab: e.target.value.padStart(3, '0').slice(-3) })}
                    className="rounded-xl h-11 bg-slate-50 border-slate-200 text-center font-bold"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ptoEmi" className="text-xs font-bold uppercase text-slate-500">Cod. Punto Emisión</Label>
                  <Input 
                    id="ptoEmi" 
                    value={config.ptoEmi} 
                    maxLength={3}
                    onChange={(e) => setConfig({ ...config, ptoEmi: e.target.value.padStart(3, '0').slice(-3) })}
                    className="rounded-xl h-11 bg-slate-50 border-slate-200 text-center font-bold"
                    required 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase text-slate-500">Email de Contacto</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={config.email} 
                  onChange={(e) => setConfig({ ...config, email: e.target.value })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-bold uppercase text-slate-500">Teléfono(s)</Label>
                <Input 
                  id="phone" 
                  value={config.phone} 
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-6 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">Régimen y Parámetros Tributarios</CardTitle>
                <CardDescription>Configuración de impuestos y obligaciones frente al SRI.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="regimen" className="text-xs font-bold uppercase text-slate-500">Régimen Tributario</Label>
                <Input 
                  id="regimen" 
                  value={config.regimen} 
                  onChange={(e) => setConfig({ ...config, regimen: e.target.value })}
                  className="rounded-xl h-11 bg-slate-50 border-slate-200 font-bold"
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="obligado_contabilidad" className="text-xs font-bold uppercase text-slate-500">Obligado a Llevar Contabilidad</Label>
                <Select 
                  value={config.obligado_contabilidad ? "true" : "false"} 
                  onValueChange={(val) => setConfig({ ...config, obligado_contabilidad: val === "true" })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="false">NO</SelectItem>
                    <SelectItem value="true">SÍ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agente_retencion" className="text-xs font-bold uppercase text-slate-500">Agente de Retención</Label>
                <Select 
                  value={config.agente_retencion ? "true" : "false"} 
                  onValueChange={(val) => setConfig({ ...config, agente_retencion: val === "true" })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="false">NO</SelectItem>
                    <SelectItem value="true">SÍ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contribuyente_especial" className="text-xs font-bold uppercase text-slate-500">Contribuyente Especial</Label>
                <Select 
                  value={config.contribuyente_especial ? "true" : "false"} 
                  onValueChange={(val) => setConfig({ ...config, contribuyente_especial: val === "true" })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="false">NO</SelectItem>
                    <SelectItem value="true">SÍ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="declara_iva" className="text-xs font-bold uppercase text-slate-500">Declara IVA</Label>
                <Select 
                  value={config.declara_iva ? "true" : "false"} 
                  onValueChange={(val) => setConfig({ ...config, declara_iva: val === "true" })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="true">SÍ</SelectItem>
                    <SelectItem value="false">NO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="periodicidad_iva" className="text-xs font-bold uppercase text-slate-500">Periodicidad Declaración IVA</Label>
                <Select 
                  value={config.periodicidad_iva} 
                  onValueChange={(val: "SEMESTRAL" | "MENSUAL") => setConfig({ ...config, periodicidad_iva: val })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="SEMESTRAL">SEMESTRAL</SelectItem>
                    <SelectItem value="MENSUAL">MENSUAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tarifa_iva_default" className="text-xs font-bold uppercase text-slate-500">Tarifa IVA por Defecto</Label>
                <Select 
                  value={config.tarifa_iva_default.toString()} 
                  onValueChange={(val) => setConfig({ ...config, tarifa_iva_default: parseInt(val) })}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="15">15%</SelectItem>
                    <SelectItem value="0">0%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button 
            type="submit" 
            disabled={saving} 
            className="shadow-lg h-12 px-8 rounded-xl font-bold bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
