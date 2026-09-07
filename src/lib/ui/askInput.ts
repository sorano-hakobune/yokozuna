/**
 * Promise-based text/number input that opens the shared YOKOZUNA InputDialog.
 * Call sites await a result instead of window.prompt — UI stays in-app.
 */

export type AskInputOptions = {
  title: string;
  /** Field label shown above the input */
  label?: string;
  defaultValue?: string;
  inputType?: "text" | "number";
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, empty string is a valid confirm result (still not null) */
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Optional select instead of free text */
  options?: { value: string; label: string }[];
  hint?: string;
};

type Pending = AskInputOptions & {
  resolve: (value: string | null) => void;
};

type Listener = (pending: Pending | null) => void;

let pending: Pending | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(pending);
}

/** Subscribe the mounted InputDialog host. */
export function subscribeAskInput(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}

export function getAskInputPending(): Pending | null {
  return pending;
}

/** Open the shared input dialog; resolves to string or null (cancel). */
export function askInput(options: AskInputOptions): Promise<string | null> {
  return new Promise((resolve) => {
    // If a dialog is already open, cancel the previous waiter
    if (pending) {
      pending.resolve(null);
    }
    pending = {
      ...options,
      resolve: (value) => {
        pending = null;
        emit();
        resolve(value);
      },
    };
    emit();
  });
}

export function resolveAskInput(value: string | null) {
  if (!pending) return;
  const r = pending.resolve;
  pending = null;
  emit();
  r(value);
}

// ——— Symbol dialog (reuse SymbolDialog UI) ———

export type AskSymbolOptions = {
  mode: "create" | "convert";
  defaultName?: string;
};

export type AskSymbolResult = {
  name: string;
  symbolType: "graphic" | "movieClip";
} | null;

type SymbolPending = AskSymbolOptions & {
  resolve: (value: AskSymbolResult) => void;
};

type SymbolListener = (pending: SymbolPending | null) => void;

let symbolPending: SymbolPending | null = null;
const symbolListeners = new Set<SymbolListener>();

function emitSymbol() {
  for (const l of symbolListeners) l(symbolPending);
}

export function subscribeAskSymbol(listener: SymbolListener): () => void {
  symbolListeners.add(listener);
  listener(symbolPending);
  return () => symbolListeners.delete(listener);
}

export function askSymbol(options: AskSymbolOptions): Promise<AskSymbolResult> {
  return new Promise((resolve) => {
    if (symbolPending) symbolPending.resolve(null);
    symbolPending = {
      ...options,
      resolve: (value) => {
        symbolPending = null;
        emitSymbol();
        resolve(value);
      },
    };
    emitSymbol();
  });
}

export function resolveAskSymbol(value: AskSymbolResult) {
  if (!symbolPending) return;
  const r = symbolPending.resolve;
  symbolPending = null;
  emitSymbol();
  r(value);
}
