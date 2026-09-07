/**
 * Guest side of the grok-web ↔ sandbox preview postMessage bridge.
 *
 * Activates only when this page is framed by an allowlisted Grok embedder.
 * Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
 */

import { z } from "zod";
import { resolveParentEmbedderOrigin } from "./preview-embedder-origin";
import { installPreviewHistory } from "./preview-history";

export {
  isGrokEmbedderOrigin,
  isSandboxPreviewGuestHost,
  resolveParentEmbedderOrigin,
} from "./preview-embedder-origin";

export const PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge" as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;

const EnvelopeSchema = z.object({
  channel: z.literal(PREVIEW_BRIDGE_CHANNEL),
  version: z.number().int().positive(),
  type: z.string().min(1),
});

const HelloSchema = EnvelopeSchema.extend({
  type: z.literal("hello"),
});

const NavigateSchema = EnvelopeSchema.extend({
  type: z.literal("navigate"),
  path: z.string().min(1),
});

const HistorySchema = EnvelopeSchema.extend({
  type: z.literal("history"),
  delta: z.union([z.literal(-1), z.literal(1)]),
});

export type PreviewHostBridgeOptions = {
  /** Prefer the app router when available; falls back to history.pushState. */
  navigate?: (path: string) => void;
  /** Best-effort registered paths for host autosuggest (may be empty). */
  getRoutePaths?: () => string[];
};

export function isSafeBridgePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return false;
  }
  try {
    const resolved = new URL(path, "https://preview.invalid");
    return resolved.origin === "https://preview.invalid";
  } catch {
    return false;
  }
}

/**
 * Install host↔guest messaging. Returns a dispose function.
 * Noops (returns a no-op dispose) when not embedded under a Grok parent.
 */
export function installPreviewHostBridge(
  options: PreviewHostBridgeOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const ancestorOrigin =
    typeof location.ancestorOrigins !== "undefined" &&
    location.ancestorOrigins.length > 0
      ? location.ancestorOrigins[0]
      : null;
  const parentOrigin = resolveParentEmbedderOrigin(
    window.parent === window,
    document.referrer,
    ancestorOrigin,
    window.location.hostname,
  );
  if (parentOrigin === null) return () => {};

  const post = (message: object) => {
    window.parent.postMessage(message, parentOrigin);
  };

  const reportLocation = () => {
    post({
      channel: PREVIEW_BRIDGE_CHANNEL,
      version: PREVIEW_BRIDGE_VERSION,
      type: "location",
      path: window.location.pathname || "/",
      search: window.location.search,
      hash: window.location.hash,
    });
  };

  const reportRoutes = () => {
    const paths = options.getRoutePaths?.() ?? [];
    post({
      channel: PREVIEW_BRIDGE_CHANNEL,
      version: PREVIEW_BRIDGE_VERSION,
      type: "routes",
      paths,
    });
  };

  const historyBridge = installPreviewHistory(window.history, reportLocation);

  const defaultNavigate = (path: string) => {
    if (!isSafeBridgePath(path)) return;
    try {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.pushState(window.history.state, "", next);
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    } catch {
      // ignore malformed paths
    }
  };

  const navigate = (path: string) => {
    if (!isSafeBridgePath(path)) return;
    if (options.navigate) {
      options.navigate(path);
      return;
    }
    defaultNavigate(path);
  };

  const announce = () => {
    reportLocation();
    reportRoutes();
    post({
      channel: PREVIEW_BRIDGE_CHANNEL,
      version: PREVIEW_BRIDGE_VERSION,
      type: "ready",
    });
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (event.origin !== parentOrigin) return;

    const envelope = EnvelopeSchema.safeParse(event.data);
    if (!envelope.success || envelope.data.version !== PREVIEW_BRIDGE_VERSION)
      return;

    // Host re-handshake: it may have (re)mounted after our install-time
    // announce, or asked before we hydrated. Announce again.
    if (envelope.data.type === "hello") {
      if (!HelloSchema.safeParse(event.data).success) return;
      announce();
      return;
    }

    if (envelope.data.type === "navigate") {
      const parsed = NavigateSchema.safeParse(event.data);
      if (!parsed.success) return;
      navigate(parsed.data.path);
      // Router navigations often update location asynchronously; report after a tick.
      queueMicrotask(reportLocation);
      return;
    }

    if (envelope.data.type === "history") {
      const parsed = HistorySchema.safeParse(event.data);
      if (!parsed.success) return;
      // Do not history.go(-1) off the first entry — that leaves the preview.
      if (parsed.data.delta === -1 && historyBridge.isAtRoot()) return;
      // Location sync comes from the popstate listener once history settles.
      window.history.go(parsed.data.delta);
    }
  };

  const onPopState = () => {
    reportLocation();
  };

  // Same-document `#` navigations fire hashchange, not popstate / pushState.
  const onHashChange = () => {
    reportLocation();
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("hashchange", onHashChange);

  announce();

  return () => {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    historyBridge.dispose();
  };
}

/** Collect static path patterns from a TanStack route tree (best-effort). */
export function collectRoutePathsFromTree(routeTree: unknown): string[] {
  const paths = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as {
      fullPath?: unknown;
      path?: unknown;
      children?: unknown;
    };
    const full =
      typeof record.fullPath === "string"
        ? record.fullPath
        : typeof record.path === "string"
          ? record.path
          : null;
    if (full !== null && full !== "") {
      paths.add(full.startsWith("/") ? full : `/${full}`);
    } else if (full === "") {
      paths.add("/");
    }
    const children = record.children;
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
    } else if (children && typeof children === "object") {
      for (const child of Object.values(children as Record<string, unknown>)) {
        walk(child);
      }
    }
  };

  walk(routeTree);
  return [...paths];
}
