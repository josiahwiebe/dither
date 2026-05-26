import { MultiFileDiff, Virtualizer, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { AlertCircle, ChevronDown, ChevronUp, Clock3, Database, FileWarning, Loader2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileDiffMetadata, VirtualFileMetrics } from "@pierre/diffs";

import { decodeUtf8 } from "../lib/binary";
import { extractDocxText, isDocxPath } from "../lib/docx";
import { FileKindIcon } from "./FileKindIcon";
import type { DiffNode, FileSystemAdapter, ReadyComparison, ReadFileResult } from "../lib/types";

interface DiffPreviewProps {
  adapter: FileSystemAdapter;
  collapseUnchanged: boolean;
  comparison: ReadyComparison | null;
  diffViewMode: "split" | "unified";
  node: DiffNode | null;
  theme: "dark" | "light";
}

const customHeaderMetrics: VirtualFileMetrics = {
  diffHeaderHeight: 96,
  hunkLineCount: 50,
  lineHeight: 22,
  paddingBottom: 10,
  spacing: 0
};

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

[data-diffs-header] {
  border-bottom: 1px solid light-dark(rgb(24 31 38 / 10%), rgb(255 255 255 / 12%));
  box-shadow: 0 1px 0 light-dark(rgb(255 255 255 / 80%), rgb(255 255 255 / 5%));
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

[data-line-type=change-addition]:is([data-line], [data-column-number], [data-gutter-buffer], [data-no-newline]) {
  box-shadow: inset 3px 0 0 var(--diffs-addition-base);
}

[data-line-type=change-deletion]:is([data-line], [data-column-number], [data-gutter-buffer], [data-no-newline]) {
  box-shadow: inset 3px 0 0 var(--diffs-deletion-base);
}

[data-diff-span] {
  border-radius: 3px;
  padding-inline: 1px;
}
`;

type PreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { message: string; type: "unavailable" }
  | { error: string; type: "failed" }
  | {
      left: ReadFileResult | null;
      leftText: string;
      right: ReadFileResult | null;
      rightText: string;
      type: "ready";
    };

function getPreviewNames(comparison: ReadyComparison | null, node: DiffNode | null) {
  if (!node) return { left: "left", right: "right" };
  if (comparison?.mode === "file") {
    return {
      left: node.left ? comparison.left.displayPath : `${comparison.left.displayPath} (missing)`,
      right: node.right ? comparison.right.displayPath : `${comparison.right.displayPath} (missing)`
    };
  }

  return {
    left: node.left ? node.path : `${node.path} (missing)`,
    right: node.right ? node.path : `${node.path} (missing)`
  };
}

function createWorkerPoolOptions() {
  return {
    poolSize: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)),
    workerFactory: () =>
      new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
        type: "module"
      })
  };
}

async function readPreviewPair(
  adapter: FileSystemAdapter,
  comparison: ReadyComparison,
  node: DiffNode,
  signal: AbortSignal
) {
  const path = comparison.mode === "file" ? undefined : node.path;

  const [left, right] = await Promise.all([
    node.left ? adapter.readFile(comparison.left, path) : Promise.resolve(null),
    node.right ? adapter.readFile(comparison.right, path) : Promise.resolve(null)
  ]);

  signal.throwIfAborted();
  const names = getPreviewNames(comparison, node);

  return {
    left,
    leftText: left ? getComparableText(left, names.left) : "",
    right,
    rightText: right ? getComparableText(right, names.right) : ""
  };
}

function getComparableText(file: ReadFileResult, path: string) {
  if (isDocxPath(file.name) || isDocxPath(path)) return extractDocxText(file.bytes);
  return file.isBinary ? "" : decodeUtf8(file.bytes);
}

function countChangedLines(fileDiff: FileDiffMetadata) {
  return fileDiff.hunks.reduce(
    (totals, hunk) => ({
      additions: totals.additions + hunk.additionLines,
      deletions: totals.deletions + hunk.deletionLines
    }),
    { additions: 0, deletions: 0 }
  );
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "Missing";
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 10 ? 0 : 1 })} ${units[unitIndex]}`;
}

function formatModifiedAt(modifiedAt: number | null | undefined) {
  if (!modifiedAt) return "No modified date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(modifiedAt));
}

function shortHash(hash: string | undefined) {
  return hash ? hash.slice(0, 8) : "No hash";
}

function getCustomHeaderTitle(leftName: string, rightName: string) {
  return leftName === rightName ? rightName : `${leftName} / ${rightName}`;
}

/** Renders one source's file metadata inside the comparison header. */
function DiffSideMetadata({
  file,
  label,
  name
}: {
  file: ReadFileResult | null;
  label: string;
  name: string;
}) {
  return (
    <div className="diff-side-meta">
      <span className="diff-side-meta__badge">{label}</span>
      <span className="diff-side-meta__name">{name}</span>
      <span className="diff-side-meta__details">
        {formatBytes(file?.size)} / {formatModifiedAt(file?.modifiedAt)}
      </span>
    </div>
  );
}

/** Renders the file header slotted into the diff web component. */
function DiffFileHeader({
  fileDiff,
  leftFile,
  leftName,
  onChangeTotal,
  rightFile,
  rightName
}: {
  fileDiff: FileDiffMetadata;
  leftFile: ReadFileResult | null;
  leftName: string;
  onChangeTotal: (changes: number) => void;
  rightFile: ReadFileResult | null;
  rightName: string;
}) {
  const { additions, deletions } = countChangedLines(fileDiff);
  const changes = additions + deletions;
  const title = getCustomHeaderTitle(leftName, rightName);

  useEffect(() => {
    onChangeTotal(Math.max(1, changes));
  }, [changes, onChangeTotal]);

  return (
    <div className="diff-file-header">
      <FileKindIcon path={rightName} />
      <div className="diff-file-header__text">
        <strong>{title}</strong>
        <div className="diff-file-header__stats" aria-label="Diff statistics">
          <span className="diff-stat diff-stat--add">
            <Plus size={12} aria-hidden="true" />
            {additions.toLocaleString()} additions
          </span>
          <span className="diff-stat diff-stat--delete">
            <Minus size={12} aria-hidden="true" />
            {deletions.toLocaleString()} deletions
          </span>
          <span className="diff-stat">{changes.toLocaleString()} changes</span>
        </div>
      </div>
      <div className="diff-file-header__paths">
        <DiffSideMetadata file={leftFile} label="A" name={leftName} />
        <DiffSideMetadata file={rightFile} label="B" name={rightName} />
      </div>
      <div className="diff-file-header__fingerprints">
        <span>
          <Database size={12} aria-hidden="true" />
          {formatBytes(leftFile?.size)} -&gt; {formatBytes(rightFile?.size)}
        </span>
        <span>
          <Clock3 size={12} aria-hidden="true" />
          {formatModifiedAt(rightFile?.modifiedAt)}
        </span>
        <span>{shortHash(leftFile?.contentHash)} -&gt; {shortHash(rightFile?.contentHash)}</span>
      </div>
    </div>
  );
}

/** Renders metadata, binary notices, or a virtualized diffs.com text diff. */
export function DiffPreview({ adapter, collapseUnchanged, comparison, diffViewMode, node, theme }: DiffPreviewProps) {
  const [state, setState] = useState<PreviewState>({ type: "idle" });
  const [currentChange, setCurrentChange] = useState(1);
  const [changeTotal, setChangeTotal] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);
  const updateChangeTotal = useCallback((nextTotal: number) => {
    setChangeTotal(nextTotal);
    setCurrentChange((current) => Math.min(current, nextTotal));
  }, []);
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
  const names = getPreviewNames(comparison, node);

  useEffect(() => {
    if (!comparison || !node) {
      setState({ type: "idle" });
      return;
    }

    if (node.kind !== "file") {
      setState({ message: "Select a file to view the content diff.", type: "unavailable" });
      return;
    }

    if (node.status === "error") {
      setState({ message: node.left?.error ?? node.right?.error ?? "Unable to read this file.", type: "unavailable" });
      return;
    }

    if (node.status === "type-changed") {
      setState({ message: "This path is a file on one side and a folder on the other.", type: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setCurrentChange(1);
    setState({ type: "loading" });

    readPreviewPair(adapter, comparison, node, controller.signal)
      .then((result) => {
        if (result.left?.isBinary || result.right?.isBinary) {
          setState({ message: "Binary files are compared by bytes and metadata in v1.", type: "unavailable" });
          return;
        }

        setState({ ...result, type: "ready" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ error: error instanceof Error ? error.message : "Unable to read preview.", type: "failed" });
      });

    return () => controller.abort();
  }, [adapter, comparison, node]);

  if (!comparison || !node) {
    return (
      <div className="preview-empty">
        <FileWarning size={28} aria-hidden="true" />
        <span>Run a comparison to inspect a file.</span>
      </div>
    );
  }

  if (state.type === "loading") {
    return (
      <div className="preview-empty">
        <Loader2 className="spin" size={26} aria-hidden="true" />
        <span>Reading preview</span>
      </div>
    );
  }

  if (state.type === "failed") {
    return (
      <div className="preview-empty">
        <AlertCircle size={28} aria-hidden="true" />
        <span>{state.error}</span>
      </div>
    );
  }

  if (state.type === "unavailable") {
    return (
      <div className="metadata-panel">
        <FileWarning size={26} aria-hidden="true" />
        <strong>{node.path}</strong>
        <span>{state.message}</span>
        <dl>
          <div>
            <dt>Left</dt>
            <dd>{node.left ? `${node.left.size.toLocaleString()} bytes` : "Missing"}</dd>
          </div>
          <div>
            <dt>Right</dt>
            <dd>{node.right ? `${node.right.size.toLocaleString()} bytes` : "Missing"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{node.status}</dd>
          </div>
        </dl>
      </div>
    );
  }

  if (state.type !== "ready") return null;

  function scrollDiff(direction: "next" | "previous") {
    const virtualizer = previewRef.current?.querySelector<HTMLElement>(".diff-virtualizer");
    setCurrentChange((current) => {
      if (direction === "next") return current >= changeTotal ? 1 : current + 1;
      return current <= 1 ? changeTotal : current - 1;
    });
    virtualizer?.scrollBy({
      behavior: "smooth",
      top: direction === "next" ? 360 : -360
    });
  }

  return (
    <WorkerPoolContextProvider highlighterOptions={highlighterOptions} poolOptions={workerPoolOptions}>
      <div className="diff-preview-shell" ref={previewRef}>
        <Virtualizer className="diff-virtualizer" contentClassName="diff-virtualizer__content">
          <MultiFileDiff
            metrics={customHeaderMetrics}
            newFile={{
              cacheKey: state.right?.contentHash,
              contents: state.rightText,
              name: names.right
            }}
            oldFile={{
              cacheKey: state.left?.contentHash,
              contents: state.leftText,
              name: names.left
            }}
            options={{
              collapsedContextThreshold: collapseUnchanged ? 16 : 0,
              diffIndicators: "bars",
              diffStyle: diffViewMode,
              expandUnchanged: !collapseUnchanged,
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
            renderCustomHeader={(fileDiff) => (
              <DiffFileHeader
                fileDiff={fileDiff}
                leftFile={state.left}
                leftName={names.left}
                onChangeTotal={updateChangeTotal}
                rightFile={state.right}
                rightName={names.right}
              />
            )}
          />
        </Virtualizer>
        <div className="diff-change-bar">
          <div>
            <strong>
              Change {currentChange.toLocaleString()} of {changeTotal.toLocaleString()}
            </strong>
          </div>
          <div className="diff-change-bar__actions">
            <button type="button" aria-label="Previous change" onClick={() => scrollDiff("previous")}>
              <ChevronUp size={16} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next change" onClick={() => scrollDiff("next")}>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </WorkerPoolContextProvider>
  );
}
