import type { DatabaseClient } from './client.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getUserById(db: DatabaseClient, userId: string): Promise<UserRecord | null> {
  // Vulnerable to SQL injection via unescaped string interpolation
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  const result = await db.query(query);
  return (result.rows[0] as UserRecord) ?? null;
}
