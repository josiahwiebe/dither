import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";

export { isDocxPath } from "./fileKind";

const documentXmlPaths = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"] as const;
const textNodeKey = "#text";
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  preserveOrder: true,
  textNodeName: textNodeKey,
  trimValues: false
});
type XmlNode = Record<string, unknown>;

/** Extracts readable body, header, footer, footnote, and endnote text from DOCX bytes. */
export function extractDocxText(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new Error(error instanceof Error ? `Unable to open DOCX zip: ${error.message}` : "Unable to open DOCX zip.");
  }

  const xmlPaths = [
    ...documentXmlPaths,
    ...Object.keys(files)
      .filter((path) => /^word\/header\d+\.xml$/i.test(path) || /^word\/footer\d+\.xml$/i.test(path))
      .sort()
  ];
  const sections = xmlPaths
    .map((path) => files[path])
    .filter((file): file is Uint8Array => Boolean(file))
    .map((file) => extractTextFromWordXml(strFromU8(file)))
    .filter(Boolean);

  if (sections.length === 0) {
    throw new Error("DOCX did not contain readable document text.");
  }

  return sections.join("\n\n").trimEnd();
}

function extractTextFromWordXml(xml: string) {
  const parsed = xmlParser.parse(xml) as XmlNode[];
  return collectParagraphs(parsed)
    .map((paragraph) => extractParagraphText(paragraph))
    .filter((line) => line.length > 0)
    .join("\n");
}

function collectParagraphs(nodes: XmlNode[]) {
  const paragraphs: XmlNode[][] = [];

  for (const node of nodes) {
    for (const [tagName, value] of Object.entries(node)) {
      if (tagName === textNodeKey) continue;

      if (localName(tagName) === "p" && Array.isArray(value)) {
        paragraphs.push(value as XmlNode[]);
        continue;
      }

      if (Array.isArray(value)) {
        paragraphs.push(...collectParagraphs(value as XmlNode[]));
      }
    }
  }

  return paragraphs;
}

function extractParagraphText(paragraph: XmlNode[]) {
  return collectText(paragraph).trimEnd();
}

function collectText(nodes: XmlNode[]) {
  let text = "";

  for (const node of nodes) {
    for (const [tagName, value] of Object.entries(node)) {
      if (tagName === textNodeKey) continue;

      const name = localName(tagName);
      if (name === "t" || name === "delText") {
        text += readRawTextValue(value);
        continue;
      }

      if (name === "tab") {
        text += "\t";
        continue;
      }

      if (name === "br" || name === "cr") {
        text += "\n";
        continue;
      }

      if (Array.isArray(value)) {
        text += collectText(value as XmlNode[]);
      }
    }
  }

  return text;
}

function readRawTextValue(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  let text = "";
  for (const node of value as XmlNode[]) {
    if (typeof node[textNodeKey] === "string") {
      text += node[textNodeKey];
    }
  }

  return text;
}

function localName(tagName: string) {
  return tagName.includes(":") ? tagName.split(":").at(-1) ?? tagName : tagName;
}
