import "./ConfirmDeleteModal.css";

type ConfirmDeleteModalProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteModal({
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  return (
    <div className="confirm-delete-modal__backdrop">
      <section
        className="confirm-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-description"
      >
        <div className="confirm-delete-modal__copy">
          <h2 id="confirm-delete-title">Delete this todo?</h2>
          <p id="confirm-delete-description">
            This todo will be removed from your list.
          </p>
        </div>
        <div className="confirm-delete-modal__actions">
          <button
            type="button"
            className="confirm-delete-modal__button confirm-delete-modal__button--secondary"
            onClick={onCancel}
            aria-label="Cancel delete"
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-delete-modal__button confirm-delete-modal__button--danger"
            onClick={onConfirm}
            aria-label="Confirm delete"
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
