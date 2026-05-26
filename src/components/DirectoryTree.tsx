import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import { useEffect, useMemo } from "react";

import { normalizeRelativePath, sortTreePaths } from "../lib/path";
import type { DiffNode, DiffStatus } from "../lib/types";

interface DirectoryTreeProps {
  nodes: DiffNode[];
  onSelect: (path: string) => void;
  query: string;
  selectedPath: string | null;
}

interface FileTreeSurfaceProps {
  diffPathByTreePath: Map<string, string>;
  gitStatus: GitStatusEntry[];
  nodes: DiffNode[];
  onSelect: (path: string) => void;
  paths: string[];
  query: string;
  selectedTreePath: string | null;
  statusByPath: Map<string, DiffStatus>;
}

interface TreeProjection {
  diffPathByTreePath: Map<string, string>;
  gitStatus: GitStatusEntry[];
  paths: string[];
  treePathByDiffPath: Map<string, string>;
  statusByPath: Map<string, DiffStatus>;
}

function toGitStatus(node: DiffNode): GitStatusEntry | null {
  if (node.status === "right-only") return { path: node.path, status: "added" };
  if (node.status === "left-only") return { path: node.path, status: "deleted" };
  if (node.status === "modified" || node.status === "binary" || node.status === "type-changed") {
    return { path: node.path, status: "modified" };
  }
  if (node.status === "error" || node.status === "skipped") return { path: node.path, status: "ignored" };
  return null;
}

function statusLabel(status: DiffStatus) {
  if (status === "left-only") return "left";
  if (status === "right-only") return "right";
  if (status === "type-changed") return "type";
  return status;
}

function withDirectoryMarker(path: string) {
  const normalized = normalizeRelativePath(path);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function hasDescendant(path: string, paths: ReadonlySet<string>) {
  const prefix = `${normalizeRelativePath(path)}/`;
  for (const candidate of paths) {
    if (candidate.startsWith(prefix)) return true;
  }

  return false;
}

/** Converts app diff nodes into the path syntax required by @pierre/trees. */
export function createTreeProjection(nodes: DiffNode[]): TreeProjection {
  const nodePaths = new Set(nodes.map((node) => normalizeRelativePath(node.path)));
  const treePathByDiffPath = new Map<string, string>();
  const diffPathByTreePath = new Map<string, string>();
  const statusByPath = new Map<string, DiffStatus>();

  for (const node of nodes) {
    const diffPath = normalizeRelativePath(node.path);
    const shouldRenderAsDirectory = node.kind === "directory" || hasDescendant(diffPath, nodePaths);
    const treePath = shouldRenderAsDirectory ? withDirectoryMarker(diffPath) : diffPath;

    treePathByDiffPath.set(diffPath, treePath);
    diffPathByTreePath.set(treePath, diffPath);
    diffPathByTreePath.set(diffPath, diffPath);
    statusByPath.set(treePath, node.status);
    statusByPath.set(diffPath, node.status);
  }

  const paths = [...new Set(treePathByDiffPath.values())].sort(sortTreePaths);
  const gitStatus = nodes
    .map((node) => {
      const status = toGitStatus(node);
      if (!status) return null;
      return {
        ...status,
        path: treePathByDiffPath.get(normalizeRelativePath(node.path)) ?? normalizeRelativePath(node.path)
      };
    })
    .filter((entry): entry is GitStatusEntry => Boolean(entry));

  return {
    diffPathByTreePath,
    gitStatus,
    paths,
    statusByPath,
    treePathByDiffPath
  };
}

function FileTreeSurface({
  diffPathByTreePath,
  gitStatus,
  nodes,
  onSelect,
  paths,
  query,
  selectedTreePath,
  statusByPath
}: FileTreeSurfaceProps) {
  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    gitStatus,
    initialExpandedPaths: selectedTreePath ? [selectedTreePath] : undefined,
    initialExpansion: 1,
    initialSelectedPaths: selectedTreePath ? [selectedTreePath] : undefined,
    itemHeight: 28,
    onSelectionChange(paths) {
      const [path] = paths;
      if (path) onSelect(diffPathByTreePath.get(path) ?? normalizeRelativePath(path));
    },
    paths,
    renderRowDecoration({ item }) {
      const status = statusByPath.get(item.path);
      if (!status || status === "equal") return null;
      return { text: statusLabel(status), title: status };
    },
    search: false
  });

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  useEffect(() => {
    if (!selectedTreePath) return;
    model.getItem(selectedTreePath)?.select();
    model.scrollToPath(selectedTreePath, { offset: "nearest" });
  }, [model, selectedTreePath]);

  useEffect(() => {
    if (query.trim()) {
      model.openSearch(query.trim());
      model.setSearch(query.trim());
    } else {
      model.closeSearch();
    }
  }, [model, query]);

  if (nodes.length === 0) {
    return <div className="empty-tree">No files match this view.</div>;
  }

  return <FileTree className="file-tree-host" model={model} />;
}

/** Bridges normalized diff nodes into the trees.software React model. */
export function DirectoryTree({ nodes, onSelect, query, selectedPath }: DirectoryTreeProps) {
  const { diffPathByTreePath, gitStatus, paths, statusByPath, treePathByDiffPath } = useMemo(
    () => createTreeProjection(nodes),
    [nodes]
  );
  const selectedTreePath = selectedPath ? (treePathByDiffPath.get(normalizeRelativePath(selectedPath)) ?? selectedPath) : null;
  const modelKey = `${paths.join("\u0000")}:${gitStatus.map((entry) => `${entry.path}:${entry.status}`).join("\u0000")}`;

  return (
    <FileTreeSurface
      key={modelKey}
      diffPathByTreePath={diffPathByTreePath}
      gitStatus={gitStatus}
      nodes={nodes}
      onSelect={onSelect}
      paths={paths}
      query={query}
      selectedTreePath={selectedTreePath}
      statusByPath={statusByPath}
    />
  );
}
