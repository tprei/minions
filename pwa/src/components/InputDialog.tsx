import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface InputDialogProps {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export function InputDialog({
  open,
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: InputDialogProps): ReactElement {
  const [text, setText] = useState<string>(initialValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialValue);
      setPending(false);
      setError(null);
    }
  }, [open, initialValue]);

  const valueValid = text.trim().length > 0;

  const handleClose = useCallback(() => {
    if (pending) return;
    onCancel();
  }, [pending, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!valueValid || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      onCancel();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setPending(false);
    }
  }, [valueValid, pending, text, onConfirm, onCancel]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirm();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">{label}</span>
          <input
            type="text"
            className="input"
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={pending}
          />
        </label>
        {error && (
          <div className="card p-2 text-xs text-err border border-err/30 bg-err/10">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={pending || !valueValid}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
