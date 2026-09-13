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
