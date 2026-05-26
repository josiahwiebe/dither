import { app, BrowserWindow, dialog, ipcMain, shell, type BrowserWindowConstructorOptions } from "electron";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, opendir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDocxPath } from "../src/lib/fileKind";
import type {
  DesktopFilePayload,
  DesktopPickedSource,
  DesktopSourceKind,
  DesktopWalkEntry
} from "../src/electron/bridge";
import { isDitherSession, type DitherSession, type GitActionKind } from "../src/lib/gitSession";
import { performGitAction, readSessionFile } from "../src/node/gitWorkbench";

const isDev = !app.isPackaged;
const shouldOpenDevTools = process.env.DITHER_OPEN_DEVTOOLS === "1";
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const macOSWindowMaterial = "fullscreen-ui" satisfies NonNullable<BrowserWindowConstructorOptions["vibrancy"]>;
let activeSession: DitherSession | null = null;
let mainWindow: BrowserWindow | null = null;

/** Returns native window material settings without painting over macOS vibrancy. */
function windowMaterialOptions(): BrowserWindowConstructorOptions {
  if (process.platform !== "darwin") {
    return {
      backgroundColor: "#101216"
    };
  }

  return {
    backgroundColor: "#00000000",
    transparent: true,
    vibrancy: macOSWindowMaterial,
    visualEffectState: "active"
  };
}

function getSessionPathFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "dither:" && url.hostname === "session" ? url.searchParams.get("path") : null;
  } catch {
    return null;
  }
}

function getSessionPathFromArgs(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--session") return argv[index + 1] ?? null;
    if (current.startsWith("dither://")) return getSessionPathFromUrl(current);
  }

  return null;
}

async function loadActiveSession(sessionPath: string | null) {
  if (!sessionPath) return;
  activeSession = await readSessionFile(sessionPath);
  mainWindow?.webContents.send("dither:launch-session", activeSession);
  mainWindow?.focus();
}

function registerProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("dither", process.execPath, [process.argv[1]]);
    return;
  }

  app.setAsDefaultProtocolClient("dither");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 640,
    title: "Dither",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 16 },
    autoHideMenuBar: true,
    ...windowMaterialOptions(),
    webPreferences: {
      preload: join(currentDirectory, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === "darwin") {
    mainWindow.setBackgroundColor("#00000000");
    mainWindow.setVibrancy(macOSWindowMaterial, { animationDuration: 160 });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void mainWindow.loadFile(join(currentDirectory, "../renderer/index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    if (activeSession) {
      mainWindow?.webContents.send("dither:launch-session", activeSession);
    }
  });

  return mainWindow;
}

function toPickedSource(path: string, kind: DesktopSourceKind): DesktopPickedSource {
  const name = path.split(sep).filter(Boolean).at(-1) ?? path;
  return {
    displayPath: formatDisplayPath(path),
    kind,
    name,
    path,
    platform: "desktop"
  };
}

function formatDisplayPath(path: string) {
  const homePath = process.env.HOME;

  if (!homePath) return path;
  if (path === homePath) return "~";
  if (path.startsWith(`${homePath}${sep}`)) return `~${path.slice(homePath.length)}`;

  return path;
}

async function toDroppedSource(path: string): Promise<DesktopPickedSource | null> {
  const metadata = await stat(path);

  if (metadata.isFile()) return toPickedSource(path, "file");
  if (metadata.isDirectory()) return toPickedSource(path, "directory");

  return null;
}

function assertPathInside(basePath: string, targetPath: string) {
  const base = resolve(basePath);
  const target = resolve(targetPath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error("Refusing to read outside the selected directory.");
  }
}

function isProbablyBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 8192));
  if (sample.includes(0)) return true;

  let suspicious = 0;
  for (const byte of sample) {
    const allowedControl = byte === 7 || byte === 8 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 27;
    if (byte < 32 && !allowedControl) suspicious += 1;
  }

  return sample.byteLength > 0 && suspicious / sample.byteLength > 0.08;
}

function toHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readFilePayload(path: string): Promise<DesktopFilePayload> {
  const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
  return {
    base64: bytes.toString("base64"),
    contentHash: toHash(bytes),
    isBinary: !isDocxPath(path) && isProbablyBinary(bytes),
    modifiedAt: metadata.mtimeMs,
    size: metadata.size
  };
}

async function walkDirectory(rootPath: string): Promise<DesktopWalkEntry[]> {
  const root = resolve(rootPath);
  const entries: DesktopWalkEntry[] = [];

  async function visit(directoryPath: string, relativeDirectory: string) {
    let directory;
    try {
      directory = await opendir(directoryPath);
    } catch (error) {
      entries.push({
        error: error instanceof Error ? error.message : "Unable to read directory.",
        kind: "directory",
        modifiedAt: null,
        relativePath: relativeDirectory,
        size: 0
      });
      return;
    }

    for await (const dirent of directory) {
      if (dirent.name === ".DS_Store") continue;

      const childPath = join(directoryPath, dirent.name);
      const relativePath = relativeDirectory === "" ? dirent.name : `${relativeDirectory}/${dirent.name}`;

      if (dirent.isDirectory()) {
        try {
          const metadata = await stat(childPath);
          entries.push({
            kind: "directory",
            modifiedAt: metadata.mtimeMs,
            relativePath,
            size: 0
          });
          await visit(childPath, relativePath);
        } catch (error) {
          entries.push({
            error: error instanceof Error ? error.message : "Unable to read directory.",
            kind: "directory",
            modifiedAt: null,
            relativePath,
            size: 0
          });
        }
        continue;
      }

      if (!dirent.isFile()) {
        entries.push({
          error: "Only regular files and directories are supported in v1.",
          kind: "file",
          modifiedAt: null,
          relativePath,
          size: 0
        });
        continue;
      }

      try {
        const payload = await readFilePayload(childPath);
        entries.push({
          contentHash: payload.contentHash,
          isBinary: payload.isBinary,
          kind: "file",
          modifiedAt: payload.modifiedAt,
          relativePath,
          size: payload.size
        });
      } catch (error) {
        entries.push({
          error: error instanceof Error ? error.message : "Unable to read file.",
          kind: "file",
          modifiedAt: null,
          relativePath,
          size: 0
        });
      }
    }
  }

  await visit(root, "");
  return entries;
}

ipcMain.handle("dither:pick-source", async (_event, kind?: DesktopSourceKind) => {
  const result = await dialog.showOpenDialog({
    buttonLabel: "Open",
    properties: kind === "file" ? ["openFile"] : kind === "directory" ? ["openDirectory"] : ["openFile", "openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return toDroppedSource(result.filePaths[0]);
});

ipcMain.handle("dither:get-launch-session", () => activeSession);

ipcMain.handle("dither:resolve-paths", async (_event, paths: unknown) => {
  if (!Array.isArray(paths)) return [];

  const sources = await Promise.all(
    paths
      .filter((path): path is string => typeof path === "string" && path.length > 0)
      .slice(0, 2)
      .map(async (path) => {
        try {
          return await toDroppedSource(path);
        } catch {
          return null;
        }
      })
  );

  return sources.filter((source): source is DesktopPickedSource => Boolean(source));
});

ipcMain.handle("dither:read-git-file", async (_event, repoPath: unknown, relativePath: unknown) => {
  if (typeof repoPath !== "string" || typeof relativePath !== "string") {
    throw new Error("Repository path and file path are required.");
  }

  const path = resolve(repoPath, relativePath);
  assertPathInside(repoPath, path);
  return readFilePayload(path);
});

ipcMain.handle("dither:perform-git-action", async (_event, request: unknown) => {
  if (!request || typeof request !== "object") throw new Error("Git action request required.");
  const actionRequest = request as {
    action?: GitActionKind;
    filePath?: string;
    hunkIndex?: number;
    session?: DitherSession;
  };

  if (
    !["stage", "unstage", "discard", "apply"].includes(actionRequest.action ?? "") ||
    typeof actionRequest.filePath !== "string" ||
    !isDitherSession(actionRequest.session)
  ) {
    throw new Error("Invalid git action request.");
  }

  activeSession = await performGitAction({
    action: actionRequest.action as GitActionKind,
    filePath: actionRequest.filePath,
    hunkIndex: actionRequest.hunkIndex,
    session: actionRequest.session
  });
  mainWindow?.webContents.send("dither:launch-session", activeSession);
  return activeSession;
});

ipcMain.handle("dither:read-file", async (_event, source: DesktopPickedSource, relativePath?: string) => {
  const path =
    source.kind === "directory"
      ? resolve(source.path, relativePath ?? "")
      : source.path;

  if (source.kind === "directory") {
    assertPathInside(source.path, path);
  }

  return readFilePayload(path);
});

ipcMain.handle("dither:resolve-dropped-sources", async (_event, paths: unknown) => {
  if (!Array.isArray(paths)) return [];

  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))
  ).slice(0, 16);

  const sources = await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        return await toDroppedSource(path);
      } catch {
        return null;
      }
    })
  );

  return sources.filter((source): source is DesktopPickedSource => Boolean(source));
});

ipcMain.handle("dither:walk-directory", async (_event, source: DesktopPickedSource) => {
  if (source.kind !== "directory") {
    throw new Error("Directory source required.");
  }

  return walkDirectory(source.path);
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  void loadActiveSession(getSessionPathFromUrl(url));
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  void loadActiveSession(getSessionPathFromArgs(argv));
});

app.whenReady().then(() => {
  registerProtocolClient();
  void loadActiveSession(getSessionPathFromArgs(process.argv));
  createWindow();
  void mkdir(app.getPath("userData"), { recursive: true });

  if (process.platform === "darwin") {
    setImmediate(() => {
      const dockIconPath = join(currentDirectory, "../../build/icon.png");
      if (existsSync(dockIconPath)) {
        app.dock?.setIcon(dockIconPath);
      }
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
