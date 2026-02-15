import { expect, type Locator, type Page } from "@playwright/test";

export const TABLE_URL = "/?deck=8%20Island";

type CanvasCardPosition = {
  x: number;
  y: number;
  transform: string | null;
};

const parseRotation = (transform: string | null) => {
  if (!transform) return 0;
  const match = transform.match(/rotate\(([-\d.]+)/);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? Math.round(value) : 0;
};

export const waitForPeerId = async (page: Page) => {
  const peerIdValue = page.locator(".peer-id-inline__value").first();
  await expect(peerIdValue).toBeVisible();
  await expect(peerIdValue).not.toHaveText(/waiting\.\.\./, {
    timeout: 20_000,
  });
  const peerId = (await peerIdValue.textContent())?.trim();
  if (!peerId) {
    throw new Error("Expected a generated peer ID, but none was found");
  }
  return peerId;
};

export const waitForDeckReady = async (page: Page, minimumCount = 1) => {
  await expect
    .poll(async () => {
      const deckCountText = await page
        .locator(".deck-count")
        .first()
        .textContent()
        .catch(() => null);
      if (!deckCountText) return -1;
      const parsed = Number.parseInt(deckCountText, 10);
      return Number.isFinite(parsed) ? parsed : -1;
    }, {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(minimumCount);
};

export const enterTable = async (page: Page) => {
  await page.goto(TABLE_URL, { waitUntil: "domcontentloaded" });

  const enterTableButton = page.getByRole("button", { name: "Enter table" });
  const shouldEnterTable = await enterTableButton
    .isVisible({ timeout: 2_500 })
    .catch(() => false);
  if (shouldEnterTable) {
    await enterTableButton.click();
  }

  await expect(page.locator(".selection-panel")).toBeVisible();
  await expect(page.locator(".deck-draw-button")).toBeVisible();
  await waitForDeckReady(page, 1);
  await waitForPeerId(page);
};

export const openConnectModal = async (page: Page) => {
  await page
    .locator(".selection-panel__group--top-left")
    .getByRole("button", { name: "Connect" })
    .click();
  await expect(page.locator(".peer-connect-modal")).toBeVisible();
};

export const connectToPeer = async (page: Page, peerId: string) => {
  await openConnectModal(page);
  await page.getByPlaceholder("Friend's peer ID").fill(peerId);
  await page
    .locator(".peer-connect-modal")
    .getByRole("button", { name: "Connect" })
    .click();
  await expect(page.locator(".peer-connect-modal")).toBeHidden();
};

export const getDeckCount = async (page: Page) => {
  const deckCountText = await page.locator(".deck-count").first().innerText();
  const count = Number.parseInt(deckCountText, 10);
  if (!Number.isFinite(count)) {
    throw new Error(`Invalid deck count text: '${deckCountText}'`);
  }
  return count;
};

export const drawCard = async (page: Page) => {
  await page.locator(".deck-draw-button").click();
};

export const dragLocatorToPoint = async (
  page: Page,
  locator: Locator,
  target: { x: number; y: number }
) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Failed to resolve locator bounding box for drag");
  }

  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
};

export const playFirstHandCardToCanvas = async (
  page: Page,
  canvasTarget?: { x: number; y: number }
) => {
  const handCard = page.locator(".hand-card").first();
  await expect(handCard).toBeVisible();

  const canvasBox = await page.locator("svg.canvas-surface").boundingBox();
  if (!canvasBox) {
    throw new Error("Could not resolve canvas bounds");
  }

  const target = canvasTarget ?? {
    x: canvasBox.x + canvasBox.width * 0.62,
    y: canvasBox.y + canvasBox.height * 0.58,
  };

  const handCountBefore = await page.locator(".hand-card").count();
  await dragLocatorToPoint(page, handCard, target);

  await expect
    .poll(() => page.locator(".hand-card").count(), {
      timeout: 10_000,
    })
    .toBe(Math.max(0, handCountBefore - 1));
  await expect(page.locator("image.card-image").first()).toBeVisible();
};

export const getCanvasCardPositions = async (page: Page) => {
  return page
    .locator("image.card-image")
    .evaluateAll<CanvasCardPosition[]>((elements) =>
      elements.map((element) => ({
        x: Number.parseFloat(element.getAttribute("x") ?? "0"),
        y: Number.parseFloat(element.getAttribute("y") ?? "0"),
        transform: element.getAttribute("transform"),
      }))
    );
};

export const getFirstCanvasCardPosition = async (page: Page) => {
  const positions = await getCanvasCardPositions(page);
  if (positions.length === 0) {
    throw new Error("No canvas cards found");
  }
  return positions[0];
};

export const getFirstCanvasCardRotation = async (page: Page) => {
  const firstCard = page.locator("image.card-image").first();
  await expect(firstCard).toBeVisible();
  const transform = await firstCard.getAttribute("transform");
  return parseRotation(transform);
};

export const clickFirstCanvasCard = async (page: Page) => {
  const firstCard = page.locator("image.card-image").first();
  await expect(firstCard).toBeVisible();
  const box = await firstCard.boundingBox();
  if (!box) {
    throw new Error("Could not resolve first canvas card bounds");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

export const dragFirstCanvasCardBy = async (
  page: Page,
  delta: { x: number; y: number }
) => {
  const firstCard = page.locator("image.card-image").first();
  await expect(firstCard).toBeVisible();
  const box = await firstCard.boundingBox();
  if (!box) {
    throw new Error("Could not resolve first canvas card bounds");
  }
  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  const target = {
    x: start.x + delta.x,
    y: start.y + delta.y,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
};
