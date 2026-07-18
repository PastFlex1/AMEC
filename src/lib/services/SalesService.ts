import { Firestore } from "firebase/firestore";
import { CustomerRepository, Customer } from "../repositories/CustomerRepository";
import { ProductRepository } from "../repositories/ProductRepository";
import { SalesNoteRepository, SalesNote } from "../repositories/SalesNoteRepository";
import { syncDailyCashClosing } from "../cash-register-service";

export class SalesService {
  private customerRepo: CustomerRepository;
  private productRepo: ProductRepository;
  private salesNoteRepo: SalesNoteRepository;
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
    this.customerRepo = new CustomerRepository(db);
    this.productRepo = new ProductRepository(db);
    this.salesNoteRepo = new SalesNoteRepository(db);
  }

  async processSalesNote(note: SalesNote, dateString: string, sellerName: string): Promise<string> {
    const isNew = !note.id;
    
    // Save the sales note
    const noteId = await this.salesNoteRepo.save(note);

    // If new, update stock
    if (isNew) {
      const stockPromises = note.items.map(item => {
        if (item.productId && item.quantity > 0) {
          return this.productRepo.updateStock(item.productId, item.quantity);
        }
        return Promise.resolve();
      });
      await Promise.all(stockPromises);
    }

    // Sync daily cash
    await syncDailyCashClosing(this.db, sellerName, dateString);

    return noteId;
  }

  async findCustomerByRuc(ruc: string): Promise<Customer | null> {
    return this.customerRepo.findByRuc(ruc);
  }

  async saveCustomer(customer: Customer): Promise<string> {
    return this.customerRepo.save(customer);
  }

  subscribeToLatestNoteNumber(callback: (noteNumber: string) => void): () => void {
    return this.salesNoteRepo.subscribeToLatestNoteNumber(callback);
  }
}
