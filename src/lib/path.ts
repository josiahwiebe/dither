const slashRun = /\/+/g;

/** Normalizes file tree paths to a stable, slash-separated public ID. */
export function normalizeRelativePath(path: string) {
  return path
    .replaceAll("\\", "/")
    .replace(slashRun, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function joinRelativePath(directory: string, basename: string) {
  return normalizeRelativePath(directory === "" ? basename : `${directory}/${basename}`);
}

export function getBasename(path: string) {
  const normalized = normalizeRelativePath(path);
  return normalized.split("/").at(-1) ?? normalized;
}

export function getParentPaths(path: string) {
  const segments = normalizeRelativePath(path).split("/").filter(Boolean);
  const parents: string[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    parents.push(segments.slice(0, index).join("/"));
  }

  return parents;
}

export function sortTreePaths(left: string, right: string) {
  const leftSegments = normalizeRelativePath(left).split("/");
  const rightSegments = normalizeRelativePath(right).split("/");
  const length = Math.min(leftSegments.length, rightSegments.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = leftSegments[index].localeCompare(rightSegments[index], undefined, {
      numeric: true,
      sensitivity: "base"
    });
    if (comparison !== 0) return comparison;
  }

  return leftSegments.length - rightSegments.length;
}
