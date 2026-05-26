import type { DiffNode, DiffStatus, StatusFilter } from "./types";
import { getParentPaths, sortTreePaths } from "./path";

const changedStatuses = new Set<DiffStatus>([
  "modified",
  "left-only",
  "right-only",
  "type-changed",
  "binary",
  "error"
]);

const issueStatuses = new Set<DiffStatus>(["binary", "skipped", "error", "type-changed"]);

export function matchesStatusFilter(node: DiffNode, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "changed") return changedStatuses.has(node.status);
  if (filter === "equal") return node.status === "equal";
  if (filter === "left-only") return node.status === "left-only";
  if (filter === "right-only") return node.status === "right-only";
  return issueStatuses.has(node.status);
}

/** Keeps matched nodes plus ancestors so filtered trees remain navigable. */
export function filterTreeNodes(nodes: DiffNode[], filter: StatusFilter) {
  if (filter === "all") return nodes;

  const nodeMap = new Map(nodes.map((node) => [node.path, node]));
  const included = new Set<string>();

  for (const node of nodes) {
    if (!matchesStatusFilter(node, filter)) continue;
    included.add(node.path);
    for (const parentPath of getParentPaths(node.path)) {
      included.add(parentPath);
    }
  }

  return [...included]
    .sort(sortTreePaths)
    .map((path) => nodeMap.get(path))
    .filter((node): node is DiffNode => Boolean(node));
}

export function searchNodes(nodes: DiffNode[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const nodeMap = new Map(nodes.map((node) => [node.path, node]));
  const included = new Set<string>();

  for (const node of nodes) {
    if (!node.path.toLowerCase().includes(normalized)) continue;
    included.add(node.path);
    for (const parentPath of getParentPaths(node.path)) {
      included.add(parentPath);
    }
  }

  return [...included]
    .sort(sortTreePaths)
    .map((path) => nodeMap.get(path))
    .filter((node): node is DiffNode => Boolean(node));
}
