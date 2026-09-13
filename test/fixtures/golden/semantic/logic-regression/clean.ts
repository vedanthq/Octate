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

  // Discount applied to taxable subtotal with non-negative bounds check
  const discountedSubtotal = Math.max(0, subtotal - options.discountCouponAmount);
  const tax = discountedSubtotal * options.taxRate;
  return discountedSubtotal + tax;
}
