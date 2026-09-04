import { ownerKeyForUser } from "../storage/todoDb";
import type { LocalTodoRepository } from "../storage/todoRepository";
import { remoteToLocal } from "./supabaseTodoRemote";
import type { SyncResult, TodoRemote } from "./types";

export async function syncTodos(
  repository: LocalTodoRepository,
  remote: TodoRemote,
  userId: string,
): Promise<SyncResult> {
  const ownerKey = ownerKeyForUser(userId);
  await repository.claimAnonymous(ownerKey);

  let pushed = 0;
  let pulled = 0;
  let errors = 0;

  for (const todo of await repository.listRetryable(ownerKey)) {
    try {
      await repository.markSyncing(todo.id);
      const canonical = await remote.push(todo);
      await repository.putCanonical(remoteToLocal(canonical, ownerKey));
      pushed += 1;
    } catch (error) {
      await repository.markError(
        todo.id,
        error instanceof Error ? error.message : "Unknown sync error",
      );
      errors += 1;
    }
  }

  try {
    for (const row of await remote.list()) {
      await repository.putRemote(remoteToLocal(row, ownerKey));
      pulled += 1;
    }
  } catch {
    errors += 1;
  }

  return { pushed, pulled, errors };
}
