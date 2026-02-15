import { afterEach, describe, expect, it } from "vitest";
import { createSyncClient, type SyncClientOptions, type SyncPeerId } from "../core";
import { MemorySyncNetwork } from "../testing/memoryTransport";
import { createShapesSyncChannel } from "./shapesChannel";
import type { Shape } from "../../types/canvas";

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const waitFor = async (
  assertion: () => void,
  timeoutMs = 1_500,
  pollIntervalMs = 10
) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      assertion();
      return;
    } catch {
      await wait(pollIntervalMs);
    }
  }

  assertion();
};

const createShape = (id: string, point: [number, number]): Shape => ({
  id,
  point,
  size: [80, 120],
  type: "image",
  src: ["https://example.com/card.png"],
  srcIndex: 0,
});

const createShapeState = (initialShapes: Shape[] = []) => {
  let shapes = initialShapes;
  const listeners = new Set<(next: Shape[], prev: Shape[]) => void>();

  return {
    getShapes: () => shapes,
    setShapes: (nextShapes: Shape[]) => {
      const previousShapes = shapes;
      shapes = nextShapes;
      listeners.forEach((listener) => listener(nextShapes, previousShapes));
    },
    subscribe: (listener: (next: Shape[], prev: Shape[]) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const createClient = (
  network: MemorySyncNetwork,
  { roomId, localPeerId }: { roomId: string; localPeerId: SyncPeerId }
) => {
  const options: SyncClientOptions = {
    roomId,
    localPeerId,
    transport: network.createTransport(),
  };
  return createSyncClient(options);
};

describe("shapes channel integration", () => {
  const clients: Array<ReturnType<typeof createSyncClient>> = [];

  afterEach(async () => {
    await Promise.all(
      clients.map(async (client) => {
        await client.stop();
      })
    );
    clients.length = 0;
  });

  it("keeps previously synced cards when only one remote card updates", async () => {
    const network = new MemorySyncNetwork();

    const clientA = createClient(network, {
      roomId: "table-shapes",
      localPeerId: "peer-a",
    });
    const clientB = createClient(network, {
      roomId: "table-shapes",
      localPeerId: "peer-b",
    });
    clients.push(clientA, clientB);

    const localShapesA = createShapeState();
    const localShapesB = createShapeState();

    const receivedByA: Record<string, Shape[]> = {};
    const receivedByB: Record<string, Shape[]> = {};

    clientA.registerChannel(
      createShapesSyncChannel({
        getLocalPeerId: () => "peer-a",
        getLocalShapes: () => localShapesA.getShapes(),
        subscribeLocalShapes: localShapesA.subscribe,
        setRemoteShapes: (peerId, shapes) => {
          receivedByA[peerId] = shapes;
        },
      })
    );

    clientB.registerChannel(
      createShapesSyncChannel({
        getLocalPeerId: () => "peer-b",
        getLocalShapes: () => localShapesB.getShapes(),
        subscribeLocalShapes: localShapesB.subscribe,
        setRemoteShapes: (peerId, shapes) => {
          receivedByB[peerId] = shapes;
        },
      })
    );

    await clientA.start();
    await clientB.start();
    await clientB.connect("peer-a");

    const cardA = createShape("card-a", [100, 120]);
    const cardB = createShape("card-b", [240, 120]);
    localShapesA.setShapes([cardA, cardB]);

    await waitFor(() => {
      expect(receivedByB["peer-a"]?.map((shape) => shape.id)).toEqual([
        "card-a",
        "card-b",
      ]);
    });

    const movedCardB: Shape = {
      ...cardB,
      point: [380, 180],
    };

    localShapesA.setShapes([cardA, movedCardB]);

    await waitFor(() => {
      const remoteShapes = receivedByB["peer-a"];
      expect(remoteShapes).toBeDefined();
      expect(remoteShapes.map((shape) => shape.id)).toEqual(["card-a", "card-b"]);
      const syncedCardB = remoteShapes.find((shape) => shape.id === "card-b");
      expect(syncedCardB?.point).toEqual([380, 180]);
    });
  });
});
