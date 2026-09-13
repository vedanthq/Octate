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
