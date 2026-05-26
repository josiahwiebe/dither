/// <reference types="vite/client" />

import type { DitherDesktopBridge } from "./electron/bridge";

declare global {
  interface Window {
    dither?: DitherDesktopBridge;
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | WellKnownDirectory;
    }) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (options?: {
      excludeAcceptAllOption?: boolean;
      id?: string;
      multiple?: boolean;
      startIn?: FileSystemHandle | WellKnownDirectory;
      types?: FilePickerAcceptType[];
    }) => Promise<FileSystemFileHandle[]>;
  }

  type WellKnownDirectory =
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";

  interface FilePickerAcceptType {
    accept: Record<string, string | string[]>;
    description?: string;
  }

  interface FileSystemHandle {
    kind: "file" | "directory";
    name: string;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    kind: "file";
    getFile(): Promise<File>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: "directory";
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
}

export {};
