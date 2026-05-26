import {
  Braces,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon
} from "lucide-react";

import { getBasename } from "../lib/path";

interface FileKindIconProps {
  path: string;
  variant?: "badge" | "header";
}

interface FileKind {
  Icon: LucideIcon;
  label: string;
  tone: "archive" | "code" | "data" | "document" | "image" | "sheet" | "text";
}

const fileKindsByExtension: Record<string, FileKind> = {
  c: { Icon: FileCode2, label: "C", tone: "code" },
  cpp: { Icon: FileCode2, label: "C++", tone: "code" },
  cs: { Icon: FileCode2, label: "CS", tone: "code" },
  css: { Icon: Braces, label: "CSS", tone: "code" },
  csv: { Icon: FileSpreadsheet, label: "CSV", tone: "sheet" },
  doc: { Icon: FileText, label: "DOC", tone: "document" },
  docx: { Icon: FileText, label: "DOCX", tone: "document" },
  gif: { Icon: FileImage, label: "GIF", tone: "image" },
  go: { Icon: FileCode2, label: "GO", tone: "code" },
  gz: { Icon: FileArchive, label: "GZ", tone: "archive" },
  h: { Icon: FileCode2, label: "H", tone: "code" },
  html: { Icon: Braces, label: "HTML", tone: "code" },
  java: { Icon: FileCode2, label: "JAVA", tone: "code" },
  jpeg: { Icon: FileImage, label: "JPG", tone: "image" },
  jpg: { Icon: FileImage, label: "JPG", tone: "image" },
  js: { Icon: FileCode2, label: "JS", tone: "code" },
  json: { Icon: Braces, label: "JSON", tone: "data" },
  jsx: { Icon: FileCode2, label: "JSX", tone: "code" },
  md: { Icon: FileText, label: "MD", tone: "text" },
  pdf: { Icon: FileText, label: "PDF", tone: "document" },
  php: { Icon: FileCode2, label: "PHP", tone: "code" },
  png: { Icon: FileImage, label: "PNG", tone: "image" },
  py: { Icon: FileCode2, label: "PY", tone: "code" },
  rb: { Icon: FileCode2, label: "RB", tone: "code" },
  rs: { Icon: FileCode2, label: "RS", tone: "code" },
  sass: { Icon: Braces, label: "SASS", tone: "code" },
  scss: { Icon: Braces, label: "SCSS", tone: "code" },
  sh: { Icon: FileCode2, label: "SH", tone: "code" },
  swift: { Icon: FileCode2, label: "SWIFT", tone: "code" },
  tar: { Icon: FileArchive, label: "TAR", tone: "archive" },
  ts: { Icon: FileCode2, label: "TS", tone: "code" },
  tsx: { Icon: FileCode2, label: "TSX", tone: "code" },
  txt: { Icon: FileText, label: "TXT", tone: "text" },
  webp: { Icon: FileImage, label: "WEBP", tone: "image" },
  xls: { Icon: FileSpreadsheet, label: "XLS", tone: "sheet" },
  xlsx: { Icon: FileSpreadsheet, label: "XLSX", tone: "sheet" },
  xml: { Icon: Braces, label: "XML", tone: "data" },
  yaml: { Icon: Braces, label: "YAML", tone: "data" },
  yml: { Icon: Braces, label: "YAML", tone: "data" },
  zip: { Icon: FileArchive, label: "ZIP", tone: "archive" }
};

const namedFileKinds: Record<string, FileKind> = {
  dockerfile: { Icon: FileCode2, label: "DOCKER", tone: "code" },
  makefile: { Icon: FileCode2, label: "MAKE", tone: "code" },
  package: { Icon: Braces, label: "PKG", tone: "data" }
};

function getExtension(path: string) {
  const basename = getBasename(path).toLowerCase();
  if (basename.endsWith(".d.ts")) return "ts";
  return basename.includes(".") ? (basename.split(".").at(-1) ?? "") : "";
}

/** Renders a compact icon and extension badge for common file types. */
export function FileKindIcon({ path, variant = "badge" }: FileKindIconProps) {
  const basename = getBasename(path).toLowerCase();
  const kind =
    namedFileKinds[basename] ??
    namedFileKinds[basename.split(".")[0] ?? ""] ??
    fileKindsByExtension[getExtension(path)] ??
    ({ Icon: FileText, label: "FILE", tone: "text" } satisfies FileKind);
  const { Icon } = kind;
  if (variant === "header") {
    return (
      <span className="header-file-icon" data-kind={kind.tone} aria-hidden="true">
        <Icon size={16} strokeWidth={1.85} />
      </span>
    );
  }

  return (
    <span className="file-kind-icon" data-kind={kind.tone} aria-hidden="true">
      <Icon size={15} />
      <span>{kind.label}</span>
    </span>
  );
}
