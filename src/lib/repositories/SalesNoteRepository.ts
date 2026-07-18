import { Firestore, collection, query, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";

export interface SalesNoteItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: string | null;
  maxStock?: number | null;
}

export interface SalesNote {
  id?: string;
  noteNumber: string;
  clientData: any;
  items: SalesNoteItem[];
  total: number;
  deposit: number;
  balance: number;
  observations: string;
  status: string;
  date: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export class SalesNoteRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async getLatestNoteNumber(): Promise<string> {
    const q = query(collection(this.db, "salesNotes"), orderBy("noteNumber", "desc"), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const lastDoc = snapshot.docs[0].data();
      const lastNum = lastDoc.noteNumber || "002-001-000000000";
      const parts = lastNum.split("-");
      if (parts.length === 3) {
        const sequence = parseInt(parts[2]) + 1;
        return `002-001-${sequence.toString().padStart(9, '0')}`;
      }
    }
    return "002-001-000000001";
  }

  subscribeToLatestNoteNumber(callback: (noteNumber: string) => void): () => void {
    const q = query(collection(this.db, "salesNotes"), orderBy("noteNumber", "desc"), limit(1));
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const lastDoc = snapshot.docs[0].data();
        const lastNum = lastDoc.noteNumber || "002-001-000000000";
        const parts = lastNum.split("-");
        if (parts.length === 3) {
          const sequence = parseInt(parts[2]) + 1;
          callback(`002-001-${sequence.toString().padStart(9, '0')}`);
          return;
        }
      }
      callback("002-001-000000001");
    });
  }

  async save(note: SalesNote): Promise<string> {
    const noteData = {
      ...note,
      updatedAt: serverTimestamp()
    };

    if (note.id) {
      await updateDoc(doc(this.db, "salesNotes", note.id), noteData);
      return note.id;
    } else {
      noteData.createdAt = serverTimestamp();
      const docRef = await addDoc(collection(this.db, "salesNotes"), noteData);
      return docRef.id;
    }
  }
}
