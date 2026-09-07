const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";

type HistoryMethod = "pushState" | "replaceState";

export function installPreviewHistory(
  history: History,
  onLocationChange: () => void,
): { isAtRoot: () => boolean; dispose: () => void } {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const isAtRoot = () => {
    const state = history.state;
    return Boolean(
      state && typeof state === "object" && state[ROOT_STATE_KEY] === true,
    );
  };

  try {
    const current = history.state;
    const alreadyTagged =
      current !== null &&
      typeof current === "object" &&
      Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY);
    if (!alreadyTagged) {
      const isRoot = history.length <= 1;
      const marked =
        current && typeof current === "object"
          ? { ...current, [ROOT_STATE_KEY]: isRoot }
          : { [ROOT_STATE_KEY]: isRoot };
      originalReplaceState(marked, "", window.location.href);
    }
  } catch {
    // History state is best-effort in embedded WebViews.
  }

  history.pushState = ((
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const next =
      data && typeof data === "object"
        ? { ...data, [ROOT_STATE_KEY]: false }
        : data;
    originalPushState(next, unused, url);
    onLocationChange();
  }) as History[HistoryMethod];
  history.replaceState = ((
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    const next = isAtRoot()
      ? {
          ...(data && typeof data === "object" ? data : {}),
          [ROOT_STATE_KEY]: true,
        }
      : data;
    originalReplaceState(next, unused, url);
    onLocationChange();
  }) as History[HistoryMethod];

  return {
    isAtRoot,
    dispose: () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    },
  };
}
