import type { LocalTodoRecord } from "../storage/todoDb";

export type RemoteTodoRecord = {
  id: string;
  user_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export interface TodoRemote {
  push(todo: LocalTodoRecord): Promise<RemoteTodoRecord>;
  list(): Promise<RemoteTodoRecord[]>;
}

export type SyncResult = {
  pushed: number;
  pulled: number;
  errors: number;
};
