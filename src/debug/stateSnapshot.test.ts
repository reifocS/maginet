import { describe, expect, it } from "vitest";
import {
  createDebugSnapshot,
  normalizeDebugSnapshot,
  parseDebugSnapshot,
  serializeDebugSnapshot,
} from "./stateSnapshot";

describe("stateSnapshot", () => {
  it("round-trips a debug snapshot", () => {
    const snapshot = createDebugSnapshot({
      capturedAt: 1234,
      deckParam: "4 Island",
      cardState: {
        cards: [{ id: "hand-1", src: ["https://cards.example/hand.png"] }],
        deck: [{ id: "deck-1", src: ["https://cards.example/deck.png"] }],
        lastAction: "DRAW_CARD",
        actionId: 7,
      },
      shapes: [
        {
          id: "shape-1",
          point: [10, 20],
          size: [80, 24],
          type: "text",
          text: "REST",
          rotation: 32,
          fontSize: 18,
          srcIndex: 0,
          color: "#000000",
        },
      ],
      selectedShapeIds: ["shape-1"],
      editingText: { id: "shape-1", text: "REST" },
      camera: { x: 40, y: 60, z: 0.75 },
      mode: "select",
      shapeType: "text",
      isSnapEnabled: true,
      showCounterControls: false,
      selectedHandCardId: "hand-1",
      connectedPeerIds: ["peer-a"],
      meta: {
        href: "https://example.test/?deck=4%20Island",
        peerId: "peer-local",
        userAgent: "Vitest",
        viewport: { width: 1440, height: 900 },
      },
    });

    expect(parseDebugSnapshot(serializeDebugSnapshot(snapshot))).toEqual(snapshot);
  });

  it("dedupes shapes by id during normalization", () => {
    const normalized = normalizeDebugSnapshot({
      kind: "maginet/debug-snapshot",
      version: 1,
      capturedAt: 1234,
      deckParam: "",
      cardState: {
        cards: [],
        deck: [],
      },
      shapes: [
        {
          id: "shape-1",
          point: [0, 0],
          size: [10, 10],
          type: "rectangle",
          srcIndex: 0,
        },
        {
          id: "shape-1",
          point: [20, 20],
          size: [30, 30],
          type: "rectangle",
          srcIndex: 0,
          color: "#ff0000",
        },
      ],
      selectedShapeIds: ["shape-1"],
      editingText: null,
      camera: { x: 0, y: 0, z: 1 },
      mode: "select",
      shapeType: "text",
      isSnapEnabled: false,
      showCounterControls: false,
      selectedHandCardId: null,
      connectedPeerIds: [],
      meta: {},
    });

    expect(normalized?.shapes).toEqual([
      {
        id: "shape-1",
        point: [20, 20],
        size: [30, 30],
        type: "rectangle",
        srcIndex: 0,
        color: "#ff0000",
      },
    ]);
  });

  it("rejects malformed snapshots", () => {
    expect(parseDebugSnapshot("{")).toBeNull();
    expect(
      normalizeDebugSnapshot({
        kind: "maginet/debug-snapshot",
        version: 99,
      })
    ).toBeNull();
    expect(
      normalizeDebugSnapshot({
        kind: "maginet/debug-snapshot",
        version: 1,
        capturedAt: 1,
        deckParam: "",
        cardState: { cards: [], deck: [] },
        shapes: [],
        selectedShapeIds: [],
        editingText: null,
        camera: { x: 0, y: 0, z: "bad" },
        mode: "select",
        shapeType: "text",
        isSnapEnabled: false,
        showCounterControls: false,
        selectedHandCardId: null,
        connectedPeerIds: [],
        meta: {},
      })
    ).toBeNull();
  });
});
