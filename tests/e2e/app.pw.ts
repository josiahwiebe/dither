import { expect, test } from "@playwright/test";

test("loads the Dither shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: "Dither" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Original source" }).getByRole("button", { name: "Open" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Changed source" }).getByRole("button", { name: "Open" })).toBeVisible();
  await expect(page.getByText("Local file and directory diffs")).toHaveCount(0);
  await expect(page.getByText("Start a comparison")).toBeVisible();
});
