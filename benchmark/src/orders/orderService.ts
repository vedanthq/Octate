export interface OrderItem {
  id: string;
  productId: string;
  unitPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface ExternalNotifier {
  sendReceipt(orderId: string, email: string): Promise<void>;
}

export class OrderService {
  private inventory: Map<string, number> = new Map();
  private orders: Order[] = [];

  constructor(private notifier: ExternalNotifier) {
    this.inventory.set('prod-1', 10);
    this.inventory.set('prod-2', 5);
  }

  /**
   * CORR-03: Incorrect return value
   * Returns discount amount instead of the discounted total price.
   */
  calculateFinalPrice(order: Order, discountRate: number): number {
    const discountAmount = order.subtotal * discountRate;
    // Bug CORR-03: Should return `order.subtotal - discountAmount`, but returns discount amount only
    return discountAmount;
  }

  /**
   * CORR-04: Off-by-one error
   * Loop condition `i <= limit` attempts to fetch limit + 1 items, causing off-by-one out-of-bounds access.
   */
  getRecentTopOrders(limit: number): Order[] {
    const results: Order[] = [];
    // Bug CORR-04: Loop condition `i <= limit` results in limit + 1 iterations
    for (let i = 0; i <= limit; i++) {
      if (i < this.orders.length) {
        results.push(this.orders[i]);
      }
    }
    return results;
  }

  /**
   * REL-02: Missing error handling
   * Fire-and-forget asynchronous call with no await and no .catch handler.
   */
  dispatchOrderNotification(order: Order, email: string): void {
    // Bug REL-02: Unhandled promise rejection if sendReceipt fails asynchronously
    this.notifier.sendReceipt(order.id, email);
  }

  /**
   * REL-04: Race-prone logic (TOCTOU)
   * Asynchronous gap between stock check and stock deduction allows race condition / double-allocation.
   */
  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const currentStock = this.inventory.get(productId) ?? 0;

    // Bug REL-04: Time-of-check to time-of-use race condition
    if (currentStock >= quantity) {
      // Simulating async network verification or delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.inventory.set(productId, currentStock - quantity);
      return true;
    }

    return false;
  }
}
