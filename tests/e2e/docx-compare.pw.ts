import { expect, test, type Page } from "@playwright/test";
import { zipSync } from "fflate";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function pickSourcePair(page: Page, leftFile: string, rightFile: string) {
  const leftChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open" }).click();
  await (await leftChooserPromise).setFiles(leftFile);

  const rightChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add changed" }).click();
  await (await rightChooserPromise).setFiles(rightFile);
}

function minimalDocxBytes(lines: string[]) {
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("");

  return zipSync({
    "word/document.xml": new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>${paragraphs}</w:body>
      </w:document>`)
  });
}

test("compares two browser-local docx files as text", async ({ page }, testInfo) => {
  const leftFile = testInfo.outputPath("left-doc.docx");
  const rightFile = testInfo.outputPath("right-doc.docx");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, minimalDocxBytes(["Clause one", "Clause two"]));
  await writeFile(rightFile, minimalDocxBytes(["Clause one", "Clause two changed"]));

  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Binary files are compared by bytes and metadata in v1.")).toHaveCount(0);
  await expect(page.getByText("Clause two changed")).toBeVisible();
});

test("counts docx change blocks inside a single hunk", async ({ page }, testInfo) => {
  const leftFile = testInfo.outputPath("left-doc-blocks.docx");
  const rightFile = testInfo.outputPath("right-doc-blocks.docx");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, minimalDocxBytes(["One", "Two old", "Three", "Four old", "Five"]));
  await writeFile(rightFile, minimalDocxBytes(["One", "Two new", "Three", "Four new", "Five"]));

  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.getByText("Change set 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous change" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next change" })).toBeEnabled();

  await page.getByRole("button", { name: "Next change" }).click();
  await expect(page.getByText("Change set 2 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next change" })).toBeDisabled();
});
