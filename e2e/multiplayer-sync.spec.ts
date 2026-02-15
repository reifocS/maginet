import { expect, test } from "@playwright/test";
import {
  connectToPeer,
  dragFirstCanvasCardBy,
  drawCard,
  enterTable,
  getFirstCanvasCardPosition,
  playFirstHandCardToCanvas,
  waitForPeerId,
} from "./utils/table";

test.describe("Multiplayer sync", () => {
  test("syncs draw/play/drag, restores after refresh, and continues syncing", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await Promise.all([enterTable(pageA), enterTable(pageB)]);

      const peerIdB = await waitForPeerId(pageB);
      await connectToPeer(pageA, peerIdB);

      await drawCard(pageA);
      await playFirstHandCardToCanvas(pageA, { x: 980, y: 280 });

      await expect
        .poll(() => pageB.locator("image.card-image").count(), {
          timeout: 20_000,
        })
        .toBe(1);

      const syncedPosition = await getFirstCanvasCardPosition(pageB);
      expect(Math.abs(syncedPosition.x - 980)).toBeLessThan(80);
      expect(Math.abs(syncedPosition.y - 280)).toBeLessThan(80);

      await dragFirstCanvasCardBy(pageA, { x: -160, y: 120 });
      const movedPositionOnA = await getFirstCanvasCardPosition(pageA);

      await expect
        .poll(async () => {
          const movedPositionOnB = await getFirstCanvasCardPosition(pageB);
          const sameX = Math.abs(movedPositionOnA.x - movedPositionOnB.x) <= 8;
          const sameY = Math.abs(movedPositionOnA.y - movedPositionOnB.y) <= 8;
          return sameX && sameY;
        }, {
          timeout: 20_000,
        })
        .toBe(true);

      await pageA.reload({ waitUntil: "domcontentloaded" });
      await expect(pageA.locator(".selection-panel")).toBeVisible();
      await expect(pageA.locator(".deck-draw-button")).toBeVisible();
      await expect(pageA.locator("image.card-image")).toHaveCount(1);

      await expect
        .poll(async () => {
          const restoredPositionOnA = await getFirstCanvasCardPosition(pageA);
          const sameX = Math.abs(restoredPositionOnA.x - movedPositionOnA.x) <= 8;
          const sameY = Math.abs(restoredPositionOnA.y - movedPositionOnA.y) <= 8;
          return sameX && sameY;
        }, {
          timeout: 20_000,
        })
        .toBe(true);

      await dragFirstCanvasCardBy(pageB, { x: 140, y: -90 });
      const movedPositionOnBAfterRefresh = await getFirstCanvasCardPosition(pageB);

      await expect
        .poll(async () => {
          const movedPositionOnAAfterRefresh = await getFirstCanvasCardPosition(pageA);
          const sameX = Math.abs(movedPositionOnAAfterRefresh.x - movedPositionOnBAfterRefresh.x) <= 8;
          const sameY = Math.abs(movedPositionOnAAfterRefresh.y - movedPositionOnBAfterRefresh.y) <= 8;
          return sameX && sameY;
        }, {
          timeout: 30_000,
        })
        .toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
