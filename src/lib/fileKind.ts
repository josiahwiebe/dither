/** Returns true for modern zipped Word documents, not legacy binary .doc files. */
export function isDocxPath(path: string) {
  return path.toLowerCase().endsWith(".docx");
}
