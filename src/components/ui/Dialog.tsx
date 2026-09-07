import {
  useEffect,
  useRef,
  type ReactNode,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

export type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string | null;
  confirmDisabled?: boolean;
  busyText?: string | null;
  onConfirm?: () => void | Promise<void>;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  asForm?: boolean;
};

/** Shared YOKOZUNA modal — centered in the app window. */
export function Dialog({
  open,
  title,
  onClose,
  confirmLabel = "実行",
  cancelLabel = "キャンセル",
  confirmDisabled = false,
  busyText = null,
  onConfirm,
  children,
  size = "md",
  asForm = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>(
        "input:not([type=hidden]), select, textarea, button:not([disabled])",
      );
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    size === "sm" ? "yo-dialog--sm" : size === "lg" ? "yo-dialog--lg" : "yo-dialog--md";

  const handleOverlayMouseDown = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (confirmDisabled) return;
    void onConfirm?.();
  };

  const body = (
    <>
      <div className="yo-dialog-header">
        <div className="yo-dialog-title">{title}</div>
        <button
          type="button"
          className="yo-dialog-close"
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="yo-dialog-body">{children}</div>
      <div className="yo-dialog-footer">
        {busyText ? <span className="yo-dialog-busy">{busyText}</span> : <span />}
        <div className="yo-dialog-actions">
          {cancelLabel != null && (
            <button type="button" className="yo-dialog-btn" onClick={onClose}>
              {cancelLabel}
            </button>
          )}
          {onConfirm && (
            <button
              type={asForm ? "submit" : "button"}
              className="yo-dialog-btn yo-dialog-btn-primary"
              disabled={confirmDisabled}
              onClick={asForm ? undefined : () => void onConfirm()}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(
    <div className="yo-dialog-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        ref={panelRef}
        className={`yo-dialog ${widthClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {asForm && onConfirm ? (
          <form className="yo-dialog-form" onSubmit={handleSubmit}>
            {body}
          </form>
        ) : (
          <div className="yo-dialog-form">{body}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function DialogField({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`yo-dialog-field ${full ? "is-full" : ""}`}>
      <span className="yo-dialog-field-label">{label}</span>
      {children}
    </label>
  );
}

export function DialogRow({ children }: { children: ReactNode }) {
  return <div className="yo-dialog-row">{children}</div>;
}

export function DialogCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="yo-dialog-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
