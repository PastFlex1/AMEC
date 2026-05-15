"use client";

import { useState } from "react";
import { summarizeSalesData, type SummarizeSalesDataOutput } from "@/ai/flows/summarize-sales-data-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, BarChart3, TrendingUp, Lightbulb, Loader2, Copy, FileJson } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function AISummaryPage() {
  const { toast } = useToast();
  const [data, setData] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeSalesDataOutput | null>(null);

  const handleSummarize = async () => {
    if (!data.trim()) {
      toast({
        title: "Datos vacíos",
        description: "Por favor proporcione algunos datos de ventas para analizar.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const output = await summarizeSalesData({ salesData: data });
      setResult(output);
    } catch (error) {
      toast({
        title: "Error en el análisis",
        description: "Ocurrió un error al procesar los datos.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSampleData = () => {
    const sample = JSON.stringify([
      { date: "2023-10-01", customer: "TechCorp", amount: 1500, category: "Software" },
      { date: "2023-10-02", customer: "GlobalNet", amount: 2400, category: "Services" },
      { date: "2023-10-05", customer: "TechCorp", amount: 300, category: "Software" },
      { date: "2023-10-10", customer: "Modern Media", amount: 5000, category: "Implementation" },
      { date: "2023-10-12", customer: "Green Energy", amount: 1200, category: "Software" }
    ], null, 2);
    setData(sample);
  };

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inteligencia de Ventas IA</h1>
          <p className="text-muted-foreground">Extraiga análisis profundos y resúmenes de sus registros de ventas.</p>
        </div>
        <Button variant="outline" onClick={loadSampleData}>
          <FileJson className="mr-2 h-4 w-4" />
          Cargar Datos de Ejemplo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos de Ventas</CardTitle>
              <CardDescription>Pegue reportes en CSV, JSON o texto plano abajo.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                placeholder="Ej: El Cliente A compró Software por $500 el 1 de Mayo..."
                className="min-h-[400px] font-mono text-sm leading-relaxed"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleSummarize} 
                className="w-full bg-accent hover:bg-accent/90" 
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando Análisis...</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" /> Analizar con IA</>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          {!result && !loading ? (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold">Sin Análisis Aún</h3>
              <p className="max-w-[280px] mt-2">Ingrese sus datos de ventas a la izquierda y haga clic en 'Analizar con IA'.</p>
            </div>
          ) : result ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-700">
              <Card className="border-accent/30 bg-accent/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-accent" />
                    Resumen Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed">
                    {result.summary}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    Análisis Clave
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="divide-y">
                     {result.keyInsights.map((insight, idx) => (
                       <div key={idx} className="p-4 flex gap-4">
                         <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                           {idx + 1}
                         </Badge>
                         <p className="text-sm">{insight}</p>
                       </div>
                     ))}
                   </div>
                </CardContent>
                <CardFooter className="justify-end border-t pt-4">
                  <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                    toast({ title: "Copiado", description: "Análisis copiado al portapapeles." });
                  }}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar Todo
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
              <Loader2 className="h-12 w-12 text-accent animate-spin" />
              <p className="text-muted-foreground">Nuestra IA está analizando los números...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
