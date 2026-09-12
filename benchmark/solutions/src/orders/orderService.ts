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
   * CORR-03 (RESOLVED): Incorrect return value
   * Returns the final net price after applying discount.
   */
  calculateFinalPrice(order: Order, discountRate: number): number {
    const discountAmount = order.subtotal * discountRate;
    return Math.max(0, order.subtotal - discountAmount);
  }

  /**
   * CORR-04 (RESOLVED): Off-by-one error
   * Strictly iterates `limit` times (`i < limit`) to preserve pagination bounds.
   */
  getRecentTopOrders(limit: number): Order[] {
    const results: Order[] = [];
    for (let i = 0; i < limit; i++) {
      if (i < this.orders.length) {
        results.push(this.orders[i]);
      }
    }
    return results;
  }

  private pendingReservations: Map<string, Promise<void>> = new Map();

  /**
   * REL-02 (RESOLVED): Missing error handling
   * Properly catches and logs asynchronous notification failures to prevent unhandled rejections.
   */
  dispatchOrderNotification(order: Order, email: string): void {
    this.notifier.sendReceipt(order.id, email).catch((error) => {
      process.stderr.write(`[WARN] Failed to send order receipt for ${order.id}: ${String(error)}\n`);
    });
  }

  /**
   * REL-04 (RESOLVED): Race-prone logic (TOCTOU)
   * Serializes inventory reservation operations per-product to eliminate TOCTOU race conditions.
   */
  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const previous = this.pendingReservations.get(productId) ?? Promise.resolve();

    let release = () => {};
    const currentLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pendingReservations.set(productId, currentLock);

    await previous;
    try {
      const currentStock = this.inventory.get(productId) ?? 0;
      if (currentStock >= quantity) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        this.inventory.set(productId, currentStock - quantity);
        return true;
      }
      return false;
    } finally {
      release();
      if (this.pendingReservations.get(productId) === currentLock) {
        this.pendingReservations.delete(productId);
      }
    }
  }
}
