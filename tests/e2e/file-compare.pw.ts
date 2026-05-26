import { expect, test, type Page } from "@playwright/test";
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

test("compares two browser-local text files", async ({ page }, testInfo) => {
  const leftFile = testInfo.outputPath("left-note.txt");
  const rightFile = testInfo.outputPath("right-note.txt");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, "alpha\nbravo\ncharlie\n");
  await writeFile(rightFile, "alpha\nbravo changed\ncharlie\n");

  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Modified")).toBeVisible();
  await expect(page.getByText("bravo changed")).toBeVisible();
});

test("supports header controls and custom diff headers", async ({ page }, testInfo) => {
  const leftFile = testInfo.outputPath("controls-left.tsx");
  const rightFile = testInfo.outputPath("controls-right.tsx");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, "export function Demo() {\n  return <span>old</span>;\n}\n");
  await writeFile(rightFile, "export function Demo() {\n  return <span>new</span>;\n}\n");
  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.locator(".top-bar").getByText("controls-left.tsx / controls-right.tsx")).toBeVisible();
  await expect(page.getByText("1 additions")).toBeVisible();
  await expect(page.getByText("1 deletions")).toBeVisible();
  await expect(page.getByText("2 changes")).toBeVisible();
  await expect(page.getByText("Change 1 of 2")).toBeVisible();
  await expect(page.getByText("TSX").first()).toBeVisible();

  await page.getByRole("button", { name: "Next change" }).click();
  await expect(page.getByText("Change 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next change" }).click();
  await expect(page.getByText("Change 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Unified diff" }).click();
  await expect(page.getByRole("button", { name: "Unified diff" })).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.locator("diffs-container").evaluate((host) => {
        const pre = host.shadowRoot?.querySelector("pre");
        return pre?.getAttribute("data-diff-type");
      })
    )
    .toBe("single");

  await page.getByRole("button", { name: "Show unchanged lines" }).click();
  await expect(page.getByRole("button", { name: "Collapse unchanged lines" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Swap comparison sides" }).click();
  await expect(page.locator(".top-bar").getByText("controls-right.tsx / controls-left.tsx")).toBeVisible();
  await expect(page.getByRole("region", { name: "Original source" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Changed source" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reset comparison" }).click();
  await expect(page.getByRole("region", { name: "Original source" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Changed source" })).toHaveCount(0);
  await expect(page.getByText("Drop files here")).toBeVisible();
  await expect(page.getByText("Start a comparison")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open" })).toHaveCount(1);
});

test("loads a dropped browser file pair", async ({ page }) => {
  await page.goto("/");

  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["alpha\nbravo\ncharlie\n"], "drop-left.txt", { type: "text/plain" }));
    transfer.items.add(new File(["alpha\nbravo dropped\ncharlie\n"], "drop-right.txt", { type: "text/plain" }));
    return transfer;
  });

  await page.locator(".app-shell").dispatchEvent("dragenter", { dataTransfer });
  await expect(page.getByText("Drop to compare")).toBeVisible();
  const overlayBox = await page.locator(".drop-overlay").boundingBox();
  const viewport = page.viewportSize();
  expect(overlayBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.round(overlayBox?.x ?? -1)).toBe(12);
  expect(Math.round(overlayBox?.y ?? -1)).toBe(12);
  expect(Math.round(overlayBox?.width ?? -1)).toBe((viewport?.width ?? 0) - 24);
  expect(Math.round(overlayBox?.height ?? -1)).toBe((viewport?.height ?? 0) - 24);

  await page.locator(".app-shell").dispatchEvent("drop", { dataTransfer });
  await expect(page.locator(".top-bar").getByText("drop-left.txt / drop-right.txt")).toBeVisible();
  await expect(page.getByRole("region", { name: "Original source" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Changed source" })).toHaveCount(0);

  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("bravo dropped")).toBeVisible();
});

test("compares after two separate browser file drops", async ({ page }) => {
  await page.goto("/");

  const leftTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["one\ntwo\nthree\n"], "first-drop.txt", { type: "text/plain" }));
    return transfer;
  });
  const rightTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["one\ntwo separately dropped\nthree\n"], "second-drop.txt", { type: "text/plain" }));
    return transfer;
  });

  await page.locator(".app-shell").dispatchEvent("dragenter", { clientX: 120, dataTransfer: leftTransfer });
  await expect(page.getByText("Drop to set Original")).toBeVisible();
  const leftOverlayBox = await page.locator(".drop-overlay").boundingBox();
  const viewport = page.viewportSize();
  expect(leftOverlayBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.round(leftOverlayBox?.x ?? -1)).toBe(12);
  expect(Math.round(leftOverlayBox?.width ?? -1)).toBe(Math.round((viewport?.width ?? 0) / 2 - 16));

  await page.locator(".app-shell").dispatchEvent("drop", { clientX: 120, dataTransfer: leftTransfer });
  await expect(page.getByText("first-drop.txt is ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add changed" })).toBeVisible();

  await page.locator(".app-shell").dispatchEvent("dragenter", { clientX: 900, dataTransfer: rightTransfer });
  await expect(page.getByText("Drop to set Changed")).toBeVisible();
  const rightOverlayBox = await page.locator(".drop-overlay").boundingBox();
  expect(rightOverlayBox).not.toBeNull();
  expect(Math.round(rightOverlayBox?.x ?? -1)).toBe(Math.round((viewport?.width ?? 0) / 2 + 4));

  await page.locator(".app-shell").dispatchEvent("drop", { clientX: 900, dataTransfer: rightTransfer });
  await expect(page.locator(".top-bar").getByText("first-drop.txt / second-drop.txt")).toBeVisible();
  await expect(page.getByRole("region", { name: "Original source" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Changed source" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("two separately dropped")).toBeVisible();
});

test("keeps the source picker row removed and scrolls long diffs", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 360 });

  const leftFile = testInfo.outputPath("long-left.txt");
  const rightFile = testInfo.outputPath("long-right.txt");
  const leftText = Array.from({ length: 180 }, (_, index) => `left line ${index + 1}`).join("\n");
  const rightText = Array.from({ length: 180 }, (_, index) => `right line ${index + 1}`).join("\n");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, leftText);
  await writeFile(rightFile, rightText);
  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.getByText("Modified")).toBeVisible();
  await expect(page.locator("diffs-container")).toBeVisible();
  await expect(page.getByRole("region", { name: "Original source" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Changed source" })).toHaveCount(0);

  await expect
    .poll(() =>
      page.locator(".diff-virtualizer").evaluate((element) => element.scrollHeight > element.clientHeight)
    )
    .toBe(true);
  await page.locator(".diff-virtualizer").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => page.locator(".diff-virtualizer").evaluate((element) => element.scrollTop)).toBe(0);

  await page.locator(".diff-virtualizer").hover();
  await page.mouse.wheel(0, 600);

  await expect
    .poll(() => page.locator(".diff-virtualizer").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});

test("renders the diff viewer with the app dark theme", async ({ page }, testInfo) => {
  const leftFile = testInfo.outputPath("dark-left.txt");
  const rightFile = testInfo.outputPath("dark-right.txt");

  await mkdir(dirname(leftFile), { recursive: true });
  await writeFile(leftFile, "one\ntwo\nthree\n");
  await writeFile(rightFile, "one\ntwo changed\nthree\n");
  await page.addInitScript(() => localStorage.setItem("dither.theme", "light"));
  await page.goto("/");
  await pickSourcePair(page, leftFile, rightFile);

  await expect(page.getByText("two changed")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() => page.locator("diffs-container").evaluate((host) => getComputedStyle(host).colorScheme))
    .toBe("dark");

  const diffTheme = await page.locator("diffs-container").evaluate((host) => {
    const shadowRoot = host.shadowRoot;
    const style = getComputedStyle(host);
    const renderedBackground = shadowRoot?.querySelector("pre")
      ? getComputedStyle(shadowRoot.querySelector("pre") as Element).backgroundColor
      : null;

    return {
      colorScheme: style.colorScheme,
      renderedBackground,
      rootTheme: document.documentElement.dataset.theme
    };
  });

  expect(diffTheme).toMatchObject({
    colorScheme: "dark",
    rootTheme: "dark"
  });
  expect(diffTheme.renderedBackground).not.toBe("rgb(255, 255, 255)");
});
