export function formatCurrency(cents: number, currency: string = "USD"): string {
  const dollars = (cents / 100).toFixed(2);
  return `${currency} $${dollars}`;
}

export function formatUserGreeting(userName: string, userRole?: string): string {
  const cleanName = userName.trim();
  const suffix = userRole ? ` (${userRole})` : "";
  return `Hello, ${cleanName}${suffix}!`;
}
