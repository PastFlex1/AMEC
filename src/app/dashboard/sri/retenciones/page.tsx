"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Plus, 
  Trash2, 
  FileDown, 
  ArrowLeft, 
  Search, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Send, 
  Eye, 
  FileCode2, 
  RefreshCw,
  Copy,
  Check,
  Download,
  FileText,
  History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useCollection } from "@/firebase";
import { 
  collection, 
  query, 
  where, 
  limit, 
  getDoc, 
  doc, 
  addDoc, 
  setDoc,
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { 
  SRIRetentionData, 
  generateRetentionXML, 
  generateRetentionAccessKey, 
  ensureDateFormat 
} from "@/lib/retention";
import { downloadXML } from "@/lib/sri-xml-service";
import { generateRetentionPDF } from "@/lib/pdf-service";
import { DEFAULT_TAX_CONFIG, TaxConfig } from "@/lib/config-helper";
import { 
  validarRetencion, 
  firmarRetencion, 
  recepcionarRetencion, 
  autorizarRetencion 
} from "@/services/retencionService";

// Estados del Flujo de Retención
export type StateRetention = 
  | "BORRADOR" 
  | "XML_GENERADO" 
  | "FIRMADO" 
  | "ENVIADO_SRI" 
  | "AUTORIZADO" 
  | "DEVUELTO";

export default function RetencionesPage() {
  const { toast } = useToast();
  const db = useFirestore();

  // Configuración del emisor
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(DEFAULT_TAX_CONFIG);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHistoryTerm, setSearchHistoryTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"facturas" | "formulario" | "historial">("facturas");

  // Selección de factura y formulario
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const currentDocIdRef = useRef<string | null>(null);
  
  // Estado del Comprobante de Retención actual
  const [estadoActual, setEstadoActual] = useState<StateRetention>("BORRADOR");
  const [xmlGenerado, setXmlGenerado] = useState<string | null>(null);
  const [xmlFirmado, setXmlFirmado] = useState<string | null>(null);
  const [claveAccesoGenerada, setClaveAccesoGenerada] = useState<string | null>(null);
  const [respuestaSri, setRespuestaSri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de carga por acción
  const [loadingValidar, setLoadingValidar] = useState(false);
  const [loadingFirmar, setLoadingFirmar] = useState(false);
  const [loadingEnviar, setLoadingEnviar] = useState(false);
  const [loadingAutorizar, setLoadingAutorizar] = useState(false);
  const [copiedXml, setCopiedXml] = useState(false);
  const [showXmlModal, setShowXmlModal] = useState(false);
  const [modalXmlContent, setModalXmlContent] = useState<string>("");

  // Datos del formulario de retención (Sin datos simulados en duro)
  const [formData, setFormData] = useState({
    rucEmisor: DEFAULT_TAX_CONFIG.ruc,
    razonSocialEmisor: DEFAULT_TAX_CONFIG.razonSocial,
    nombreComercialEmisor: DEFAULT_TAX_CONFIG.nombreComercial,
    dirMatriz: DEFAULT_TAX_CONFIG.dirMatriz,
    estab: DEFAULT_TAX_CONFIG.estab,
    ptoEmi: DEFAULT_TAX_CONFIG.ptoEmi,
    secuencial: "000000001",
    fechaEmision: format(new Date(), "dd/MM/yyyy"),
    razonSocial: "",
    identificacion: "",
    tipoIdentificacion: "04",
    numeroFactura: "",
    fechaFactura: "",
    claveAccesoFactura: ""
  });

  // Cargar datos reales de configuración tributaria del emisor
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "taxConfig", "current")).then((snap) => {
      if (snap.exists()) {
        const config = snap.data() as TaxConfig;
        setTaxConfig(config);
        setFormData(prev => ({
          ...prev,
          rucEmisor: config.ruc || prev.rucEmisor,
          razonSocialEmisor: config.razonSocial || prev.razonSocialEmisor,
          nombreComercialEmisor: config.nombreComercial || prev.nombreComercialEmisor,
          dirMatriz: config.dirMatriz || prev.dirMatriz,
          estab: config.estab || prev.estab,
          ptoEmi: config.ptoEmi || prev.ptoEmi
        }));
      }
    }).catch(err => console.error("Error cargando taxConfig:", err));
  }, [db]);

  // Cargar Facturas Autorizadas desde Firestore
  const invoicesRef = useMemo(() => (
    db ? query(collection(db, "invoices"), where("status", "==", "Autorizado"), limit(100)) : null
  ), [db]);
  const { data: authorizedInvoices, loading: loadingInvoices } = useCollection(invoicesRef);

  // Cargar Historial de Retenciones desde Firestore (Colección "retenciones")
  const retencionesRef = useMemo(() => (
    db ? query(collection(db, "retenciones"), orderBy("createdAt", "desc"), limit(100)) : null
  ), [db]);
  const { data: savedRetenciones, loading: loadingSavedRetenciones } = useCollection(retencionesRef);

  // Auto-incrementar el secuencial de retención según los registros existentes en Firestore
  useEffect(() => {
    if (savedRetenciones && savedRetenciones.length > 0) {
      const highest = savedRetenciones.reduce((max, item: any) => {
        const num = parseInt(item.secuencial || "0", 10);
        return num > max ? num : max;
      }, 0);
      const nextSecuencial = String(highest + 1).padStart(9, "0");
      setFormData(prev => ({ ...prev, secuencial: nextSecuencial }));
    }
  }, [savedRetenciones]);

  // Lista de rubros de retención (Inicializada vacía)
  const [retenciones, setRetenciones] = useState([
    {
      id: Date.now(),
      codigo: "1", // 1 = Renta
      codigoRetencion: "312",
      baseImponible: "0.00",
      porcentajeRetener: "1.75",
      valorRetenido: "0.00"
    }
  ]);

  // Formatear fechas para mostrar en las tablas
  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      if (typeof dateVal === 'string') {
        return ensureDateFormat(dateVal);
      }
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(d, "dd/MM/yyyy", { locale: es });
    } catch (e) {
      return "N/A";
    }
  };

  // Filtrar facturas autorizadas por término de búsqueda (Ordenadas de mayor a menor)
  const filteredInvoices = useMemo(() => {
    if (!authorizedInvoices) return [];
    const term = searchTerm.toLowerCase();
    return authorizedInvoices
      .filter((inv: any) => {
        const customer = inv.clientData?.name || inv.customerName || "";
        const num = inv.invoiceNumber || "";
        const ruc = inv.clientData?.ruc || inv.customerRuc || "";
        return customer.toLowerCase().includes(term) || 
               num.toLowerCase().includes(term) ||
               ruc.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => {
        const numA = parseInt((a.invoiceNumber || "").replace(/\D/g, "") || "0", 10);
        const numB = parseInt((b.invoiceNumber || "").replace(/\D/g, "") || "0", 10);
        return numB - numA;
      });
  }, [authorizedInvoices, searchTerm]);

  // Filtrar historial de retenciones por término de búsqueda (Ordenadas de mayor a menor)
  const filteredSavedRetenciones = useMemo(() => {
    if (!savedRetenciones) return [];
    const term = searchHistoryTerm.toLowerCase();
    return savedRetenciones
      .filter((ret: any) => {
        const sujeto = ret.sujetoRetenido || "";
        const numFact = ret.numeroFactura || "";
        const key = ret.claveAcceso || "";
        const ruc = ret.identificacion || "";
        return sujeto.toLowerCase().includes(term) || 
               numFact.toLowerCase().includes(term) ||
               key.toLowerCase().includes(term) ||
               ruc.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => {
        const secA = parseInt((a.secuencial || a.numeroRetencion || "").replace(/\D/g, "") || "0", 10);
        const secB = parseInt((b.secuencial || b.numeroRetencion || "").replace(/\D/g, "") || "0", 10);
        if (secA !== secB) return secB - secA;
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
  }, [savedRetenciones, searchHistoryTerm]);

  // Al seleccionar una factura autorizada
  const handleSelectInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    currentDocIdRef.current = null;
    
    // Extraer datos automáticamente de la factura sustentada
    const proveedorNombre = inv.clientData?.name || inv.customerName || "";
    const proveedorRuc = inv.clientData?.ruc || inv.clientData?.identificacion || inv.customerRuc || "";
    const numFactura = inv.invoiceNumber || "";
    const fechaFact = formatDocDate(inv.date);
    const claveAccesoFact = inv.claveAcceso || inv.accessKey || "";
    const totalFactura = Number(inv.total || 0);
    const baseCalculada = inv.subtotal ? Number(inv.subtotal) : totalFactura;

    setFormData(prev => ({
      ...prev,
      razonSocial: proveedorNombre,
      identificacion: proveedorRuc,
      tipoIdentificacion: proveedorRuc.length === 13 ? "04" : proveedorRuc.length === 10 ? "05" : "06",
      numeroFactura: numFactura,
      fechaFactura: fechaFact,
      claveAccesoFactura: claveAccesoFact
    }));

    // Precargar retención sugerida basada en la base de la factura seleccionada
    setRetenciones([
      {
        id: Date.now(),
        codigo: "1",
        codigoRetencion: "312",
        baseImponible: baseCalculada.toFixed(2),
        porcentajeRetener: "1.75",
        valorRetenido: ((baseCalculada * 1.75) / 100).toFixed(2)
      }
    ]);

    // Resetear estados de emisión
    setEstadoActual("BORRADOR");
    setXmlGenerado(null);
    setXmlFirmado(null);
    setClaveAccesoGenerada(null);
    setRespuestaSri(null);
    setErrorMessage(null);

    // Cambiar a la pestaña del formulario
    setActiveTab("formulario");
    toast({
      title: "Factura Seleccionada",
      description: `Datos cargados automáticamente de la factura #${numFactura}.`
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addRetencionRow = () => {
    setRetenciones(prev => [...prev, {
      id: Date.now(),
      codigo: "1",
      codigoRetencion: "312",
      baseImponible: "0.00",
      porcentajeRetener: "1.75",
      valorRetenido: "0.00"
    }]);
  };

  const removeRetencionRow = (id: number) => {
    setRetenciones(prev => prev.filter(r => r.id !== id));
  };

  const updateRetencionRow = (id: number, field: string, value: string) => {
    setRetenciones(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
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

  // Guardar o actualizar registro de retención en Firestore ("retenciones")
  const saveRetentionToFirestore = async (status: StateRetention, extraData: any = {}) => {
    if (!db) return;
    try {
      const totalRet = retenciones.reduce<number>((acc, r) => acc + Number(r.valorRetenido || 0), 0);
      const payload = {
        rucEmisor: formData.rucEmisor,
        razonSocialEmisor: formData.razonSocialEmisor,
        estab: formData.estab,
        ptoEmi: formData.ptoEmi,
        secuencial: formData.secuencial,
        numeroRetencion: `${formData.estab}-${formData.ptoEmi}-${formData.secuencial}`,
        claveAcceso: claveAccesoGenerada || "",
        numeroFactura: formData.numeroFactura,
        fechaFactura: formData.fechaFactura,
        claveAccesoFactura: formData.claveAccesoFactura,
        sujetoRetenido: formData.razonSocial,
        identificacion: formData.identificacion,
        tipoIdentificacion: formData.tipoIdentificacion,
        fechaEmision: formData.fechaEmision,
        retenciones,
        totalRetenido: totalRet,
        estado: status,
        xmlGenerado: xmlGenerado || null,
        xmlFirmado: xmlFirmado || null,
        respuestaSri: respuestaSri || null,
        updatedAt: serverTimestamp(),
        ...extraData
      };

      if (currentDocIdRef.current) {
        await setDoc(doc(db, "retenciones", currentDocIdRef.current), payload, { merge: true });
      } else {
        const newRef = await addDoc(collection(db, "retenciones"), {
          ...payload,
          createdAt: serverTimestamp()
        });
        currentDocIdRef.current = newRef.id;
      }
    } catch (e) {
      console.error("Error guardando retención en Firestore:", e);
    }
  };

  // Paso 1: Generar XML de Retención y Clave de Acceso
  const handleGenerarXML = async () => {
    setErrorMessage(null);
    try {
      if (!formData.razonSocial || !formData.identificacion) {
        throw new Error("Complete la razón social y la identificación del sujeto retenido.");
      }
      if (!formData.numeroFactura) {
        throw new Error("Indique el número de factura sustentada.");
      }
      if (!retenciones || retenciones.length === 0) {
        throw new Error("Debe agregar al menos una fila de retención.");
      }

      const retentionData: SRIRetentionData = {
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

      const key = generateRetentionAccessKey(retentionData);
      const xmlStr = generateRetentionXML(retentionData);

      setClaveAccesoGenerada(key);
      setXmlGenerado(xmlStr);
      setEstadoActual("XML_GENERADO");

      await saveRetentionToFirestore("XML_GENERADO", { claveAcceso: key, xmlGenerado: xmlStr });

      toast({
        title: "XML de Retención Generado",
        description: `Guardado en Firestore. Clave: ${key}`
      });

    } catch (err: any) {
      setErrorMessage(err.message || "Error al construir el XML de retención.");
      toast({
        title: "Error en XML",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Paso 2: Validar Sintaxis del XML
  const handleValidarXML = async () => {
    if (!xmlGenerado) return;
    setLoadingValidar(true);
    setErrorMessage(null);
    try {
      const res = await validarRetencion(xmlGenerado);
      if (res.success) {
        toast({
          title: "XML Válido",
          description: "La estructura del XML cumple con el esquema SRI."
        });
      } else {
        setErrorMessage(res.error || "Fallo en la validación del XML.");
        toast({
          title: "Error de Validación XML",
          description: res.error,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error de conexión con el backend Railway.");
    } finally {
      setLoadingValidar(false);
    }
  };

  // Paso 3: Firmar XML
  const handleFirmarXML = async () => {
    if (!xmlGenerado) return;
    setLoadingFirmar(true);
    setErrorMessage(null);
    try {
      const res = await firmarRetencion(xmlGenerado);
      if (res.success && res.xmlFirmado) {
        setXmlFirmado(res.xmlFirmado);
        if (res.claveAcceso) setClaveAccesoGenerada(res.claveAcceso);
        setEstadoActual("FIRMADO");

        await saveRetentionToFirestore("FIRMADO", { xmlFirmado: res.xmlFirmado, claveAcceso: res.claveAcceso || claveAccesoGenerada });

        toast({
          title: "XML Firmado Exitosamente",
          description: "La firma digital ha sido estampada sobre el comprobante."
        });
      } else {
        setErrorMessage(res.error || "No se pudo firmar digitalmente la retención.");
        toast({
          title: "Error de Firma",
          description: res.error,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error al conectar con el servicio de firma digital.");
    } finally {
      setLoadingFirmar(false);
    }
  };

  // Paso 4: Enviar al SRI (Recepción)
  const handleEnviarSRI = async () => {
    const content = xmlFirmado || xmlGenerado;
    if (!content) return;
    setLoadingEnviar(true);
    setErrorMessage(null);
    try {
      const res = await recepcionarRetencion(content);
      if (res.success) {
        setRespuestaSri(res.recepcion || "Comprobante Recibido por el SRI.");
        setEstadoActual("ENVIADO_SRI");

        await saveRetentionToFirestore("ENVIADO_SRI", { respuestaSri: res.recepcion });

        toast({
          title: "Enviado al SRI",
          description: "El comprobante fue recepcionado correctamente. Pendiente de Autorización."
        });
      } else {
        setErrorMessage(res.error || "El SRI rechazó la recepción del comprobante.");
        toast({
          title: "Error en Recepción SRI",
          description: res.error,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Fallo en la comunicación con el SRI.");
    } finally {
      setLoadingEnviar(false);
    }
  };

  // Paso 5: Consultar Autorización SRI
  const handleConsultarAutorizacion = async () => {
    if (!claveAccesoGenerada) {
      setErrorMessage("No existe clave de acceso para consultar.");
      return;
    }
    setLoadingAutorizar(true);
    setErrorMessage(null);
    try {
      const res = await autorizarRetencion(claveAccesoGenerada);
      if (res.success) {
        setRespuestaSri(res.autorizacion || "AUTORIZADO");
        setEstadoActual("AUTORIZADO");

        await saveRetentionToFirestore("AUTORIZADO", { respuestaSri: res.autorizacion, authorizedXml: res.autorizacion });

        toast({
          title: "¡Retención Autorizada!",
          description: `Clave: ${claveAccesoGenerada}`,
          className: "bg-emerald-500 text-white"
        });

      } else {
        setRespuestaSri(res.autorizacion || "NO AUTORIZADO");
        setEstadoActual("DEVUELTO");
        setErrorMessage(res.error || "Comprobante devuelto por el SRI.");

        await saveRetentionToFirestore("DEVUELTO", { respuestaSri: res.autorizacion });

        toast({
          title: "No Autorizado / Devuelto",
          description: res.error,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error al consultar la autorización legal.");
    } finally {
      setLoadingAutorizar(false);
    }
  };

  // Copiar XML al portapapeles
  const handleCopyXml = () => {
    const text = xmlFirmado || xmlGenerado;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
      toast({ title: "XML copiado al portapapeles" });
    }
  };

  // Descargar XML actual
  const handleDownloadCurrentXml = () => {
    const text = xmlFirmado || xmlGenerado;
    if (text) {
      downloadXML(text, `Retencion_${formData.identificacion}_${formData.secuencial}.xml`);
      toast({ title: "Archivo XML Descargado" });
    }
  };

  // Descargar RIDE (PDF) oficial según formato SRI (Fortius)
  const handleDownloadRIDE = (customRetData?: any) => {
    try {
      const isCustom = Boolean(customRetData);
      const dataSrc = customRetData || {
        emitterName: formData.razonSocialEmisor,
        emitterRuc: formData.rucEmisor,
        emitterAddress: formData.dirMatriz,
        clientName: formData.razonSocial,
        clientRuc: formData.identificacion,
        docNumber: `${formData.estab}-${formData.ptoEmi}-${formData.secuencial}`,
        accessKey: claveAccesoGenerada,
        date: formData.fechaEmision,
        facturaNum: formData.numeroFactura,
        facturaFecha: formData.fechaFactura,
        items: retenciones.map(r => ({
          comprobante: "Factura",
          numero: formData.numeroFactura,
          fechaEmision: formData.fechaFactura,
          ejercicioFiscal: formData.fechaEmision.length >= 7 ? formData.fechaEmision.substring(3) : "08/2026",
          baseImponible: Number(r.baseImponible || 0),
          impuesto: r.codigo === "1" ? "RENTA" : r.codigo === "2" ? "IVA" : "ISD",
          codigo: r.codigoRetencion,
          porcentaje: Number(r.porcentajeRetener || 0),
          valorRetenido: Number(r.valorRetenido || 0)
        })),
        total: retenciones.reduce<number>((acc, r) => acc + Number(r.valorRetenido || 0), 0),
        status: estadoActual
      };

      generateRetentionPDF({
        emitter: {
          name: dataSrc.emitterName || formData.razonSocialEmisor,
          ruc: dataSrc.emitterRuc || formData.rucEmisor,
          address: dataSrc.emitterAddress || formData.dirMatriz,
          phone: taxConfig.phone || "",
          email: taxConfig.email || "",
          obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO",
          contribuyenteEspecial: "N/A"
        },
        client: {
          name: dataSrc.clientName || dataSrc.sujetoRetenido || "SUJETO RETENIDO",
          ruc: dataSrc.clientRuc || dataSrc.identificacion || "0000000000001",
          address: selectedInvoice?.clientData?.address || "S/N",
          email: selectedInvoice?.clientData?.email || "N/A",
          phone: selectedInvoice?.clientData?.phone || "N/A"
        },
        docNumber: dataSrc.docNumber || dataSrc.numeroRetencion || `${formData.estab}-${formData.ptoEmi}-${formData.secuencial}`,
        accessKey: dataSrc.accessKey || dataSrc.claveAcceso || claveAccesoGenerada || undefined,
        authDate: dataSrc.status === "AUTORIZADO" || dataSrc.estado === "AUTORIZADO" ? format(new Date(), "dd/MM/yyyy HH:mm:ss") : undefined,
        environment: "PRODUCCIÓN",
        emissionType: "NORMAL",
        date: dataSrc.date || dataSrc.fechaEmision || formData.fechaEmision,
        retenciones: dataSrc.items || (dataSrc.retenciones ? dataSrc.retenciones.map((r: any) => ({
          comprobante: "Factura",
          numero: dataSrc.numeroFactura || formData.numeroFactura,
          fechaEmision: dataSrc.fechaFactura || formData.fechaFactura,
          ejercicioFiscal: (dataSrc.fechaEmision || formData.fechaEmision).substring(3),
          baseImponible: Number(r.baseImponible || 0),
          impuesto: r.codigo === "1" ? "RENTA" : r.codigo === "2" ? "IVA" : "ISD",
          codigo: r.codigoRetencion,
          porcentaje: Number(r.porcentajeRetener || 0),
          valorRetenido: Number(r.valorRetenido || 0)
        })) : []),
        totalRetenido: dataSrc.total || dataSrc.totalRetenido || 0,
        status: (dataSrc.status || dataSrc.estado) === "AUTORIZADO" ? "Autorizado" : "Pendiente"
      });
      toast({ title: "RIDE PDF Generado Exitosamente" });
    } catch (err: any) {
      toast({ title: "Error al generar RIDE PDF", description: err.message, variant: "destructive" });
    }
  };

  // Helper para mostrar insignia visual del estado actual
  const getBadgeEstado = (estado: StateRetention) => {
    switch (estado) {
      case "BORRADOR":
        return <Badge variant="outline" className="bg-slate-100 text-slate-700 font-bold">Borrador</Badge>;
      case "XML_GENERADO":
        return <Badge className="bg-blue-500 text-white font-bold">XML Generado</Badge>;
      case "FIRMADO":
        return <Badge className="bg-indigo-600 text-white font-bold">Firmado Digitalmente</Badge>;
      case "ENVIADO_SRI":
        return <Badge className="bg-amber-500 text-white font-bold">Enviado al SRI (Pendiente)</Badge>;
      case "AUTORIZADO":
        return <Badge className="bg-emerald-500 text-white font-bold">AUTORIZADO SRI</Badge>;
      case "DEVUELTO":
        return <Badge className="bg-rose-500 text-white font-bold">DEVUELTO / NO AUTORIZADO</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Retenciones Electrónicas SRI</h1>
          <p className="text-muted-foreground font-medium">Módulo de emisión, firma y autorización de comprobantes de retención (Tipo 07).</p>
        </div>
        <div className="flex items-center gap-2">
          {getBadgeEstado(estadoActual)}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full md:w-[500px] bg-slate-100 p-1 rounded-2xl">
          <TabsTrigger value="facturas" className="rounded-xl font-bold text-xs md:text-sm">
            1. Facturas Autorizadas
          </TabsTrigger>
          <TabsTrigger value="formulario" className="rounded-xl font-bold text-xs md:text-sm">
            2. Emisión Retención
          </TabsTrigger>
          <TabsTrigger value="historial" className="rounded-xl font-bold text-xs md:text-sm flex items-center gap-1">
            <History className="h-4 w-4" /> 3. Historial ({savedRetenciones?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* PESTAÑA 1: SELECCIONAR FACTURA AUTORIZADA */}
        <TabsContent value="facturas" className="mt-6 space-y-4">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">Seleccionar Factura Sustentada</CardTitle>
                  <CardDescription>Facturas autorizadas registradas en la base de datos</CardDescription>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por cliente, RUC o N° Factura..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-white border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/30">
                      <TableHead className="font-bold text-slate-700">N° Factura</TableHead>
                      <TableHead className="font-bold text-slate-700">Proveedor / Receptor</TableHead>
                      <TableHead className="font-bold text-slate-700">RUC / ID</TableHead>
                      <TableHead className="font-bold text-slate-700">Fecha</TableHead>
                      <TableHead className="font-bold text-slate-700">Total</TableHead>
                      <TableHead className="font-bold text-slate-700">Estado SRI</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingInvoices ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : filteredInvoices.length > 0 ? (
                      filteredInvoices.map((inv: any) => (
                        <TableRow key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="font-mono text-sm font-bold text-primary">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900">
                            {inv.clientData?.name || inv.customerName || "N/A"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            {inv.clientData?.ruc || inv.customerRuc || "N/A"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {formatDocDate(inv.date)}
                          </TableCell>
                          <TableCell className="font-bold text-slate-900">
                            ${(inv.total || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-500 text-white font-bold">
                              {inv.status || "Autorizado"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              onClick={() => handleSelectInvoice(inv)}
                              size="sm" 
                              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl"
                            >
                              Generar Retención
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40 text-center text-slate-500 italic">
                          No se encontraron facturas autorizadas.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA 2: FORMULARIO DE RETENCIÓN Y EMISIÓN */}
        <TabsContent value="formulario" className="mt-6 space-y-6">

          {/* MENSAJE DE ERROR AMIGABLE */}
          {errorMessage && (
            <Card className="border-rose-200 bg-rose-50 text-rose-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-rose-900">Atención</h4>
                  <p className="text-xs text-rose-700 mt-1">{errorMessage}</p>
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* DATOS DEL EMISOR */}
            <Card className="border-none shadow-lg rounded-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900">Datos del Emisor</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="rucEmisor" className="text-xs text-slate-500 font-bold">RUC Emisor</Label>
                    <Input id="rucEmisor" name="rucEmisor" value={formData.rucEmisor} onChange={handleInputChange} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fechaEmision" className="text-xs text-slate-500 font-bold">Fecha Emisión Retención</Label>
                    <Input id="fechaEmision" name="fechaEmision" value={formData.fechaEmision} onChange={handleInputChange} placeholder="DD/MM/YYYY" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="razonSocialEmisor" className="text-xs text-slate-500 font-bold">Razón Social Emisor</Label>
                  <Input id="razonSocialEmisor" name="razonSocialEmisor" value={formData.razonSocialEmisor} onChange={handleInputChange} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="estab" className="text-xs text-slate-500 font-bold">Estab.</Label>
                    <Input id="estab" name="estab" value={formData.estab} onChange={handleInputChange} maxLength={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ptoEmi" className="text-xs text-slate-500 font-bold">Pto. Emi.</Label>
                    <Input id="ptoEmi" name="ptoEmi" value={formData.ptoEmi} onChange={handleInputChange} maxLength={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="secuencial" className="text-xs text-slate-500 font-bold">Secuencial</Label>
                    <Input id="secuencial" name="secuencial" value={formData.secuencial} onChange={handleInputChange} maxLength={9} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* DATOS DEL SUJETO RETENIDO */}
            <Card className="border-none shadow-lg rounded-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-900">Sujeto Retenido (Proveedor / Cliente)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tipoIdentificacion" className="text-xs text-slate-500 font-bold">Tipo ID</Label>
                    <Select value={formData.tipoIdentificacion} onValueChange={(val) => setFormData(p => ({ ...p, tipoIdentificacion: val }))}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Seleccione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="04">RUC (04)</SelectItem>
                        <SelectItem value="05">Cédula (05)</SelectItem>
                        <SelectItem value="06">Pasaporte (06)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="identificacion" className="text-xs text-slate-500 font-bold">Identificación / RUC</Label>
                    <Input id="identificacion" name="identificacion" value={formData.identificacion} onChange={handleInputChange} placeholder="Ej: 1725389454001" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="razonSocial" className="text-xs text-slate-500 font-bold">Razón Social / Nombres</Label>
                  <Input id="razonSocial" name="razonSocial" value={formData.razonSocial} onChange={handleInputChange} placeholder="Razón social sujeto retenido" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="numeroFactura" className="text-xs text-slate-500 font-bold">Factura Sustentada</Label>
                    <Input id="numeroFactura" name="numeroFactura" value={formData.numeroFactura} onChange={handleInputChange} placeholder="001-001-000000001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fechaFactura" className="text-xs text-slate-500 font-bold">Fecha Factura</Label>
                    <Input id="fechaFactura" name="fechaFactura" value={formData.fechaFactura} onChange={handleInputChange} placeholder="DD/MM/YYYY" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* DETALLE DE IMPUESTOS A RETENER */}
          <Card className="border-none shadow-lg rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Detalle de Retención de Impuestos</CardTitle>
                <CardDescription>Ingrese las bases imponibles y los códigos de retención autorizados SRI</CardDescription>
              </div>
              <Button onClick={addRetencionRow} variant="outline" size="sm" className="rounded-xl font-bold">
                <Plus className="h-4 w-4 mr-1" /> Agregar Fila
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-bold">Tipo Impuesto</TableHead>
                      <TableHead className="font-bold">Cód. Retención</TableHead>
                      <TableHead className="font-bold">Base Imponible ($)</TableHead>
                      <TableHead className="font-bold">% Retener</TableHead>
                      <TableHead className="font-bold">Valor Retenido ($)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retenciones.map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell className="w-48">
                          <Select value={ret.codigo} onValueChange={(val) => updateRetencionRow(ret.id, 'codigo', val)}>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 - RENTA</SelectItem>
                              <SelectItem value="2">2 - IVA</SelectItem>
                              <SelectItem value="6">6 - ISD</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="w-40">
                          <Input 
                            placeholder="Ej. 312" 
                            value={ret.codigoRetencion} 
                            onChange={(e) => updateRetencionRow(ret.id, 'codigoRetencion', e.target.value)} 
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={ret.baseImponible} 
                            onChange={(e) => updateRetencionRow(ret.id, 'baseImponible', e.target.value)} 
                          />
                        </TableCell>
                        <TableCell className="w-32">
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={ret.porcentajeRetener} 
                            onChange={(e) => updateRetencionRow(ret.id, 'porcentajeRetener', e.target.value)} 
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            disabled 
                            value={ret.valorRetenido} 
                            className="bg-slate-100 font-bold text-slate-900" 
                          />
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeRetencionRow(ret.id)}
                            disabled={retenciones.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* BOTÓN INICIAL: GENERAR XML */}
          <div className="flex justify-end">
            <Button 
              onClick={handleGenerarXML} 
              size="lg" 
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-black rounded-2xl px-8 shadow-lg"
            >
              <FileCode2 className="mr-2 h-5 w-5" /> Generar XML Retención
            </Button>
          </div>

          {/* SECCIÓN PREVISUALIZACIÓN Y FLUJO PASO A PASO */}
          {xmlGenerado && (
            <Card className="border-2 border-primary/20 shadow-2xl bg-white rounded-3xl p-6 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <FileCode2 className="h-5 w-5 text-primary" /> Previsualización del XML y Flujo SRI
                  </h3>
                  {claveAccesoGenerada && (
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      Clave de Acceso (49 dígitos): <strong className="text-slate-800">{claveAccesoGenerada}</strong>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setModalXmlContent(xmlFirmado || xmlGenerado || ""); setShowXmlModal(true); }} className="rounded-xl">
                    <Eye className="h-4 w-4 mr-1" /> Ver XML
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyXml} className="rounded-xl">
                    {copiedXml ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />} 
                    {copiedXml ? "Copiado" : "Copiar XML"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadCurrentXml} className="rounded-xl">
                    <FileDown className="h-4 w-4 mr-1" /> Descargar XML
                  </Button>
                  <Button variant="default" size="sm" onClick={() => handleDownloadRIDE()} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                    <Download className="h-4 w-4 mr-1" /> Descargar RIDE (PDF)
                  </Button>
                </div>
              </div>

              {/* ACCIONES DEL FLUJO COMPLETO */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                {/* PASO 1: VALIDAR XML */}
                <Button
                  onClick={handleValidarXML}
                  disabled={loadingValidar}
                  variant="outline"
                  className="h-16 rounded-2xl font-bold flex flex-col items-center justify-center border-slate-200 hover:bg-slate-50"
                >
                  {loadingValidar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <>
                      <FileCode2 className="h-5 w-5 text-blue-600 mb-1" />
                      <span className="text-xs">1. Validar XML</span>
                    </>
                  )}
                </Button>

                {/* PASO 2: FIRMAR XML */}
                <Button
                  onClick={handleFirmarXML}
                  disabled={loadingFirmar}
                  className="h-16 rounded-2xl font-bold flex flex-col items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
                >
                  {loadingFirmar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5 text-white mb-1" />
                      <span className="text-xs">2. Firmar XML (Railway)</span>
                    </>
                  )}
                </Button>

                {/* PASO 3: ENVIAR SRI */}
                <Button
                  onClick={handleEnviarSRI}
                  disabled={loadingEnviar || estadoActual === "BORRADOR" || estadoActual === "XML_GENERADO"}
                  className="h-16 rounded-2xl font-bold flex flex-col items-center justify-center bg-amber-500 hover:bg-amber-600 text-white shadow-md disabled:opacity-50"
                >
                  {loadingEnviar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <>
                      <Send className="h-5 w-5 text-white mb-1" />
                      <span className="text-xs">3. Enviar al SRI</span>
                    </>
                  )}
                </Button>

                {/* PASO 4: CONSULTAR AUTORIZACIÓN */}
                <Button
                  onClick={handleConsultarAutorizacion}
                  disabled={loadingAutorizar || estadoActual === "BORRADOR" || estadoActual === "XML_GENERADO"}
                  className="h-16 rounded-2xl font-bold flex flex-col items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50"
                >
                  {loadingAutorizar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-white mb-1" />
                      <span className="text-xs">4. Consultar Autorización</span>
                    </>
                  )}
                </Button>
              </div>

              {/* RESPUESTA O HISTORIAL SRI */}
              {respuestaSri && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-xs overflow-x-auto text-slate-800 max-h-48">
                  <div className="font-bold text-slate-900 mb-1">Respuesta del SRI:</div>
                  <pre className="whitespace-pre-wrap">{respuestaSri}</pre>
                </div>
              )}
            </Card>
          )}

        </TabsContent>

        {/* PESTAÑA 3: HISTORIAL DE RETENCIONES GUARDADAS EN FIRESTORE */}
        <TabsContent value="historial" className="mt-6 space-y-4">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">Registro de Retenciones (Firestore)</CardTitle>
                  <CardDescription>Retenciones generadas y almacenadas en la colección `retenciones`</CardDescription>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por sujeto, N° Factura o Clave..."
                    value={searchHistoryTerm}
                    onChange={(e) => setSearchHistoryTerm(e.target.value)}
                    className="pl-9 bg-white border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/30">
                      <TableHead className="font-bold text-slate-700">N° Retención</TableHead>
                      <TableHead className="font-bold text-slate-700">Sujeto Retenido</TableHead>
                      <TableHead className="font-bold text-slate-700">N° Factura</TableHead>
                      <TableHead className="font-bold text-slate-700">Fecha</TableHead>
                      <TableHead className="font-bold text-slate-700">Total Retenido</TableHead>
                      <TableHead className="font-bold text-slate-700">Estado</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingSavedRetenciones ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSavedRetenciones.length > 0 ? (
                      filteredSavedRetenciones.map((ret: any) => (
                        <TableRow key={ret.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="font-mono text-xs font-bold text-primary">
                            {ret.numeroRetencion || `${ret.estab || '001'}-${ret.ptoEmi || '001'}-${ret.secuencial || '000000001'}`}
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-slate-900 text-sm">{ret.sujetoRetenido || "N/A"}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{ret.identificacion}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            {ret.numeroFactura || "N/A"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {ret.fechaEmision || "N/A"}
                          </TableCell>
                          <TableCell className="font-bold text-slate-900 text-sm">
                            ${Number(ret.totalRetenido || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {getBadgeEstado(ret.estado || "BORRADOR")}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Descargar RIDE (PDF)"
                              onClick={() => handleDownloadRIDE(ret)}
                            >
                              <Download className="h-4 w-4 text-blue-600" />
                            </Button>
                            {ret.xmlFirmado || ret.xmlGenerado ? (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Ver XML"
                                onClick={() => {
                                  setModalXmlContent(ret.xmlFirmado || ret.xmlGenerado || "");
                                  setShowXmlModal(true);
                                }}
                              >
                                <Eye className="h-4 w-4 text-slate-600" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40 text-center text-slate-500 italic">
                          No hay retenciones almacenadas en la base de datos Firestore.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO MODAL PARA MOSTRAR XML COMPLETO */}
      <Dialog open={showXmlModal} onOpenChange={setShowXmlModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Contenido XML de Retención</DialogTitle>
            <DialogDescription>
              {xmlFirmado ? "XML Firmado Digitalmente" : "XML Generado"}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-2xl overflow-x-auto">
            <pre className="whitespace-pre-wrap">{modalXmlContent || xmlFirmado || xmlGenerado}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
