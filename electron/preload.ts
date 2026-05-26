import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

import type {
  DitherDesktopBridge,
  DesktopFilePayload,
  DesktopPickedSource,
  DesktopSourceKind,
  DesktopWalkEntry
} from "../src/electron/bridge";

const bridge: DitherDesktopBridge = {
  getLaunchSession() {
    return ipcRenderer.invoke("dither:get-launch-session");
  },
  onLaunchSession(callback) {
    const listener = (_event: IpcRendererEvent, session: Parameters<typeof callback>[0]) => {
      callback(session);
    };
    ipcRenderer.on("dither:launch-session", listener);
    return () => ipcRenderer.removeListener("dither:launch-session", listener);
  },
  performGitAction(request) {
    return ipcRenderer.invoke("dither:perform-git-action", request);
  },
  pickSource(kind?: DesktopSourceKind): Promise<DesktopPickedSource | null> {
    return ipcRenderer.invoke("dither:pick-source", kind);
  },
  readGitFile(repoPath: string, relativePath: string): Promise<DesktopFilePayload> {
    return ipcRenderer.invoke("dither:read-git-file", repoPath, relativePath);
  },
  readFile(source: DesktopPickedSource, relativePath?: string): Promise<DesktopFilePayload> {
    return ipcRenderer.invoke("dither:read-file", source, relativePath);
  },
  resolvePaths(paths: readonly string[]): Promise<DesktopPickedSource[]> {
    return ipcRenderer.invoke("dither:resolve-paths", paths);
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
