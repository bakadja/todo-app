import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalTodoRecord } from "../storage/todoDb";
import {
  SupabaseTodoRemote,
  remoteToLocal,
  type RemoteTodoRecord,
} from "./supabaseTodoRemote";

const remoteRow: RemoteTodoRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: "11111111-1111-1111-1111-111111111111",
  title: "Cloud task",
  completed: true,
  created_at: "2026-09-04T08:00:00.000Z",
  updated_at: "2026-09-04T09:00:00.000Z",
  deleted_at: null,
};

const localRow: LocalTodoRecord = {
  id: remoteRow.id,
  ownerKey: `user:${remoteRow.user_id}`,
  title: "Local task",
  completed: false,
  createdAt: Date.parse("2026-09-04T08:00:00.000Z"),
  updatedAt: Date.parse("2026-09-04T08:30:00.000Z"),
  deletedAt: null,
  syncStatus: "pending",
  lastSyncError: null,
};

describe("SupabaseTodoRemote", () => {
  it("pushes through the LWW RPC and requests one canonical row without sending user_id", async () => {
    const single = vi.fn().mockResolvedValue({ data: remoteRow, error: null });
    const rpc = vi.fn().mockReturnValue({ single });
    const client = { rpc } as unknown as SupabaseClient;
    const remote = new SupabaseTodoRemote(client);

    await expect(remote.push(localRow)).resolves.toEqual(remoteRow);
    expect(rpc).toHaveBeenCalledWith("sync_todo_lww", {
      p_id: localRow.id,
      p_title: localRow.title,
      p_completed: localRow.completed,
      p_created_at: new Date(localRow.createdAt).toISOString(),
      p_updated_at: new Date(localRow.updatedAt).toISOString(),
      p_deleted_at: null,
    });
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("lists canonical rows ordered by updated_at ascending", async () => {
    const order = vi.fn().mockResolvedValue({ data: [remoteRow], error: null });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as unknown as SupabaseClient;
    const remote = new SupabaseTodoRemote(client);

    await expect(remote.list()).resolves.toEqual([remoteRow]);
    expect(from).toHaveBeenCalledWith("todos");
    expect(select).toHaveBeenCalledWith(
      "id,user_id,title,completed,created_at,updated_at,deleted_at",
    );
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: true });
  });

  it("maps a remote row to a synced local row", () => {
    expect(remoteToLocal(remoteRow, `user:${remoteRow.user_id}`)).toEqual({
      id: remoteRow.id,
      ownerKey: `user:${remoteRow.user_id}`,
      title: "Cloud task",
      completed: true,
      createdAt: Date.parse(remoteRow.created_at),
      updatedAt: Date.parse(remoteRow.updated_at),
      deletedAt: null,
      syncStatus: "synced",
      lastSyncError: null,
    });
  });
});