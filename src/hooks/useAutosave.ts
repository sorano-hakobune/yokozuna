import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  getPersistencePrefs,
  setPersistencePrefs,
  writeAutosave,
  loadAutosave,
  type AutosavePayload,
} from "@/lib/project/persistence";

/**
 * Debounced autosave of the current project to localStorage.
 * Also exposes last autosave timestamp for status UI.
 */
export function useAutosave() {
  const project = useProjectStore((s) => s.project);
  const pastLength = useProjectStore((s) => s.past.length);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<string | null>(() => {
    return loadAutosave()?.savedAt ?? null;
  });
  const [autosaveEnabled, setEnabledState] = useState(
    () => getPersistencePrefs().autosaveEnabled,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const flush = () => {
    if (!getPersistencePrefs().autosaveEnabled) return;
    const ok = writeAutosave(projectRef.current);
    if (ok) {
      setLastAutosaveAt(new Date().toISOString());
    }
  };

  useEffect(() => {
    if (!autosaveEnabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = getPersistencePrefs().autosaveDelayMs;
    timerRef.current = setTimeout(() => {
      flush();
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [project, pastLength, autosaveEnabled]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onUnload = () => flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const setAutosaveEnabled = (enabled: boolean) => {
    setPersistencePrefs({ autosaveEnabled: enabled });
    setEnabledState(enabled);
    if (enabled) flush();
  };

  return {
    lastAutosaveAt,
    autosaveEnabled,
    setAutosaveEnabled,
    flushAutosave: flush,
    peekAutosave: loadAutosave as () => AutosavePayload | null,
  };
}
