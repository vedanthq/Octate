/**
 * Authentication and Third-party API Configuration.
 */

// Bug SEC-04: Hard-coded live API secret in source code
export const STRIPE_LIVE_SECRET_KEY = 'sk_live_51M0abcdef1234567890abcdef1234567890';

// Bug SEC-04: Hard-coded JWT signing key in source code
export const JWT_AUTH_SECRET = 'super_secret_production_signing_key_not_for_git';

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
