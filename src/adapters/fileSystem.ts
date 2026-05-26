import { createElectronFileSystemAdapter } from "./electronFileSystem";
import { createWebFileSystemAdapter } from "./webFileSystem";
import type { FileSystemAdapter } from "../lib/types";

export function createFileSystemAdapter(): FileSystemAdapter {
  return window.dither ? createElectronFileSystemAdapter() : createWebFileSystemAdapter();
}
