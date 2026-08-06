"use client";

import { useState } from "react";
import { 
  Plus, 
  Trash2, 
  FileDown, 
  ArrowLeft 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SRIRetentionData, generateRetentionXML } from "@/lib/retention";
import { downloadXML } from "@/lib/sri-xml-service";
import { emitirRetencionAction } from "@/app/actions/sri-actions";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { Loader2, Search } from "lucide-react";

export default function NewRetentionPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  // Cargar Ingresos de Mercadería para autocompletar
  const intakesRef = db ? query(collection(db, "inventoryIntakes"), orderBy("createdAt", "desc")) : null;
  const { data: intakes, loading: loadingIntakes } = useCollection(intakesRef);

  const [formData, setFormData] = useState({
    rucEmisor: "1790000000001",
    razonSocialEmisor: "MI EMPRESA SA",
    nombreComercialEmisor: "",
    dirMatriz: "Av Principal 123",
    estab: "001",
    ptoEmi: "001",
    secuencial: "000000123",
    fechaEmision: new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    razonSocial: "",
    identificacion: "",
    tipoIdentificacion: "04",
    numeroFactura: "",
    fechaFactura: "",
    claveAccesoFactura: ""
  });

  const [retenciones, setRetenciones] = useState([{
    id: Date.now(),
    codigo: "1",
    codigoRetencion: "",
    baseImponible: "",
    porcentajeRetener: "",
    valorRetenido: "0.00"
  }]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addRetencion = () => {
    setRetenciones(prev => [...prev, {
      id: Date.now(),
      codigo: "1",
      codigoRetencion: "",
      baseImponible: "",
      porcentajeRetener: "",
      valorRetenido: "0.00"
    }]);
  };

  const removeRetencion = (id: number) => {
    setRetenciones(prev => prev.filter(r => r.id !== id));
  };

  const updateRetencion = (id: number, field: string, value: string) => {
    setRetenciones(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        // Recalcular valor retenido si cambian base o porcentaje
        if (field === 'baseImponible' || field === 'porcentajeRetener') {
          const base = parseFloat(updated.baseImponible || "0");
          const porcentaje = parseFloat(updated.porcentajeRetener || "0");
          updated.valorRetenido = ((base * porcentaje) / 100).toFixed(2);
        }
        return updated;
      }
      return r;
    }));
  };

  const handleEmitirSRI = async () => {
    setIsSubmitting(true);
    try {
      const dataToGenerate: SRIRetentionData = {
        rucEmisor: formData.rucEmisor,
        razonSocialEmisor: formData.razonSocialEmisor,
        nombreComercialEmisor: formData.nombreComercialEmisor,
        dirMatriz: formData.dirMatriz,
        estab: formData.estab,
        ptoEmi: formData.ptoEmi,
        secuencial: formData.secuencial,
        fechaEmision: formData.fechaEmision,
        razonSocial: formData.razonSocial,
        identificacion: formData.identificacion,
        tipoIdentificacion: formData.tipoIdentificacion,
        numeroFactura: formData.numeroFactura,
        fechaFactura: formData.fechaFactura,
        claveAccesoFactura: formData.claveAccesoFactura,
        retenciones: retenciones.map(r => ({
          codigo: r.codigo,
          codigoRetencion: r.codigoRetencion,
          baseImponible: parseFloat(r.baseImponible || "0"),
          porcentajeRetener: parseFloat(r.porcentajeRetener || "0"),
          valorRetenido: parseFloat(r.valorRetenido || "0")
        }))
      };

      const xmlStr = generateRetentionXML(dataToGenerate);
      
      toast({ title: "Iniciando proceso...", description: "Generando y enviando retención al SRI..." });
      
      const result = await emitirRetencionAction(xmlStr);
      
      if (result.success) {
        toast({ 
          title: "¡Retención Autorizada!", 
          description: `Clave: ${result.claveAcceso}`,
          className: "bg-emerald-500 text-white"
        });
        downloadXML(result.xmlFirmado || xmlStr, `Retencion_${formData.rucEmisor}_${formData.secuencial}.xml`);
        
        // Opcional: Incrementar secuencial
        setFormData(prev => ({
          ...prev,
          secuencial: String(parseInt(prev.secuencial) + 1).padStart(9, "0")
        }));
      } else {
        toast({ title: "Error SRI", description: result.error, variant: "destructive" });
      }

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectIntake = (intake: any) => {
    // Intentamos extraer datos de la factura si existe la referencia
    setFormData(prev => ({
      ...prev,
      numeroFactura: intake.reference || "",
      // Estos datos ideales deberíamos tenerlos en el intake, pero si no están, se dejan en blanco para que el usuario los llene.
      razonSocial: intake.supplierName || "",
      identificacion: intake.supplierRuc || ""
    }));
    setShowSelector(false);
    toast({ title: "Factura Seleccionada", description: "Se han precargado los datos de la factura de compra." });
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Nuevo Comprobante de Retención</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
          </Button>
          <Button onClick={handleEmitirSRI} disabled={isSubmitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
            ) : (
              <><FileDown className="mr-2 h-4 w-4" /> Emitir Retención (SRI)</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos del Emisor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rucEmisor">RUC</Label>
                <Input id="rucEmisor" name="rucEmisor" value={formData.rucEmisor} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="razonSocialEmisor">Razón Social</Label>
                <Input id="razonSocialEmisor" name="razonSocialEmisor" value={formData.razonSocialEmisor} onChange={handleInputChange} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estab">Estab.</Label>
                <Input id="estab" name="estab" value={formData.estab} onChange={handleInputChange} maxLength={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ptoEmi">Pto Emi.</Label>
                <Input id="ptoEmi" name="ptoEmi" value={formData.ptoEmi} onChange={handleInputChange} maxLength={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secuencial">Secuencial</Label>
                <Input id="secuencial" name="secuencial" value={formData.secuencial} onChange={handleInputChange} maxLength={9} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaEmision">Fecha Emisión (DD/MM/YYYY)</Label>
              <Input id="fechaEmision" name="fechaEmision" value={formData.fechaEmision} onChange={handleInputChange} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del Sujeto Retenido (Proveedor)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipoIdentificacion">Tipo Identificación</Label>
                <Select value={formData.tipoIdentificacion} onValueChange={(val) => handleSelectChange('tipoIdentificacion', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="04">RUC</SelectItem>
                    <SelectItem value="05">Cédula</SelectItem>
                    <SelectItem value="06">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identificacion">Identificación</Label>
                <Input id="identificacion" name="identificacion" value={formData.identificacion} onChange={handleInputChange} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="razonSocial">Razón Social</Label>
              <Input id="razonSocial" name="razonSocial" value={formData.razonSocial} onChange={handleInputChange} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Datos de la Factura Sustentada (Compra)</CardTitle>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowSelector(!showSelector)}>
              <Search className="h-4 w-4 mr-2" /> Seleccionar Ingreso
            </Button>
            {showSelector && (
              <div className="absolute right-0 top-12 w-[400px] z-50 bg-white border shadow-xl rounded-lg p-2 max-h-[300px] overflow-y-auto">
                <h4 className="text-sm font-bold mb-2 text-slate-700 px-2">Historial de Ingresos a Inventario</h4>
                {loadingIntakes ? (
                  <div className="p-4 text-center text-sm text-slate-500">Cargando...</div>
                ) : !intakes || intakes.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">No hay ingresos registrados.</div>
                ) : (
                  intakes.map((intake: any) => (
                    <div 
                      key={intake.id} 
                      onClick={() => handleSelectIntake(intake)}
                      className="p-3 hover:bg-slate-50 cursor-pointer border-b last:border-0 rounded"
                    >
                      <div className="font-semibold text-sm">{intake.productName} <span className="text-xs text-slate-500">(+{intake.quantity})</span></div>
                      <div className="text-xs text-slate-500 mt-1">Ref/Factura: {intake.reference || 'N/A'}</div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {intake.createdAt ? new Date(intake.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numeroFactura">Número de Factura</Label>
              <Input id="numeroFactura" name="numeroFactura" placeholder="Ej: 001-001-123456789" value={formData.numeroFactura} onChange={handleInputChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaFactura">Fecha Factura</Label>
              <Input id="fechaFactura" name="fechaFactura" placeholder="DD/MM/YYYY" value={formData.fechaFactura} onChange={handleInputChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claveAccesoFactura">Autorización (Opcional)</Label>
              <Input id="claveAccesoFactura" name="claveAccesoFactura" placeholder="49 dígitos o en blanco" value={formData.claveAccesoFactura} onChange={handleInputChange} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalle de Retenciones</CardTitle>
          <Button variant="outline" onClick={addRetencion}>
            <Plus className="mr-2 h-4 w-4" /> Agregar Retención
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Impuesto</TableHead>
                  <TableHead>Cód. Retención</TableHead>
                  <TableHead>Base Imponible</TableHead>
                  <TableHead>% Retener</TableHead>
                  <TableHead>Valor Retenido</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retenciones.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell>
                      <Select value={ret.codigo} onValueChange={(val) => updateRetencion(ret.id, 'codigo', val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Renta (1)</SelectItem>
                          <SelectItem value="2">IVA (2)</SelectItem>
                          <SelectItem value="6">ISD (6)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input placeholder="Ej: 312" value={ret.codigoRetencion} onChange={(e) => updateRetencion(ret.id, 'codigoRetencion', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" placeholder="0.00" value={ret.baseImponible} onChange={(e) => updateRetencion(ret.id, 'baseImponible', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" placeholder="0.00" value={ret.porcentajeRetener} onChange={(e) => updateRetencion(ret.id, 'porcentajeRetener', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input disabled value={ret.valorRetenido} className="bg-muted" />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeRetencion(ret.id)} disabled={retenciones.length === 1}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
