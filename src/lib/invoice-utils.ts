/**
 * Indica si una factura fue emitida a Consumidor Final o sin datos reales del cliente.
 * El SRI no permite emitir Notas de Crédito a Consumidor Final.
 *
 * Acepta cédula (10), RUC (13) y también pasaportes/identificaciones del exterior,
 * que pueden contener letras: no se eliminan los caracteres no numéricos.
 */
export function isConsumidorFinalInvoice(inv: any, override?: { ruc?: string; name?: string }): boolean {
  const rawId = String(
    override?.ruc ||
    inv?.clientData?.ruc ||
    inv?.clientData?.identificacion ||
    inv?.customerRuc ||
    ""
  ).trim();
  const name = String(override?.name || inv?.clientData?.name || inv?.customerName || "").trim();
  const tipoId = String(inv?.clientData?.tipoIdentificacion || inv?.tipoIdentificacionComprador || "").trim();

  if (tipoId === "07") return true; // Código SRI de Consumidor Final
  if (!rawId) return true;

  const digits = rawId.replace(/\D/g, "");
  if (digits && digits === rawId && /^9+$/.test(digits)) return true;

  if (!name || name.toUpperCase().includes("CONSUMIDOR FINAL")) return true;
  return false;
}
