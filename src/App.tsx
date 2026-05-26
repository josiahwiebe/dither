import {
  AlertCircle,
  ArrowLeftRight,
  Columns2,
  Files,
  ListCollapse,
  Loader2,
  Moon,
  RotateCcw,
  Rows3,
  Search,
  Sun,
  Upload,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

import { createFileSystemAdapter } from "./adapters/fileSystem";
import { FileKindIcon } from "./components/FileKindIcon";
import { SourceSlot } from "./components/SourceSlot";
import { StatusFilterBar } from "./components/StatusFilterBar";
import { compareSources } from "./lib/compare";
import { filterTreeNodes, searchNodes } from "./lib/filters";
import type {
  ComparisonSession,
  ComparisonSource,
  DiffNode,
  DiffSummary,
  ReadyComparison,
  SourceKind,
  StatusFilter
} from "./lib/types";

const themeStorageKey = "dither.theme";
const logoUrl = `${import.meta.env.BASE_URL}dither-logo.svg`;
const DiffPreview = lazy(() => import("./components/DiffPreview").then((module) => ({ default: module.DiffPreview })));
const DirectoryTree = lazy(() => import("./components/DirectoryTree").then((module) => ({ default: module.DirectoryTree })));
type DiffViewMode = "split" | "unified";
type DropTarget = "app" | "left" | "right";

function getInitialTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function firstSelectablePath(nodes: DiffNode[]) {
  return (
    nodes.find((node) => node.kind === "file" && node.status !== "equal" && node.status !== "error")?.path ??
    nodes.find((node) => node.kind === "file")?.path ??
    nodes[0]?.path ??
    null
  );
}

function hasFileDrop(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function getFileDropCount(event: DragEvent<HTMLElement>) {
  const itemCount = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file").length;
  return itemCount || event.dataTransfer.files.length;
}

function getTargetedDropZone(event: DragEvent<HTMLElement>): DropTarget {
  if (getFileDropCount(event) > 1) return "app";
  return event.clientX < window.innerWidth / 2 ? "left" : "right";
}

function summaryCount(label: string, count: number) {
  return `${label} ${count.toLocaleString()}`;
}

/** Builds drag overlay copy for the current drop target. */
function getDropOverlayCopy(target: DropTarget | null) {
  if (target === "left") {
    return {
      title: "Drop to set Original",
      detail: "Drop one item to replace the original side."
    };
  }

  if (target === "right") {
    return {
      title: "Drop to set Changed",
      detail: "Drop one item to replace the changed side."
    };
  }

  return {
    title: "Drop to compare",
    detail: "Drop two items to replace the comparison."
  };
}

function formatDiffSummary(summary: DiffSummary) {
  const issues = summary.error + summary.binary + summary.skipped + summary.typeChanged;

  return [
    summaryCount("Modified", summary.modified),
    summaryCount("Right only", summary.rightOnly),
    summaryCount("Left only", summary.leftOnly),
    summaryCount("Equal", summary.equal),
    summaryCount("Issues", issues)
  ].join(", ");
}

function getHeaderTitle(comparison: ReadyComparison | null, selectedNode: DiffNode | null) {
  if (!comparison) return "Dither";

  if (comparison.mode === "file") {
    const leftLabel = comparison.left.displayPath;
    const rightLabel = comparison.right.displayPath;

    return leftLabel === rightLabel ? leftLabel : `${leftLabel} / ${rightLabel}`;
  }

  return selectedNode?.path ?? `${comparison.left.displayPath} / ${comparison.right.displayPath}`;
}

function getHeaderIconPath(comparison: ReadyComparison | null, selectedNode: DiffNode | null) {
  if (!comparison) return "dither";
  return comparison.mode === "file" ? comparison.right.name : (selectedNode?.path ?? comparison.right.name);
}

/** Coordinates source picking, comparison execution, and result selection. */
export function App() {
  const adapter = useMemo(createFileSystemAdapter, []);
  const abortRef = useRef<AbortController | null>(null);
  const autoCompareKeyRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [leftSource, setLeftSource] = useState<ComparisonSource | null>(null);
  const [rightSource, setRightSource] = useState<ComparisonSource | null>(null);
  const [session, setSession] = useState<ComparisonSession>({ type: "idle" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("changed");
  const [query, setQuery] = useState("");
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");
  const [collapseUnchanged, setCollapseUnchanged] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.platform = adapter.platform;
    localStorage.setItem(themeStorageKey, theme);
  }, [adapter.platform, theme]);

  useEffect(() => {
    if (!leftSource || !rightSource || leftSource.kind !== rightSource.kind) {
      autoCompareKeyRef.current = null;
      return;
    }

    const comparisonKey = `${leftSource.id}\u0000${rightSource.id}`;
    if (autoCompareKeyRef.current === comparisonKey) return;

    autoCompareKeyRef.current = comparisonKey;
    void runComparison(leftSource, rightSource);
  }, [leftSource, rightSource]);

  const readyComparison = session.type === "ready" ? session : null;
  const selectedNode = readyComparison?.nodes.find((node) => node.path === selectedPath) ?? readyComparison?.nodes[0] ?? null;

  const visibleNodes = useMemo(() => {
    if (!readyComparison) return [];
    return searchNodes(filterTreeNodes(readyComparison.nodes, filter), query);
  }, [filter, query, readyComparison]);

  async function pickSource(side: "left" | "right", kind?: SourceKind) {
    try {
      const source = await adapter.pickSource(kind);
      if (!source) return;

      if (side === "left") setLeftSource(source);
      else setRightSource(source);

      setSession({ type: "idle" });
      setSelectedPath(null);
    } catch (error) {
      setSession({
        error: error instanceof Error ? error.message : "Unable to pick source.",
        type: "failed"
      });
    }
  }

  async function runComparison(
    nextLeftSource: ComparisonSource | null = leftSource,
    nextRightSource: ComparisonSource | null = rightSource
  ) {
    if (!nextLeftSource || !nextRightSource) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSession({ message: "Starting comparison", progress: null, type: "scanning" });
    setSelectedPath(null);

    try {
      const comparison = await compareSources(adapter, nextLeftSource, nextRightSource, {
        onProgress(message, progress) {
          setSession({ message, progress, type: "scanning" });
        },
        signal: controller.signal
      });
      const nextSelectedPath = firstSelectablePath(comparison.nodes);
      setSelectedPath(nextSelectedPath);
      setSession({ ...comparison, type: "ready" });
    } catch (error) {
      if (controller.signal.aborted) {
        if (abortRef.current === controller) setSession({ type: "idle" });
        return;
      }

      setSession({
        error: error instanceof Error ? error.message : "Unable to compare sources.",
        type: "failed"
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function resetComparison() {
    abortRef.current?.abort();
    abortRef.current = null;
    autoCompareKeyRef.current = null;
    setLeftSource(null);
    setRightSource(null);
    setSession({ type: "idle" });
    setSelectedPath(null);
    setFilter("changed");
    setQuery("");
  }

  function swapSources() {
    if (!leftSource || !rightSource) return;

    abortRef.current?.abort();
    abortRef.current = null;
    setLeftSource(rightSource);
    setRightSource(leftSource);
    setSession({ type: "idle" });
    setSelectedPath(null);
  }

  function applyDroppedSources(sources: ComparisonSource[], target: DropTarget | null) {
    if (sources.length === 0) {
      setSession({ error: "No readable files were found in that drop.", type: "failed" });
      return;
    }

    const [firstSource, secondSource] = sources;

    if (firstSource && secondSource) {
      if (firstSource.kind !== secondSource.kind) {
        setSession({ error: "Drop two files or two folders for a comparison.", type: "failed" });
        return;
      }

      setLeftSource(firstSource);
      setRightSource(secondSource);
      setSession({ type: "idle" });
      setSelectedPath(null);
      return;
    }

    if (!firstSource) return;

    if (target === "right" || (target !== "left" && leftSource && !rightSource)) {
      setRightSource(firstSource);
    } else {
      setLeftSource(firstSource);
    }

    setSession({ type: "idle" });
    setSelectedPath(null);
  }

  async function acceptDrop(event: DragEvent<HTMLElement>, target: DropTarget | null) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDropTarget(null);

    try {
      applyDroppedSources(await adapter.sourcesFromDataTransfer(event.dataTransfer), target);
    } catch (error) {
      setSession({
        error: error instanceof Error ? error.message : "Unable to read dropped files.",
        type: "failed"
      });
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFileDrop(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDropTarget(getTargetedDropZone(event));
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFileDrop(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFileDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropTarget(getTargetedDropZone(event));
  }

  const canCompare = Boolean(leftSource && rightSource);
  const isDropActive = dropTarget !== null;
  const dropOverlayCopy = getDropOverlayCopy(dropTarget);
  const headerTitle = getHeaderTitle(readyComparison, selectedNode);
  const headerIconPath = getHeaderIconPath(readyComparison, selectedNode);
  const headerSubtitle =
    session.type === "scanning"
      ? session.message
      : readyComparison
        ? formatDiffSummary(readyComparison.summary)
        : "";
  const hasSources = Boolean(leftSource || rightSource);
  const pendingSide: "left" | "right" = leftSource && !rightSource ? "right" : "left";
  const pendingLabel = pendingSide === "left" ? "original" : "changed";
  const selectedSource = leftSource ?? rightSource;

  return (
    <>
      <main
        className={isDropActive ? "app-shell app-shell--drop-active" : "app-shell"}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(event) => void acceptDrop(event, getTargetedDropZone(event))}
      >
        <div className="liquid-veil" aria-hidden="true" />
        <header className={readyComparison ? "top-bar top-bar--comparison" : "top-bar"}>
        <div className="traffic-spacer" aria-hidden="true" />
        <div className={readyComparison ? "header-title header-title--comparison" : "brand-lockup"}>
          {readyComparison ? (
            <>
              <FileKindIcon path={headerIconPath} />
              <div>
                <strong>{headerTitle}</strong>
                <span>{headerSubtitle}</span>
              </div>
            </>
          ) : (
            <img className="brand-logo" src={logoUrl} alt="Dither" />
          )}
        </div>
        <div className="top-bar__actions">
          {canCompare ? (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Swap comparison sides"
                disabled={!leftSource || !rightSource || session.type === "scanning"}
                onClick={swapSources}
              >
                <ArrowLeftRight size={17} aria-hidden="true" />
              </button>
              <div className="segmented-icon-control" aria-label="Diff layout">
                <button
                  type="button"
                  aria-pressed={diffViewMode === "split"}
                  aria-label="Split diff"
                  className={diffViewMode === "split" ? "is-active" : undefined}
                  onClick={() => setDiffViewMode("split")}
                >
                  <Columns2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-pressed={diffViewMode === "unified"}
                  aria-label="Unified diff"
                  className={diffViewMode === "unified" ? "is-active" : undefined}
                  onClick={() => setDiffViewMode("unified")}
                >
                  <Rows3 size={16} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className={collapseUnchanged ? "icon-button is-active" : "icon-button"}
                aria-label={collapseUnchanged ? "Show unchanged lines" : "Collapse unchanged lines"}
                aria-pressed={collapseUnchanged}
                onClick={() => setCollapseUnchanged((value) => !value)}
              >
                <ListCollapse size={17} aria-hidden="true" />
              </button>
            </>
          ) : null}
          {hasSources ? (
            <button
              type="button"
              className="icon-button"
              aria-label="Reset comparison"
              onClick={resetComparison}
            >
              <RotateCcw size={17} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <section className="source-grid" aria-label="Comparison sources">
        <SourceSlot
          isDragActive={dropTarget === "left" || dropTarget === "app"}
          side="left"
          source={leftSource}
          onPick={() => void pickSource("left")}
          onSourceDragHover={(event) => setDropTarget(getTargetedDropZone(event))}
          onSourceDrop={(event) => void acceptDrop(event, "left")}
        />
        <SourceSlot
          isDragActive={dropTarget === "right" || dropTarget === "app"}
          side="right"
          source={rightSource}
          onPick={() => void pickSource("right")}
          onSourceDragHover={(event) => setDropTarget(getTargetedDropZone(event))}
          onSourceDrop={(event) => void acceptDrop(event, "right")}
        />
      </section>

      {session.type === "failed" ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          {session.error}
        </div>
      ) : null}

      {session.type === "scanning" ? (
        <div className="scan-banner" role="status">
          <Loader2 className="spin" size={17} aria-hidden="true" />
          <span>{session.message}</span>
        </div>
      ) : null}

      <section className={readyComparison?.mode === "directory" ? "workspace" : "workspace workspace--single"}>
        {readyComparison?.mode === "directory" ? (
          <aside className="tree-pane">
            <div className="pane-toolbar">
              <div className="search-box">
                <Search size={15} aria-hidden="true" />
                <input
                  aria-label="Search compared paths"
                  placeholder="Search paths"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <StatusFilterBar active={filter} summary={readyComparison.summary} onChange={setFilter} />
            <Suspense fallback={<div className="empty-tree">Loading tree</div>}>
              <DirectoryTree
                nodes={visibleNodes}
                onSelect={setSelectedPath}
                query={query}
                selectedPath={selectedPath}
              />
            </Suspense>
          </aside>
        ) : null}

        <section className="preview-pane" aria-label="Diff preview">
          {readyComparison ? (
            <Suspense
              fallback={
                <div className="preview-empty">
                  <Loader2 className="spin" size={26} aria-hidden="true" />
                  <span>Loading diff renderer</span>
                </div>
              }
            >
              <DiffPreview
                adapter={adapter}
                collapseUnchanged={collapseUnchanged}
                comparison={readyComparison}
                diffViewMode={diffViewMode}
                node={selectedNode}
                theme={theme}
              />
            </Suspense>
          ) : (
            <div className="empty-state">
              <div className="empty-state__hero" aria-hidden="true">
                <div className="empty-state__drop-mark">
                  <Files size={58} />
                  <strong>Drop files here</strong>
                </div>
              </div>
              <div className="empty-state__body">
                <div className="empty-state__copy">
                  <strong>{selectedSource ? `${selectedSource.name} is ready` : "Start a comparison"}</strong>
                  <span>
                    {selectedSource
                      ? `Add the ${pendingLabel} item to compare.`
                      : "Open a file or folder pair, or drop two matching items into Dither."}
                  </span>
                </div>
                <div className="empty-state__actions">
                  {selectedSource ? (
                    <button
                      type="button"
                      className="primary-button primary-button--large"
                      onClick={() => void pickSource(pendingSide)}
                    >
                      <Upload size={18} aria-hidden="true" />
                      {`Add ${pendingLabel}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button primary-button--large"
                      onClick={() => void pickSource("left")}
                    >
                      <Upload size={18} aria-hidden="true" />
                      Open
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
      </main>

      {isDropActive ? (
        <div className={`drop-overlay drop-overlay--${dropTarget}`} aria-hidden="true">
          <div className="drop-overlay__card">
            <Files size={34} />
            <div>
              <strong>{dropOverlayCopy.title}</strong>
              <span>{dropOverlayCopy.detail}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
