import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Recalcula y sincroniza el cierre de caja para un vendedor y una fecha específica (formato YYYY-MM-DD).
 * Consulta en tiempo real todas las facturas autorizadas, notas de venta activas y abonos del día,
 * reconstruyendo el cierre de caja de forma 100% precisa y libre de duplicados o desincronizaciones.
 */
export async function syncDailyCashClosing(db: any, sellerName: string, dateString: string) {
  if (!db || !sellerName || !dateString) return;

  try {
    const start = new Date(`${dateString}T00:00:00`);
    const end = new Date(`${dateString}T23:59:59.999`);

    // 1. Obtener Facturas autorizadas del vendedor creadas en esta fecha
    const invoicesRef = collection(db, "invoices");
    const qInvoices = query(
      invoicesRef,
      where("createdBy", "==", sellerName)
    );
    const snapInvoices = await getDocs(qInvoices);
    const dayInvoices = snapInvoices.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((d: any) => {
        if (!d.createdAt) return false;
        const time = d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime();
        return time >= start.getTime() && time <= end.getTime() && d.status === "Autorizado";
      });

    // 2. Obtener Notas de Venta activas del vendedor creadas en esta fecha
    const notesRef = collection(db, "salesNotes");
    const qNotes = query(
      notesRef,
      where("createdBy", "==", sellerName)
    );
    const snapNotes = await getDocs(qNotes);
    const dayNotes = snapNotes.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((d: any) => {
        if (!d.createdAt) return false;
        const time = d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime();
        return time >= start.getTime() && time <= end.getTime() && d.status !== "Anulado";
      });

    // 3. Obtener Pagos/Abonos registrados por el vendedor en esta fecha
    const paymentsRef = collection(db, "payments");
    const qPayments = query(
      paymentsRef,
      where("sellerName", "==", sellerName)
    );
    const snapPayments = await getDocs(qPayments);
    const dayPayments = snapPayments.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((d: any) => {
        if (!d.createdAt) return false;
        const time = d.createdAt.toDate ? d.createdAt.toDate().getTime() : new Date(d.createdAt).getTime();
        return time >= start.getTime() && time <= end.getTime();
      });

    // Inicializar cálculos
    let cash = 0;
    let transfers = 0;
    let cards = 0;
    let totalAmount = 0;
    const documents: any[] = [];

    const newInvoiceIds = new Set(dayInvoices.map(d => d.id));
    const newNoteIds = new Set(dayNotes.map(d => d.id));

    // Procesar Facturas del día
    dayInvoices.forEach((doc: any) => {
      const method = doc.clientData?.paymentMethod || "01";
      const amount = doc.total || 0;
      totalAmount += amount;
      if (method === "01") cash += amount;
      else if (method === "16" || method === "18" || method === "19") cards += amount;
      else if (method === "20") transfers += amount;
      else cash += amount;

      documents.push({
        type: "Factura",
        num: doc.invoiceNumber || "S/N",
        amount: amount,
        client: doc.clientData?.name || doc.customerName || "Consumidor Final"
      });
    });

    // Procesar Notas de Venta del día
    dayNotes.forEach((doc: any) => {
      const method = doc.clientData?.paymentMethod || "01";
      const amount = doc.total || 0;
      totalAmount += amount;
      if (method === "01") cash += amount;
      else if (method === "16" || method === "18" || method === "19") cards += amount;
      else if (method === "20") transfers += amount;
      else cash += amount;

      documents.push({
        type: "Nota de Venta",
        num: doc.noteNumber || "S/N",
        amount: amount,
        client: doc.clientData?.name || doc.customerName || "Cliente"
      });
    });

    // Procesar abonos a facturas/notas de otros días (que se cobraron hoy)
    const oldDocPayments = dayPayments.filter(p => !newInvoiceIds.has(p.docId) && !newNoteIds.has(p.docId));
    oldDocPayments.forEach((p: any) => {
      const method = p.paymentMethod || "01";
      const amount = p.amount || 0;
      totalAmount += amount;
      if (method === "01") cash += amount;
      else if (method === "16" || method === "18" || method === "19") cards += amount;
      else if (method === "20") transfers += amount;
      else cash += amount;

      documents.push({
        type: `Abono ${p.type}`,
        num: p.docNumber || "S/N",
        amount: amount,
        client: p.clientName || "Cliente"
      });
    });

    // Guardar o actualizar el documento correspondiente a este día y vendedor
    const closingDocId = `${sellerName}_${dateString}`;
    await setDoc(doc(db, "cashClosings", closingDocId), {
      sellerName,
      dateString,
      closingDate: serverTimestamp(),
      totalAmount,
      cash,
      transfers,
      cards,
      invoicesCount: dayInvoices.length,
      notesCount: dayNotes.length,
      documents
    }, { merge: true });

    console.log(`[Caja] Sincronización exitosa para ${sellerName} el ${dateString}: Total $${totalAmount}`);
  } catch (error) {
    console.error(`[Caja] Error al sincronizar cierre de caja para ${sellerName} el ${dateString}:`, error);
  }
}
