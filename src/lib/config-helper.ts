export interface TaxConfig {
  id?: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  regimen: string;
  obligado_contabilidad: boolean;
  agente_retencion: boolean;
  contribuyente_especial: boolean;
  declara_iva: boolean;
  periodicidad_iva: "SEMESTRAL" | "MENSUAL";
  tarifa_iva_default: number;
  dirMatriz: string;
  estab: string;
  ptoEmi: string;
  phone: string;
  email: string;
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  ruc: "1725389454001",
  razonSocial: "MORALES TOBAR ANDRES PAUL",
  nombreComercial: "AMEC",
  regimen: "RIMPE - EMPRENDEDOR",
  obligado_contabilidad: false,
  agente_retencion: false,
  contribuyente_especial: false,
  declara_iva: true,
  periodicidad_iva: "SEMESTRAL",
  tarifa_iva_default: 15,
  dirMatriz: "Av Jaime roldos oe2-128 y Francisco Sánchez",
  estab: "001",
  ptoEmi: "100",
  phone: "025158093 - 0992769292 - 0989411821",
  email: "amec.marcando.diferencia@hotmail.com"
};
