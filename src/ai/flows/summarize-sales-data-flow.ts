'use server';
/**
 * @fileOverview Un flujo de Genkit para que los administradores obtengan resúmenes rápidos y análisis clave de los datos de ventas.
 *
 * - summarizeSalesData - Función que maneja el proceso de resumen de datos de ventas.
 * - SummarizeSalesDataInput - El tipo de entrada para la función summarizeSalesData.
 * - SummarizeSalesDataOutput - El tipo de retorno para la función summarizeSalesData.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeSalesDataInputSchema = z.object({
  salesData: z
    .string()
    .describe(
      'Datos brutos de ventas, que pueden estar en varios formatos como CSV, JSON o texto plano, para resumir.'
    ),
});
export type SummarizeSalesDataInput = z.infer<typeof SummarizeSalesDataInputSchema>;

const SummarizeSalesDataOutputSchema = z.object({
  summary: z.string().describe('Un resumen conciso de los datos de ventas proporcionados.'),
  keyInsights: z
    .array(z.string())
    .describe('Una lista de análisis clave o tendencias observadas en los datos de ventas.'),
});
export type SummarizeSalesDataOutput = z.infer<typeof SummarizeSalesDataOutputSchema>;

export async function summarizeSalesData(input: SummarizeSalesDataInput): Promise<SummarizeSalesDataOutput> {
  return summarizeSalesDataFlow(input);
}

const summarizeSalesDataPrompt = ai.definePrompt({
  name: 'summarizeSalesDataPrompt',
  input: {schema: SummarizeSalesDataInputSchema},
  output: {schema: SummarizeSalesDataOutputSchema},
  prompt: `Eres un analista de ventas experto. Tu respuesta debe estar completamente en ESPAÑOL.

Tu tarea es proporcionar un resumen conciso y una lista de análisis clave de los datos de ventas proporcionados. Analiza los datos cuidadosamente para identificar tendencias importantes, anomalías o métricas de desempeño.

Datos de Ventas:
{{{salesData}}}

Por favor proporciona:
1. Un resumen conciso del desempeño de ventas.
2. Una lista de análisis clave o tendencias observadas. Cada análisis debe ser un elemento separado.`,
});

const summarizeSalesDataFlow = ai.defineFlow(
  {
    name: 'summarizeSalesDataFlow',
    inputSchema: SummarizeSalesDataInputSchema,
    outputSchema: SummarizeSalesDataOutputSchema,
  },
  async input => {
    const {output} = await summarizeSalesDataPrompt(input);
    if (!output) {
      throw new Error('No se pudo generar el resumen y los análisis de ventas.');
    }
    return output;
  }
);
