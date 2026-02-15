import { expect, test } from "@playwright/test";
import { enterTable } from "./utils/table";

test.describe("Canvas controls", () => {
  test("can switch tools and toggle grid/snap/help controls", async ({ page }) => {
    await enterTable(page);
    const hideShortcutsButton = page
      .getByRole("button", { name: "Hide shortcuts" })
      .first();
    if (await hideShortcutsButton.isVisible().catch(() => false)) {
      await hideShortcutsButton.click();
    }

    const selectTool = page.locator("input#select");
    const textTool = page.locator("input#create");
    const tokenTool = page.locator("input#add");
    const rectangleTool = page.locator("input#rectangle");

    await expect(selectTool).toBeChecked();

    await page.locator('.shape-type-option[title="Text"]').click();
    await expect(textTool).toBeChecked();

    await page.locator('.shape-type-option[title="Token"]').click();
    await expect(tokenTool).toBeChecked();

    await page.locator('.shape-type-option[title="Rectangle"]').click();
    await expect(rectangleTool).toBeChecked();

    await page.locator('.shape-type-option[title="Select / Move"]').click();
    await expect(selectTool).toBeChecked();

    const gridButton = page.getByRole("button", { name: "Grid" });
    const snapButton = page.getByRole("button", { name: "Snap" });

    await gridButton.click();
    await expect(gridButton).toHaveClass(/is-active/);
    await gridButton.click();
    await expect(gridButton).not.toHaveClass(/is-active/);

    await snapButton.click();
    await expect(snapButton).toHaveClass(/is-active/);
    await snapButton.click();
    await expect(snapButton).not.toHaveClass(/is-active/);

    const helpButton = page.locator("button.help-button:visible").first();
    await helpButton.click();
    await expect(page.locator(".help-dialog")).toBeVisible();

    await page.getByRole("button", { name: "Close help" }).click();
    await expect(page.locator(".help-dialog")).toBeHidden();
  });
});
