import { Firestore, doc, updateDoc, increment, collection, getDocs, query, where, DocumentData, getDoc } from "firebase/firestore";

export interface Product {
  id: string;
  name: string;
  price: number;
  stock?: number;
  // ... other fields as needed
}

export class ProductRepository {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async getAllProducts(): Promise<Product[]> {
    const snap = await getDocs(collection(this.db, "products"));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  }
  
  async getProduct(id: string): Promise<Product | null> {
    const docRef = doc(this.db, "products", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Product;
    }
    return null;
  }

  async updateStock(productId: string, quantityToDeduct: number): Promise<void> {
    const docRef = doc(this.db, "products", productId);
    await updateDoc(docRef, {
      stock: increment(-quantityToDeduct)
    });
  }
}
