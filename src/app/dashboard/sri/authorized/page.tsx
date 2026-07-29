"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  CheckCircle2, 
  Search, 
  FileText, 
  Download, 
  Calendar, 
  Loader2,
  Code,
  Hash,
  Mail
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useFirestore, useCollection } from "@/firebase";
import { collection, getDoc, doc, query, where, limit } from "firebase/firestore";
import { format, parseISO, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { DEFAULT_TAX_CONFIG, TaxConfig } from "@/lib/config-helper";
import { generateBillingPDF, getBillingPDFBase64 } from "@/lib/pdf-service";
import { generateInvoiceXML, downloadXML } from "@/lib/sri-xml-service";
import { sendBillingEmail } from "@/app/actions/email-actions";
import { useToast } from "@/hooks/use-toast";

export default function AuthorizedInvoicesPage() {
  const { toast } = useToast();
  const db = useFirestore();
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(DEFAULT_TAX_CONFIG);
  const [searchTerm, setSearchTerm] = useState("");
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "taxConfig", "current")).then((snap) => {
      if (snap.exists()) {
        setTaxConfig(snap.data() as TaxConfig);
      }
    }).catch((err) => console.error("Error al cargar config de emisor:", err));
  }, [db]);

  const invoicesRef = useMemo(() => (db ? query(collection(db, "invoices"), where("status", "==", "Autorizado"), limit(100)) : null), [db]);
  const { data: allInvoices, loading } = useCollection(invoicesRef);

  const formatDocDate = (dateVal: any) => {
    if (!dateVal) return "N/A";
    try {
      if (typeof dateVal === 'string') {
        return format(parseISO(dateVal), "dd/MM/yyyy", { locale: es });
      }
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(d, "dd/MM/yyyy", { locale: es });
    } catch (e) {
      return "N/A";
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!allInvoices) return [];
    
    return allInvoices
      .filter((inv: any) => {
        if (inv.status !== "Autorizado") return false;

        const customer = inv.clientData?.name || inv.customerName || "Consumidor Final";
        const num = inv.invoiceNumber || "";
        const ruc = inv.clientData?.ruc || inv.customerRuc || "";
        const term = searchTerm.toLowerCase();
        
        return customer.toLowerCase().includes(term) || 
               num.toLowerCase().includes(term) ||
               ruc.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => {
        const numA = a.invoiceNumber || "";
        const numB = b.invoiceNumber || "";
        return numB.localeCompare(numA);
      });
  }, [allInvoices, searchTerm]);

  const stats = useMemo(() => {
    const authorized = (allInvoices || []).filter((inv: any) => inv.status === "Autorizado");
    const todayCount = authorized.filter((inv: any) => {
      try {
        const d = inv.date?.toDate ? inv.date.toDate() : new Date(inv.date);
        return isToday(d);
      } catch (e) {
        return false;
      }
    }).length;
    return { today: todayCount, total: authorized.length };
  }, [allInvoices]);

  const handleDownloadRIDE = (inv: any) => {
    try {
      generateBillingPDF({
        title: "Factura",
        client: {
          name: inv.clientData?.name || inv.customerName || "Consumidor Final",
          ruc: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          address: inv.clientData?.address || "S/N",
          email: inv.clientData?.email || "N/A",
          paymentMethod: inv.clientData?.paymentMethod || "01",
          transferNumber: inv.clientData?.transferNumber
        },
        items: inv.items || [],
        total: inv.total || 0,
        subtotal: inv.total || 0,
        iva: 0,
        date: formatDocDate(inv.date),
        docNumber: inv.invoiceNumber,
        status: inv.status,
        time: inv.authDate,
        observations: inv.observations
      });
      toast({ title: "RIDE Descargado" });
    } catch (e) {
      toast({ title: "Error al generar PDF", variant: "destructive" });
    }
  };

  const handleDownloadXML = (inv: any) => {
    try {
      if (inv.authorizedXml) {
        downloadXML(inv.authorizedXml, `Factura_Autorizada_${inv.invoiceNumber}.xml`);
        toast({ title: "XML Oficial Descargado" });
        return;
      }

      const xml = generateInvoiceXML({
        rucEmisor: taxConfig.ruc,
        razonSocialEmisor: taxConfig.razonSocial,
        dirMatriz: taxConfig.dirMatriz,
        estab: taxConfig.estab,
        ptoEmi: taxConfig.ptoEmi,
        secuencial: inv.invoiceNumber.split("-")[2],
        fechaEmision: formatDocDate(inv.date),
        cliente: {
          razonSocial: inv.clientData?.name || inv.customerName || "CONSUMIDOR FINAL",
          identificacion: inv.clientData?.identificacion || inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          direccion: inv.clientData?.address || "S/N",
          email: inv.clientData?.email
        },
        items: (inv.items || []).map((item: any) => ({
          descripcion: item.description,
          cantidad: item.cantidad,
          precioUnitario: item.unitPrice,
          ivaRate: item.ivaRate
        })),
        formaPago: inv.clientData?.paymentMethod || "01",
        regimen: taxConfig.regimen,
        obligadoContabilidad: taxConfig.obligado_contabilidad ? "SI" : "NO"
      });
      downloadXML(xml, `Factura_Autorizada_${inv.invoiceNumber}.xml`);
      toast({ title: "XML Descargado" });
    } catch (e) {
      toast({ title: "Error al generar XML", variant: "destructive" });
    }
  };

  const handleResendEmail = async (inv: any) => {
    const clientEmail = inv.clientData?.email;
    if (!clientEmail) {
      toast({ title: "Email no registrado", description: "El cliente no tiene un correo asignado.", variant: "destructive" });
      return;
    }

    setSendingEmailId(inv.id);
    try {
      const base64 = getBillingPDFBase64({
        title: "Factura",
        client: {
          name: inv.clientData?.name || inv.customerName || "Consumidor Final",
          ruc: inv.clientData?.ruc || inv.customerRuc || "9999999999999",
          address: inv.clientData?.address || "S/N",
          email: clientEmail,
          paymentMethod: inv.clientData?.paymentMethod || "01",
          transferNumber: inv.clientData?.transferNumber
        },
        items: inv.items || [],
        total: inv.total || 0,
        subtotal: inv.total || 0,
        iva: 0,
        date: formatDocDate(inv.date),
        docNumber: inv.invoiceNumber,
        status: inv.status,
        time: inv.authDate,
        observations: inv.observations
      });

      const res = await sendBillingEmail({
        to: clientEmail,
        subject: `Reenvío: Factura Autorizada AMEC - #${inv.invoiceNumber}`,
        clientName: inv.clientData?.name || "Cliente",
        docType: "Factura",
        total: inv.total || 0,
        docNumber: inv.invoiceNumber,
        pdfBase64: base64,
        xmlContent: inv.authorizedXml || undefined,
        observations: inv.observations
      });

      if (res.success) {
        toast({ title: "Correo Reenviado", description: `Se envió el comprobante a ${clientEmail}` });
      } else {
        throw new Error(res.error);
      }
    } catch (error: any) {
      toast({ title: "Error de envío", description: error.message, variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900">Documentos Autorizados</h1>
          <p className="text-muted-foreground font-medium">Facturas con validación legal del SRI (Ambiente Producción).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-xl bg-emerald-500 text-white rounded-3xl overflow-hidden relative">
          <CardHeader className="pb-2">
            <div className="text-xs font-black uppercase tracking-widest text-white/70 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Autorizadas Hoy
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{stats.today}</div>
            <p className="text-xs text-white/60 mt-1">Sincronizado con SRI</p>
          </CardContent>
          <div className="absolute right-[-10%] bottom-[-20%] opacity-10">
            <CheckCircle2 className="h-32 w-32" />
          </div>
        </Card>
        
        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-500" /> Histórico Total
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Registros legales</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-white rounded-3xl">
          <CardHeader className="pb-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Canal de Emisión
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">Normal</div>
            <p className="text-xs text-muted-foreground mt-1">Sincronización Web Service</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-slate-50 bg-slate-50/30 p-8">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, RUC o factura..."
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
                  <TableHead className="px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">No. Comprobante</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Cliente / Receptor</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Fecha Emisión</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Monto</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-400">Autorización SRI</TableHead>
                  <TableHead className="text-right px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filteredInvoices.length > 0 ? (
                  filteredInvoices.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors border-b last:border-0">
                      <TableCell className="px-8 font-mono text-xs font-bold text-primary">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 opacity-50" />
                          {inv.invoiceNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-900">{inv.clientData?.name || "Consumidor Final"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.clientData?.ruc}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                         <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDocDate(inv.date)}</div>
                      </TableCell>
                      <TableCell className="font-black text-slate-900">${(inv.total || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">Autorizado</span>
                          <span className="text-[10px] text-slate-400 font-mono">{inv.authDate}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-8 space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Reenviar por Email" 
                          disabled={sendingEmailId === inv.id}
                          onClick={() => handleResendEmail(inv)}
                        >
                          {sendingEmailId === inv.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Mail className="h-4 w-4 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="icon" title="Descargar XML" onClick={() => handleDownloadXML(inv)}>
                          <Code className="h-4 w-4 text-orange-500" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Descargar RIDE" onClick={() => handleDownloadRIDE(inv)}>
                          <Download className="h-4 w-4 text-blue-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground italic">
                      No se han encontrado facturas autorizadas en el sistema.
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
