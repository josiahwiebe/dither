import { PatchDiff, UnresolvedFile, Virtualizer, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { AlertCircle, Check, FileWarning, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { bytesFromBase64 } from "../adapters/base64";
import { decodeUtf8 } from "../lib/binary";
import type { DitherSession, GitActionKind, GitSessionFile } from "../lib/gitSession";

interface GitDiffPreviewProps {
  collapseUnchanged: boolean;
  diffViewMode: "split" | "unified";
  file: GitSessionFile | null;
  onError(error: string): void;
  onSessionChange(session: DitherSession): void;
  session: DitherSession;
  theme: "dark" | "light";
}

type ConflictState =
  | { type: "idle" }
  | { type: "loading" }
  | { error: string; type: "failed" }
  | { contents: string; type: "ready" };

const diffViewerCSS = `
:host {
  --diffs-font-family: "SF Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace;
  --diffs-font-size: 12px;
  --diffs-line-height: 22px;
  --diffs-light-bg: #fbfcfd;
  --diffs-dark-bg: #0f1318;
  --diffs-light: #1a1d22;
  --diffs-dark: #eef3f7;
  --diffs-bg-context-override: light-dark(#fbfcfd, #0f1318);
  --diffs-bg-context-gutter-override: light-dark(#eef2f6, #171d24);
  --diffs-bg-addition-override: light-dark(#dff7e7, #163821);
  --diffs-bg-deletion-override: light-dark(#ffe1df, #41201f);
  --diffs-bg-addition-emphasis-override: light-dark(#beeecd, #245a33);
  --diffs-bg-deletion-emphasis-override: light-dark(#ffc5c0, #65322f);
  --diffs-addition-color: #1f9f4a;
  --diffs-deletion-color: #e5483f;
  --diffs-fg-number-override: light-dark(#8b96a5, #778391);
}

pre[data-diff] {
  background:
    linear-gradient(90deg, light-dark(#f5f8fb, #121821) 0 54px, transparent 54px),
    var(--diffs-bg);
}

[data-column-number] {
  border-right: 1px solid light-dark(rgb(24 31 38 / 9%), rgb(255 255 255 / 10%));
  font-size: 11px;
}

[data-line],
[data-column-number],
[data-gutter-buffer],
[data-no-newline] {
  min-height: 22px;
}
`;

function createWorkerPoolOptions() {
  return {
    poolSize: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)),
    workerFactory: () =>
      new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
        type: "module"
      })
  };
}

function actionLabel(action: GitActionKind) {
  if (action === "stage") return "Stage";
  if (action === "unstage") return "Unstage";
  if (action === "discard") return "Discard";
  return "Apply";
}

function actionIcon(action: GitActionKind) {
  if (action === "stage") return <Check size={14} aria-hidden="true" />;
  if (action === "unstage") return <RotateCcw size={14} aria-hidden="true" />;
  if (action === "discard") return <Trash2 size={14} aria-hidden="true" />;
  return <Upload size={14} aria-hidden="true" />;
}

/** Renders action buttons for one file or hunk. */
function GitActionButtons({
  actions,
  disabled,
  onAction
}: {
  actions: GitActionKind[];
  disabled: boolean;
  onAction(action: GitActionKind): void;
}) {
  return (
    <div className="git-action-buttons">
      {actions.map((action) => (
        <button key={action} type="button" disabled={disabled} onClick={() => onAction(action)}>
          {actionIcon(action)}
          {actionLabel(action)}
        </button>
      ))}
    </div>
  );
}

/** Renders git patches, imported patches, and unresolved conflict previews. */
export function GitDiffPreview({
  collapseUnchanged,
  diffViewMode,
  file,
  onError,
  onSessionChange,
  session,
  theme
}: GitDiffPreviewProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState>({ type: "idle" });
  const workerPoolOptions = useMemo(createWorkerPoolOptions, []);
  const highlighterOptions = useMemo(
    () => ({
      lineDiffType: "word" as const,
      maxLineDiffLength: 2_000,
      theme: { dark: "pierre-dark-soft", light: "pierre-light" } as const,
      tokenizeMaxLineLength: 6_000,
      useTokenTransformer: true
    }),
    []
  );

  useEffect(() => {
    if (!file?.conflict) {
      setConflictState({ type: "idle" });
      return;
    }

    const repoPath = session.git?.repoPath;
    if (!repoPath || !window.dither) {
      setConflictState({ error: "Conflict previews require a desktop git session.", type: "failed" });
      return;
    }

    let cancelled = false;
    setConflictState({ type: "loading" });
    window.dither
      .readGitFile(repoPath, file.path)
      .then((payload) => {
        if (cancelled) return;
        setConflictState({ contents: decodeUtf8(bytesFromBase64(payload.base64)), type: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setConflictState({ error: error instanceof Error ? error.message : "Unable to read conflict file.", type: "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [file, session.git?.repoPath]);

  async function runAction(action: GitActionKind, hunkIndex?: number) {
    if (!file || !window.dither) return;

    const pendingKey = `${action}:${file.path}:${hunkIndex ?? "file"}`;
    setPendingAction(pendingKey);

    try {
      const nextSession = await window.dither.performGitAction({
        action,
        filePath: file.path,
        hunkIndex,
        session
      });
      onSessionChange(nextSession);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Git action failed.");
    } finally {
      setPendingAction(null);
    }
  }

  if (!file) {
    return (
      <div className="preview-empty">
        <FileWarning size={28} aria-hidden="true" />
        <span>Select a changed file.</span>
      </div>
    );
  }

  if (file.conflict) {
    if (conflictState.type === "loading") {
      return (
        <div className="preview-empty">
          <Loader2 className="spin" size={26} aria-hidden="true" />
          <span>Reading conflict file</span>
        </div>
      );
    }

    if (conflictState.type === "failed") {
      return (
        <div className="preview-empty">
          <AlertCircle size={28} aria-hidden="true" />
          <span>{conflictState.error}</span>
        </div>
      );
    }

    if (conflictState.type !== "ready") return null;

    return (
      <WorkerPoolContextProvider highlighterOptions={highlighterOptions} poolOptions={workerPoolOptions}>
        <div className="git-preview-shell">
          <Virtualizer className="diff-virtualizer" contentClassName="diff-virtualizer__content">
            <UnresolvedFile
              file={{
                cacheKey: `${session.id}:${file.path}`,
                contents: conflictState.contents,
                name: file.path
              }}
              options={{
                mergeConflictActionsType: "none",
                overflow: "wrap",
                stickyHeader: true,
                theme: { dark: "pierre-dark-soft", light: "pierre-light" },
                themeType: theme,
                unsafeCSS: diffViewerCSS
              }}
            />
          </Virtualizer>
        </div>
      </WorkerPoolContextProvider>
    );
  }

  if (file.isBinary || file.hunks.length === 0) {
    return (
      <div className="metadata-panel">
        <FileWarning size={26} aria-hidden="true" />
        <strong>{file.path}</strong>
        <span>{file.isBinary ? "Binary patches are shown by file status only." : "No text hunks are available."}</span>
        <GitActionButtons actions={file.capabilities} disabled={Boolean(pendingAction)} onAction={(action) => void runAction(action)} />
      </div>
    );
  }

  return (
    <WorkerPoolContextProvider highlighterOptions={highlighterOptions} poolOptions={workerPoolOptions}>
      <div className="git-preview-shell">
        {file.capabilities.length > 0 ? (
          <div className="git-action-bar">
            <div>
              <strong>{file.path}</strong>
              <span>
                {file.additions.toLocaleString()} additions / {file.deletions.toLocaleString()} deletions
              </span>
            </div>
            <GitActionButtons actions={file.capabilities} disabled={Boolean(pendingAction)} onAction={(action) => void runAction(action)} />
          </div>
        ) : null}
        <Virtualizer className="diff-virtualizer" contentClassName="diff-virtualizer__content">
          <PatchDiff
            patch={file.patch}
            options={{
              collapsedContextThreshold: collapseUnchanged ? 16 : 0,
              diffIndicators: "bars",
              diffStyle: diffViewMode,
              expansionLineCount: 24,
              lineDiffType: "word",
              maxLineDiffLength: 2_000,
              overflow: "wrap",
              stickyHeader: true,
              theme: { dark: "pierre-dark-soft", light: "pierre-light" },
              themeType: theme,
              tokenizeMaxLineLength: 6_000,
              unsafeCSS: diffViewerCSS
            }}
          />
        </Virtualizer>
        {file.hunks.length > 0 && file.capabilities.length > 0 ? (
          <div className="git-hunk-list" aria-label="Hunk actions">
            {file.hunks.map((hunk) => (
              <div className="git-hunk-row" key={hunk.index}>
                <code>{hunk.header}</code>
                <GitActionButtons
                  actions={hunk.capabilities}
                  disabled={Boolean(pendingAction)}
                  onAction={(action) => void runAction(action, hunk.index)}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </WorkerPoolContextProvider>
  );
}
