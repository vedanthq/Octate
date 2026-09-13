import type { DatabaseClient } from "./client.js";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getUserById(db: DatabaseClient, userId: string): Promise<UserRecord | null> {
  // Parameterized query preventing SQL injection
  const query = "SELECT * FROM users WHERE id = $1";
  const result = await db.query(query, [userId]);
  return (result.rows[0] as UserRecord) ?? null;
}
