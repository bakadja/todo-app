import type { UiSyncStatus } from "../hooks/useTodoSync";

const STATUS_LABELS: Record<UiSyncStatus, string> = {
  offline: "Offline — changes saved on this device",
  syncing: "Syncing…",
  idle: "Synced",
  error: "Sync issue — local changes are safe",
};

type SyncStatusProps = {
  status: UiSyncStatus;
};

export function SyncStatus({ status }: SyncStatusProps) {
  return (
    <p className="sync-status" role="status" aria-live="polite">
      {STATUS_LABELS[status]}
    </p>
  );
}
