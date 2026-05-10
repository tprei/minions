import { useEffect, useRef, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { cx } from "../util/cx";

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps): ReactElement | null {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }

    function onPointerDown(e: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 36 - 16),
    zIndex: 9999,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={style}
      className="card shadow-2xl py-1 min-w-[160px]"
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={cx(
            "w-full px-3 py-2 text-left text-sm transition-colors",
            item.disabled
              ? "text-fg-subtle cursor-not-allowed"
              : "text-fg hover:bg-bg-elev",
          )}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
