import { expect, type Locator, type Page, test } from "@playwright/test";
import { enterTable } from "./utils/table";

async function hideShortcutsIfVisible(page: Page) {
  const hideShortcutsButton = page
    .getByRole("button", { name: "Hide shortcuts" })
    .first();

  if (await hideShortcutsButton.isVisible().catch(() => false)) {
    await hideShortcutsButton.click();
  }
}

async function createText(page: Page, text: string) {
  await page.locator('.shape-type-option[title="Text"]').click();

  const canvas = page.locator("svg.canvas-surface");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Could not resolve canvas bounds");
  }

  await page.mouse.click(
    canvasBox.x + canvasBox.width * 0.55,
    canvasBox.y + canvasBox.height * 0.36
  );
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");

  const textShape = page.locator('[data-shape-type="text"]').last();
  await expect(textShape).toBeVisible();
  return textShape;
}

async function selectShape(
  page: Page,
  locator: Locator
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not resolve shape bounds");
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function zoomCanvas(
  page: Page,
  direction: "in" | "out",
  steps = 1
) {
  const key = direction === "in" ? "=" : "-";

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
}

test.describe("Canvas controls", () => {
  test("can switch tools and toggle snap/help controls", async ({ page }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const selectTool = page.locator("input#select");
    const textTool = page.locator("input#create");
    const rectangleTool = page.locator("input#rectangle");

    await expect(selectTool).toBeChecked();

    await page.locator('.shape-type-option[title="Text"]').click();
    await expect(textTool).toBeChecked();

    await page.locator('.shape-type-option[title="Rectangle"]').click();
    await expect(rectangleTool).toBeChecked();

    await page.locator('.shape-type-option[title="Select / Move"]').click();
    await expect(selectTool).toBeChecked();

    const snapButton = page.getByRole("button", { name: "Snap", exact: true });

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

  test("can export and restore a bug snapshot", async ({ page }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "REST");
    await selectShape(page, textShape);
    await zoomCanvas(page, "out", 2);
    await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();

    await page.getByRole("button", { name: "Snapshot" }).click();
    const snapshotField = page.getByLabel("Snapshot JSON");
    await expect(snapshotField).toBeVisible();
    await expect(snapshotField).toHaveValue(/"kind": "maginet\/debug-snapshot"/);
    const snapshotText = await snapshotField.inputValue();
    const initialSnapshot = JSON.parse(snapshotText) as {
      camera: { z: number };
      selectedShapeIds: string[];
      shapes: Array<{ text?: string }>;
    };
    await page.getByRole("button", { name: "Close modal" }).click();

    const canvas = page.locator("svg.canvas-surface");
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
      throw new Error("Could not resolve canvas bounds");
    }

    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.2,
      canvasBox.y + canvasBox.height * 0.82
    );
    await zoomCanvas(page, "in", 1);

    const changedSnapshot = await page.evaluate(() =>
      window.__MAGINET_DEBUG__?.exportSnapshot()
    );
    expect(changedSnapshot?.selectedShapeIds).toEqual([]);
    expect(changedSnapshot?.camera.z).not.toBe(initialSnapshot.camera.z);

    await page.getByRole("button", { name: "Snapshot" }).click();
    await snapshotField.fill(snapshotText);
    await page.getByRole("button", { name: "Load Snapshot" }).click();

    await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();

    const restoredSnapshot = await page.evaluate(() =>
      window.__MAGINET_DEBUG__?.exportSnapshot()
    );

    expect(restoredSnapshot?.camera.z).toBe(initialSnapshot.camera.z);
    expect(restoredSnapshot?.selectedShapeIds).toEqual(initialSnapshot.selectedShapeIds);
    expect(restoredSnapshot?.shapes.at(-1)?.text).toBe(
      initialSnapshot.shapes.at(-1)?.text
    );
  });
});
