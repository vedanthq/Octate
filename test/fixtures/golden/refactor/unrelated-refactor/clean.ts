export function formatCurrency(amountCents: number, currencyCode: string = "USD"): string {
  const formattedDollars = (amountCents / 100).toFixed(2);
  return `${currencyCode} $${formattedDollars}`;
}

export function formatUserGreeting(name: string, role?: string): string {
  const normalizedName = name.trim();
  const roleSuffix = role ? ` (${role})` : "";
  return `Hello, ${normalizedName}${roleSuffix}!`;
}
