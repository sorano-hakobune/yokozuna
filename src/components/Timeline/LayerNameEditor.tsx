import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  masked?: boolean;
  onRename: (next: string) => void;
  onSelect?: () => void;
};

/**
 * Layer name label with Flash-style inline rename (double-click / Enter).
 */
export function LayerNameEditor({ name, masked, onRename, onSelect }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : name;
    setEditing(false);
    if (next !== name) onRename(next);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="layer-name-input"
        value={draft}
        maxLength={64}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <span
      className="layer-name"
      title={`${name}（ダブルクリックで名前を変更）`}
      onClick={(e) => {
        // Single click selects layer via parent; stop only on dbl
        e.stopPropagation();
        onSelect?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setDraft(name);
        setEditing(true);
      }}
    >
      {masked ? "↳ " : ""}
      {name}
    </span>
  );
}
