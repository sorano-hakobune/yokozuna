export type MenuKey =
  | "file"
  | "edit"
  | "view"
  | "animation"
  | "layer"
  | "object"
  | "window"
  | "help"
  | "more"
  | null;

export type MenuItemEntry =
  | "sep"
  | {
      label: string;
      kicker?: string;
      disabled?: boolean;
      onClick: () => void;
    };
