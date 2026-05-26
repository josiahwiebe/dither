import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extractDocxText, isDocxPath } from "../../src/lib/docx";

function minimalDocxBytes(documentXml: string) {
  return zipSync({
    "word/document.xml": new TextEncoder().encode(documentXml)
  });
}

describe("docx extraction", () => {
  it("recognizes modern Word documents by extension", () => {
    expect(isDocxPath("contract.docx")).toBe(true);
    expect(isDocxPath("contract.doc")).toBe(false);
  });

  it("extracts paragraph text from word/document.xml", () => {
    const bytes = minimalDocxBytes(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
          <w:p><w:r><w:t>World</w:t></w:r></w:p>
        </w:body>
      </w:document>`);

    expect(extractDocxText(bytes)).toBe("Hello\nWorld");
  });

  it("preserves spaces between Word text runs without importing XML indentation", () => {
    const bytes = minimalDocxBytes(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r><w:t>You will not</w:t></w:r>
            <w:r><w:t xml:space="preserve"> violate</w:t></w:r>
            <w:r><w:t xml:space="preserve"> any third party rights</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`);

    expect(extractDocxText(bytes)).toBe("You will not violate any third party rights");
  });
});
