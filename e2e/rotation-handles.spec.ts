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

const getDistance = (
  left: { x: number; y: number },
  right: { x: number; y: number }
) => Math.hypot(left.x - right.x, left.y - right.y);

const getRotatedTopLeft = async (locator: Locator) => {
  const state = await locator.evaluate((element) => {
    const x = Number.parseFloat(element.getAttribute("x") ?? "0");
    const y = Number.parseFloat(element.getAttribute("y") ?? "0");
    const transform = element.getAttribute("transform") ?? "";
    const match = transform.match(
      /rotate\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/
    );

    if (!match) {
      return { x, y };
    }

    const angle = (Number.parseFloat(match[1]) * Math.PI) / 180;
    const cx = Number.parseFloat(match[2]);
    const cy = Number.parseFloat(match[3]);
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  });

  return state;
};

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

async function rotateSelectedShape(
  page: Page,
  delta: { x: number; y: number },
  steps = 20
) {
  const handleBox = await getSelectedRotateHandleBox(page);
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const end = {
    x: start.x + delta.x,
    y: start.y + delta.y,
  };

  await dragFromTo(page, start, end, steps);
}

async function rotateSelectedShapeFromHandleOffset(
  page: Page,
  options: {
    startOffset: { x: number; y: number };
    delta: { x: number; y: number };
    steps?: number;
  }
) {
  const handleBox = await getSelectedRotateHandleBox(page);
  const start = {
    x: handleBox.x + options.startOffset.x,
    y: handleBox.y + options.startOffset.y,
  };
  const end = {
    x: start.x + options.delta.x,
    y: start.y + options.delta.y,
  };

  await dragFromTo(page, start, end, options.steps ?? 8);
}

async function getShapeRotation(locator: Locator) {
  return parseRotation(await locator.getAttribute("transform"));
}

async function zoomCanvas(page: Page, direction: "in" | "out", steps = 1) {
  const key = direction === "in" ? "=" : "-";

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
}

async function loadSnapshot(page: Page, snapshot: unknown) {
  const result = await page.evaluate((value) => {
    return window.__MAGINET_DEBUG__?.importSnapshot(value);
  }, snapshot);

  if (!result?.ok) {
    throw new Error(result?.error ?? "Could not import snapshot");
  }
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
    await dragFromTo(
      page,
      {
        x: handleBox.x + handleBox.width - 2,
        y: handleBox.y + handleBox.height / 2,
      },
      {
        x: handleBox.x + handleBox.width + 1,
        y: handleBox.y + handleBox.height / 2 + 2,
      },
      4
    );

    const rotation = parseRotation(await rectangle.getAttribute("transform"));
    expect(Math.abs(rotation)).toBeLessThan(4);
    await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();
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

    await rotateSelectedShape(page, { x: 48, y: 52 });

    const rotation = Math.abs(parseRotation(await textShape.getAttribute("transform")));
    expect(rotation).toBeGreaterThan(20);
    await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();

    const afterBox = await textShape.boundingBox();
    if (!afterBox) {
      throw new Error("Could not resolve text bounds after rotation");
    }
    const afterCenter = getCenter(afterBox);

    expect(Math.abs(afterCenter.x - beforeCenter.x)).toBeLessThan(3);
    expect(Math.abs(afterCenter.y - beforeCenter.y)).toBeLessThan(3);
  });

  test("short text keeps the rotation handle compact at normal zoom", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "REST");
    await selectShape(page, textShape);

    const shapeBox = await textShape.boundingBox();
    if (!shapeBox) {
      throw new Error("Could not resolve short text bounds");
    }

    const selectionCenter = getCenter(shapeBox);
    const handleCenter = getCenter(await getSelectedRotateHandleBox(page));

    expect(getDistance(selectionCenter, handleCenter)).toBeLessThan(60);
  });

  test("zoomed-in tiny text snapshot keeps the rotation handle reachable", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    await loadSnapshot(page, {
      kind: "maginet/debug-snapshot",
      version: 1,
      capturedAt: 1772901935832,
      deckParam: "",
      cardState: {
        cards: [],
        deck: [],
        lastAction: "INITIALIZE_DECK",
        actionId: 1,
      },
      shapes: [
        {
          id: "tiny-zoomed-text",
          point: [705.3166885802326, 352.17952587201927],
          size: [11, 12],
          type: "text",
          text: "jjjj",
          srcIndex: 0,
          rotation: 5.206899326361224,
          fontSize: 1.4703322738845992,
        },
      ],
      selectedShapeIds: ["tiny-zoomed-text"],
      editingText: null,
      camera: {
        x: -622.68,
        y: -315.55999999999983,
        z: 10,
      },
      mode: "select",
      shapeType: "text",
      isSnapEnabled: false,
      showCounterControls: false,
      selectedHandCardId: null,
      connectedPeerIds: [],
      meta: {},
    });

    const textShape = page.locator('[data-shape-id="tiny-zoomed-text"]');
    await expect(textShape).toBeVisible();

    const shapeBox = await textShape.boundingBox();
    if (!shapeBox) {
      throw new Error("Could not resolve zoomed-in tiny text bounds");
    }

    const selectionCenter = getCenter(shapeBox);
    const handleCenter = getCenter(await getSelectedRotateHandleBox(page));

    expect(getDistance(selectionCenter, handleCenter)).toBeLessThan(120);
  });

  test("text rotation stays continuous across repeated off-center re-grabs", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "SOME TEXT");
    await selectShape(page, textShape);
    await rotateSelectedShape(page, { x: 48, y: 52 });
    await expect(page.locator('[data-selection-handle="rotate"]').first()).toBeVisible();

    const initialBox = await textShape.boundingBox();
    if (!initialBox) {
      throw new Error("Could not resolve text bounds before repeated drags");
    }
    const initialCenter = getCenter(initialBox);
    let previousRotation = parseRotation(await textShape.getAttribute("transform"));

    const regrabs = [
      {
        startOffset: { x: 14, y: 8 },
        delta: { x: 10, y: 7 },
      },
      {
        startOffset: { x: 2, y: 9 },
        delta: { x: -10, y: -7 },
      },
      {
        startOffset: { x: 8, y: 2 },
        delta: { x: 9, y: 8 },
      },
      {
        startOffset: { x: 8, y: 14 },
        delta: { x: -9, y: -8 },
      },
    ];

    for (const [index, regrab] of regrabs.entries()) {
      await rotateSelectedShapeFromHandleOffset(page, regrab);

      const rotation = parseRotation(await textShape.getAttribute("transform"));
      const box = await textShape.boundingBox();
      if (!box) {
        throw new Error("Could not resolve text bounds after repeated drag");
      }
      const center = getCenter(box);
      const handleCount = await page.locator('[data-selection-handle="rotate"]').count();

      if (handleCount === 0) {
        throw new Error(
          `Lost selection after re-grab ${index + 1}: rotation=${rotation}, center=(${center.x},${center.y})`
        );
      }

      expect(Math.abs(rotation - previousRotation)).toBeLessThan(12);
      expect(Math.abs(center.x - initialCenter.x)).toBeLessThan(3);
      expect(Math.abs(center.y - initialCenter.y)).toBeLessThan(3);

      previousRotation = rotation;
    }
  });

  test("long rotated text does not overreact to small follow-up handle drags", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "SOME TEsqjsjsXfd fddsdqT");
    await selectShape(page, textShape);
    await rotateSelectedShape(page, { x: 48, y: 52 });

    const regrabs = [
      {
        startOffset: { x: 4, y: 4 },
        delta: { x: 8, y: 8 },
      },
      {
        startOffset: { x: 12, y: 4 },
        delta: { x: 8, y: 8 },
      },
      {
        startOffset: { x: 4, y: 12 },
        delta: { x: -8, y: -8 },
      },
      {
        startOffset: { x: 12, y: 12 },
        delta: { x: -8, y: -8 },
      },
      {
        startOffset: { x: 8, y: 8 },
        delta: { x: -4, y: -12 },
      },
      {
        startOffset: { x: 8, y: 8 },
        delta: { x: 4, y: 12 },
      },
    ];

    let previousRotation = await getShapeRotation(textShape);

    for (const regrab of regrabs) {
      await rotateSelectedShapeFromHandleOffset(page, regrab);
      const rotation = await getShapeRotation(textShape);

      expect(Math.abs(rotation - previousRotation)).toBeLessThan(12);
      previousRotation = rotation;
    }
  });

  test("zoomed-out long text keeps small follow-up handle drags stable", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "SOME TEsqjsjsXfd fddsdqT");
    await selectShape(page, textShape);
    await zoomCanvas(page, "out", 6);
    await rotateSelectedShape(page, { x: 48, y: 52 });

    const regrabs = [
      {
        startOffset: { x: 4, y: 4 },
        delta: { x: 8, y: 8 },
      },
      {
        startOffset: { x: 12, y: 4 },
        delta: { x: 8, y: 8 },
      },
      {
        startOffset: { x: 4, y: 12 },
        delta: { x: -8, y: -8 },
      },
      {
        startOffset: { x: 12, y: 12 },
        delta: { x: -8, y: -8 },
      },
      {
        startOffset: { x: 8, y: 8 },
        delta: { x: -4, y: -12 },
      },
      {
        startOffset: { x: 8, y: 8 },
        delta: { x: 4, y: 12 },
      },
    ];

    let previousRotation = await getShapeRotation(textShape);

    for (const regrab of regrabs) {
      await rotateSelectedShapeFromHandleOffset(page, regrab);
      const rotation = await getShapeRotation(textShape);

      expect(Math.abs(rotation - previousRotation)).toBeLessThan(5.5);
      previousRotation = rotation;
    }
  });

  test("editing rotated text keeps the current rotation", async ({ page }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "ROTATED");
    await selectShape(page, textShape);
    await rotateSelectedShape(page, { x: 42, y: 46 });

    const displayRotation = parseRotation(await textShape.getAttribute("transform"));
    expect(Math.abs(displayRotation)).toBeGreaterThan(20);

    await textShape.dblclick();

    const editingShape = page.locator('[data-editing-shape-type="text"]').first();
    await expect(editingShape).toBeVisible();
    await expect(page.locator('[data-editing-textarea="true"]').first()).toBeVisible();

    const editingRotation = parseRotation(await editingShape.getAttribute("transform"));
    expect(Math.abs(editingRotation - displayRotation)).toBeLessThan(1);
  });

  test("typing into rotated text keeps its rotated origin stable", async ({
    page,
  }) => {
    await enterTable(page);
    await hideShortcutsIfVisible(page);

    const textShape = await createText(page, "TEXT");
    await selectShape(page, textShape);
    await rotateSelectedShape(page, { x: 46, y: 50 });

    await textShape.dblclick();

    const editingShape = page.locator('[data-editing-shape-type="text"]').first();
    const textarea = page.locator('[data-editing-textarea="true"]').first();
    await expect(editingShape).toBeVisible();
    await expect(textarea).toBeVisible();

    const beforeTopLeft = await getRotatedTopLeft(editingShape);
    await textarea.type(" MORE");
    const afterTopLeft = await getRotatedTopLeft(editingShape);

    expect(Math.abs(afterTopLeft.x - beforeTopLeft.x)).toBeLessThan(1);
    expect(Math.abs(afterTopLeft.y - beforeTopLeft.y)).toBeLessThan(1);
  });
});
