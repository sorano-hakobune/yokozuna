import { useEffect, useState } from "react";
import { Dialog, DialogField } from "./Dialog";
import {
  subscribeAskInput,
  resolveAskInput,
  type AskInputOptions,
} from "@/lib/ui/askInput";
import { SymbolDialog } from "./SymbolDialog";
import {
  subscribeAskSymbol,
  resolveAskSymbol,
} from "@/lib/ui/askInput";

/**
 * Host for promise-based askInput / askSymbol.
 * Mount once near the app root (Editor).
 */
export function InputDialogHost() {
  const [inputOpts, setInputOpts] = useState<AskInputOptions | null>(null);
  const [value, setValue] = useState("");
  const [symbolOpts, setSymbolOpts] = useState<{
    mode: "create" | "convert";
    defaultName: string;
  } | null>(null);

  useEffect(() => {
    return subscribeAskInput((p) => {
      if (!p) {
        setInputOpts(null);
        return;
      }
      const { resolve: _r, ...opts } = p;
      setInputOpts(opts);
      setValue(opts.defaultValue ?? "");
    });
  }, []);

  useEffect(() => {
    return subscribeAskSymbol((p) => {
      if (!p) {
        setSymbolOpts(null);
        return;
      }
      setSymbolOpts({
        mode: p.mode,
        defaultName: p.defaultName ?? "Symbol 1",
      });
    });
  }, []);

  const inputOpen = inputOpts != null;
  const confirmDisabled = (() => {
    if (!inputOpts) return true;
    if (inputOpts.options) return !value;
    if (inputOpts.inputType === "number") {
      if (value.trim() === "" && !inputOpts.allowEmpty) return true;
      const n = Number(value);
      if (!Number.isFinite(n)) return true;
      if (inputOpts.min != null && n < inputOpts.min) return true;
      if (inputOpts.max != null && n > inputOpts.max) return true;
      return false;
    }
    if (!inputOpts.allowEmpty && value.trim() === "") return true;
    return false;
  })();

  return (
    <>
      <Dialog
        open={inputOpen}
        title={inputOpts?.title ?? ""}
        onClose={() => resolveAskInput(null)}
        confirmLabel={inputOpts?.confirmLabel ?? "OK"}
        cancelLabel={inputOpts?.cancelLabel ?? "キャンセル"}
        confirmDisabled={confirmDisabled}
        onConfirm={() => {
          if (confirmDisabled) return;
          resolveAskInput(value);
        }}
        size="sm"
      >
        {inputOpts?.options ? (
          <DialogField label={inputOpts.label ?? "選択"} full>
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              {inputOpts.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </DialogField>
        ) : (
          <DialogField label={inputOpts?.label ?? "入力"} full>
            <input
              type={inputOpts?.inputType === "number" ? "number" : "text"}
              value={value}
              placeholder={inputOpts?.placeholder}
              min={inputOpts?.min}
              max={inputOpts?.max}
              step={inputOpts?.step}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </DialogField>
        )}
        {inputOpts?.hint ? (
          <p className="yo-dialog-hint">{inputOpts.hint}</p>
        ) : null}
      </Dialog>

      <SymbolDialog
        open={symbolOpts != null}
        mode={symbolOpts?.mode ?? "create"}
        defaultName={symbolOpts?.defaultName ?? "Symbol 1"}
        onClose={() => resolveAskSymbol(null)}
        onConfirm={(cfg) => resolveAskSymbol(cfg)}
      />
    </>
  );
}
