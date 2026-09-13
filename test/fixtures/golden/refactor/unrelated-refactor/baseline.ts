export function formatCurrency(cents: number, currency: string = "USD"): string {
  const dollars = (cents / 100).toFixed(2);
  return `${currency} $${dollars}`;
}
