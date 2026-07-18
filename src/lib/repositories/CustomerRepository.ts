import { Firestore, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

export interface Customer {
  id?: string;
  ruc: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  status?: string;
  createdAt?: any;
}

export class CustomerRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async findByRuc(ruc: string): Promise<Customer | null> {
    const q = query(collection(this.db, "customers"), where("ruc", "==", ruc));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;
    }
    return null;
  }

  async save(customer: Customer): Promise<string> {
    const docRef = await addDoc(collection(this.db, "customers"), {
      ...customer,
      status: "Activo",
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }
}
