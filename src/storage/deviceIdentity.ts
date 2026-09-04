import { todoDb, type TodoDb } from "./todoDb";

const ACTIVE_USER_ID_KEY = "active-user-id";

export async function getActiveUserId(
  db: TodoDb = todoDb,
): Promise<string | null> {
  return (await db.meta.get(ACTIVE_USER_ID_KEY))?.value ?? null;
}

export async function setActiveUserId(
  userId: string,
  db: TodoDb = todoDb,
): Promise<void> {
  await db.meta.put({ key: ACTIVE_USER_ID_KEY, value: userId });
}

export async function clearActiveUserId(
  db: TodoDb = todoDb,
): Promise<void> {
  await db.meta.delete(ACTIVE_USER_ID_KEY);
}
