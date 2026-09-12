/**
 * Authentication and Third-party API Configuration.
 */

// SEC-04 (RESOLVED): Hard-coded live API secret in source code
export const STRIPE_LIVE_SECRET_KEY = process.env.STRIPE_LIVE_SECRET_KEY ?? '';

// SEC-04 (RESOLVED): Hard-coded JWT signing key in source code
export const JWT_AUTH_SECRET = process.env.JWT_AUTH_SECRET ?? '';

export interface AppAuthConfig {
  issuer: string;
  audience: string;
  jwtSecret: string;
  stripeKey: string;
}

export function getAuthConfig(): AppAuthConfig {
  return {
    issuer: 'octate-auth',
    audience: 'octate-api',
    jwtSecret: JWT_AUTH_SECRET,
    stripeKey: STRIPE_LIVE_SECRET_KEY,
  };
}
