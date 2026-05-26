import { contextBridge, ipcRenderer, webUtils } from "electron";

import type {
  DesktopFilePayload,
  DesktopPickedSource,
  DesktopSourceKind,
  DesktopWalkEntry
} from "../src/electron/bridge";

const bridge = {
  pickSource(kind?: DesktopSourceKind): Promise<DesktopPickedSource | null> {
    return ipcRenderer.invoke("dither:pick-source", kind);
  },
  readFile(source: DesktopPickedSource, relativePath?: string): Promise<DesktopFilePayload> {
    return ipcRenderer.invoke("dither:read-file", source, relativePath);
  },
  resolveDroppedSources(files: readonly File[]): Promise<DesktopPickedSource[]> {
    const paths = files.map((file) => webUtils.getPathForFile(file)).filter((path) => path.length > 0);
    return ipcRenderer.invoke("dither:resolve-dropped-sources", paths);
  },
  walkDirectory(source: DesktopPickedSource): Promise<DesktopWalkEntry[]> {
    return ipcRenderer.invoke("dither:walk-directory", source);
  }
};

contextBridge.exposeInMainWorld("dither", bridge);
