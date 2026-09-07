import type { MenuItemEntry, MenuKey } from "./menuTypes";

export function Menu({
  id,
  label,
  open,
  setOpen,
  items,
  onClose,
}: {
  id: Exclude<MenuKey, null>;
  label: string;
  open: MenuKey;
  setOpen: (key: MenuKey) => void;
  items: MenuItemEntry[];
  onClose: () => void;
}) {
  const isOpen = open === id;
  return (
    <div className={`menu-root ${isOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className="menu-item"
        onClick={() => setOpen(isOpen ? null : id)}
        onMouseEnter={() => {
          if (open) setOpen(id);
        }}
      >
        {label}
      </button>
      {isOpen && (
        <div className="menu-dropdown" role="menu">
          {items.map((item, index) =>
            item === "sep" ? (
              <div key={`sep-${index}`} className="menu-sep" />
            ) : (
              <button
                key={`${item.label}-${index}`}
                type="button"
                disabled={item.disabled}
                className={item.disabled ? "is-disabled" : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                {item.kicker ? (
                  <span className="menu-kicker">{item.kicker}</span>
                ) : null}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
