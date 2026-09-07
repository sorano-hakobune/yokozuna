/**
 * Ambient typings for optional Tauri 2 plugins.
 * Present at runtime only inside the Tauri shell; browser builds ignore them.
 */
declare module "@tauri-apps/plugin-dialog" {
  export type DialogFilter = { name: string; extensions: string[] };
  export type SaveDialogOptions = {
    defaultPath?: string;
    filters?: DialogFilter[];
    title?: string;
  };
  export type OpenDialogOptions = {
    multiple?: boolean;
    directory?: boolean;
    filters?: DialogFilter[];
    title?: string;
    defaultPath?: string;
  };
  export function save(options?: SaveDialogOptions): Promise<string | null>;
  export function open(
    options?: OpenDialogOptions,
  ): Promise<string | string[] | null>;
}

declare module "@tauri-apps/plugin-fs" {
  export function writeFile(
    path: string,
    data: Uint8Array | ArrayBuffer,
    options?: unknown,
  ): Promise<void>;
  export function writeTextFile(
    path: string,
    data: string,
    options?: unknown,
  ): Promise<void>;
}

declare module "@tauri-apps/api/path" {
  export function join(...paths: string[]): Promise<string>;
}

declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
  ): Promise<T>;
}
