import { expect, type Locator, type Page, test } from "@playwright/test";
import { enterTable } from "./utils/table";

const parseRotation = (transform: string | null) => {
  if (!transform) return 0;
  const match = transform.match(/rotate\(([-\d.]+)/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : 0;
};

const getCenter = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

async function hideShortcutsIfVisible(page: Page) {
  const hideShortcutsButton = page
    .getByRole("button", { name: "Hide shortcuts" })
    .first();

  if (await hideShortcutsButton.isVisible().catch(() => false)) {
    await hideShortcutsButton.click();
  }
}

async function dragFromTo(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps = 12
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

async function createRectangle(page: Page) {
  await page.locator('.shape-type-option[title="Rectangle"]').click();

  const canvas = page.locator("svg.canvas-surface");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Could not resolve canvas bounds");
  }

  const start = {
    x: canvasBox.x + canvasBox.width * 0.44,
    y: canvasBox.y + canvasBox.height * 0.34,
  };
  const end = {
    x: start.x + 140,
    y: start.y + 90,
  };

  await dragFromTo(page, start, end);

  const rectangle = page.locator('[data-shape-type="rectangle"]').last();
  await expect(rectangle).toBeVisible();
  return rectangle;
}

async function createText(page: Page, text: string) {
  await page.locator('.shape-type-option[title="Text"]').click();

  const canvas = page.locator("svg.canvas-surface");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Could not resolve canvas bounds");
  }

  const point = {
    x: canvasBox.x + canvasBox.width * 0.58,
    y: canvasBox.y + canvasBox.height * 0.33,
  };

  await page.mouse.click(point.x, point.y);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");

  const textShape = page.locator('[data-shape-type="text"]').last();
  await expect(textShape).toBeVisible();
  return textShape;
}

async function selectShape(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Could not resolve shape bounds");
  }

  const target = {
    x: box.x + box.width / 2,
    y: box.y + Math.min(3, Math.max(1, box.height / 8)),
  };
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();
}

async function getSelectedRotateHandleBox(page: Page) {
  const handle = page.locator('[data-selection-handle="rotate"]').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Could not resolve rotation handle bounds");
  }
  return box;
}

test.describe("Rotation handles", () => {
  test("rectangle rotation starts smoothly from an off-center grab", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const rectangle = await createRectangle(page);
    await selectShape(page, rectangle);

    const handleBox = await getSelectedRotateHandleBox(page);
    const start = {
      x: handleBox.x + handleBox.width - 2,
      y: handleBox.y + handleBox.height / 2,
    };
    const end = {
      x: start.x + 3,
      y: start.y + 2,
    };

    await dragFromTo(page, start, end, 4);

    const rotation = parseRotation(await rectangle.getAttribute("transform"));
    expect(Math.abs(rotation)).toBeLessThan(4);
  });

  test("text rotation keeps the text centered while rotating", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "SOME TEXT");
    await selectShape(page, textShape);

    const beforeBox = await textShape.boundingBox();
    if (!beforeBox) {
      throw new Error("Could not resolve text bounds before rotation");
    }
    const beforeCenter = getCenter(beforeBox);

    const handleBox = await getSelectedRotateHandleBox(page);
    const start = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    const end = {
      x: start.x + 48,
      y: start.y + 52,
    };

    await dragFromTo(page, start, end, 20);

    const rotation = Math.abs(parseRotation(await textShape.getAttribute("transform")));
    expect(rotation).toBeGreaterThan(20);

    const afterBox = await textShape.boundingBox();
    if (!afterBox) {
      throw new Error("Could not resolve text bounds after rotation");
    }
    const afterCenter = getCenter(afterBox);

    expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(3);
    expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(3);
  });
});
