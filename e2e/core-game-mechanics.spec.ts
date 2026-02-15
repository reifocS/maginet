import { expect, test } from "@playwright/test";
import {
  clickFirstCanvasCard,
  drawCard,
  enterTable,
  getDeckCount,
  getFirstCanvasCardRotation,
  playFirstHandCardToCanvas,
} from "./utils/table";

test.describe("Core game mechanics", () => {
  test("supports draw, mulligan, play-to-canvas, tap/untap, and delete", async ({
    page,
  }) => {
    await enterTable(page);

    const deckCountBeforeDraw = await getDeckCount(page);
    await drawCard(page);
    await expect(page.locator(".hand-card")).toHaveCount(1);
    await expect.poll(() => getDeckCount(page)).toBe(deckCountBeforeDraw - 1);

    await page.getByRole("button", { name: "Mulligan" }).click();
    await expect(page.locator(".hand-card")).toHaveCount(0);
    await expect.poll(() => getDeckCount(page)).toBe(deckCountBeforeDraw);

    await drawCard(page);
    await expect(page.locator(".hand-card")).toHaveCount(1);

    await playFirstHandCardToCanvas(page);
    await expect(page.locator("image.card-image")).toHaveCount(1);

    await clickFirstCanvasCard(page);
    await expect.poll(() => page.locator("circle").count()).toBeGreaterThan(0);

    await expect.poll(() => getFirstCanvasCardRotation(page)).toBe(0);
    await page.keyboard.press("t");
    await expect.poll(() => getFirstCanvasCardRotation(page)).toBe(90);

    await page.keyboard.press("t");
    await expect.poll(() => getFirstCanvasCardRotation(page)).toBe(0);

    await page.keyboard.press("Backspace");
    await expect(page.locator("image.card-image")).toHaveCount(0);
  });

  test("new game resets local board and hand state", async ({ page }) => {
    await enterTable(page);
    const initialDeckCount = await getDeckCount(page);

    await drawCard(page);
    await playFirstHandCardToCanvas(page);
    await expect(page.locator("image.card-image")).toHaveCount(1);

    page.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.getByRole("button", { name: "New Game" }).click();

    await expect(page.locator(".hand-card")).toHaveCount(0);
    await expect(page.locator("image.card-image")).toHaveCount(0);
    await expect.poll(() => getDeckCount(page)).toBe(initialDeckCount);
  });
});
