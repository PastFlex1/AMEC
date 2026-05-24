"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFirestore } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Wallet } from "lucide-react";

export function PendingCashClosingModal() {
  const db = useFirestore();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPendingClosing = async () => {
      if (!db) return;
      const userName = localStorage.getItem('amec_user_name');
      if (!userName) {
        setLoading(false);
        return;
      }

      try {
        // 1. Get the last closing date for this user
        const qClosings = query(
          collection(db, "cashClosings"),
          where("sellerName", "==", userName)
        );
        const snapClosings = await getDocs(qClosings);
        let lastClosingTime = 0;
        
        if (!snapClosings.empty) {
          const closings = snapClosings.docs.map(d => d.data());
          // Sort manually in case orderBy requires an index
          closings.sort((a: any, b: any) => {
            const tA = a.closingDate && typeof a.closingDate.toMillis === 'function' ? a.closingDate.toMillis() : (a.closingDate ? Date.now() : 0);
            const tB = b.closingDate && typeof b.closingDate.toMillis === 'function' ? b.closingDate.toMillis() : (b.closingDate ? Date.now() : 0);
            return tB - tA;
          });
          lastClosingTime = closings[0]?.closingDate && typeof closings[0].closingDate.toMillis === 'function' ? closings[0].closingDate.toMillis() : (closings[0]?.closingDate ? Date.now() : 0);
        }

        // 2. Fetch invoices and notes after lastClosingTime
        const qInvoices = query(collection(db, "invoices"), where("createdBy", "==", userName));
        const snapInvoices = await getDocs(qInvoices);
        const newInvoices = snapInvoices.docs.map(d => d.data()).filter((d: any) => 
          d.createdAt && d.createdAt.toMillis() > lastClosingTime && d.status === "Autorizado"
        );

        const qNotes = query(collection(db, "salesNotes"), where("createdBy", "==", userName));
        const snapNotes = await getDocs(qNotes);
        const newNotes = snapNotes.docs.map(d => d.data()).filter((d: any) => 
          d.createdAt && d.createdAt.toMillis() > lastClosingTime && d.status !== "Anulado"
        );

        const allNewDocs = [...newInvoices, ...newNotes];
        
        if (allNewDocs.length > 0) {
          // Sort by oldest first
          allNewDocs.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
          const oldestDoc = allNewDocs[0];
          
          const currentTime = Date.now();
          const oldestTime = oldestDoc.createdAt.toMillis();
          
          const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
          
          if (currentTime - oldestTime > twentyFourHoursInMs) {
            setIsOpen(true);
          }
        }
      } catch (error) {
        console.error("Error checking pending cash closing:", error);
      } finally {
        setLoading(false);
      }
    };

    checkPendingClosing();
  }, [db]);

  const handleGoToCashRegister = () => {
    setIsOpen(false);
    router.push('/dashboard/cash-register');
  };

  if (loading) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md rounded-3xl overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-amber-50/50 border-b border-amber-100 flex flex-col items-center text-center space-y-4">
          <div className="h-16 w-16 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-black text-amber-900">
              Cierre de Caja Pendiente
            </DialogTitle>
            <DialogDescription className="text-amber-700/80 font-medium">
              Han pasado más de 24 horas desde tus últimas ventas registradas.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="p-6 text-center space-y-4">
          <p className="text-slate-600 text-sm">
            Para mantener el orden contable, es necesario que realices el cierre de caja de tu turno anterior antes de continuar facturando.
          </p>
        </div>
        <DialogFooter className="p-4 bg-slate-50 border-t flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="flex-1 rounded-xl h-12"
          >
            Más tarde
          </Button>
          <Button
            onClick={handleGoToCashRegister}
            className="flex-1 rounded-xl h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold"
          >
            <Wallet className="mr-2 h-4 w-4" />
            Ir a Cerrar Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
