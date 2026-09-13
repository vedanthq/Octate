import type { DatabaseClient } from "./client.js";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getUserCount(db: DatabaseClient): Promise<number> {
  const result = await db.query("SELECT COUNT(*) as cnt FROM users");
  return Number(result.rows[0]?.cnt ?? 0);
}

export async function getUserById(db: DatabaseClient, userId: string): Promise<UserRecord | null> {
  // Parameterized query preventing SQL injection
  const query = "SELECT * FROM users WHERE id = $1";
  const result = await db.query(query, [userId]);
  return (result.rows[0] as UserRecord) ?? null;
}
