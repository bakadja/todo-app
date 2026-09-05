import "./UndoSnackbar.css";

type UndoSnackbarProps = {
  onUndo: () => void;
};

export function UndoSnackbar({ onUndo }: UndoSnackbarProps) {
  return (
    <div className="undo-snackbar" role="status" aria-live="polite">
      <span>Todo removed</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
