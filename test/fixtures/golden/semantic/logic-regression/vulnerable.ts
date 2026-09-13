export interface PricingItem {
  sku: string;
  price: number;
  quantity: number;
}

export interface PricingOptions {
  taxRate: number;
  discountCouponAmount: number;
}

export function getStandardTaxRate(): number {
  return 0.08;
}

export function calculateOrderTotal(items: PricingItem[], options: PricingOptions): number {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }

  // Regression: Tax computed on total before discount, then discount subtracted after tax
  const tax = subtotal * options.taxRate;
  const total = subtotal + tax - options.discountCouponAmount;
  return total;
}
