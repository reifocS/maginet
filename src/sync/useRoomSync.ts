import React from 'react';
import type { RecordsDiff, StoreSnapshot, TLRecord, TLStore } from 'tldraw';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const TOKEN_VERSION = 1;

export type SyncStatus =
  | 'idle'
  | 'creating-offer'
  | 'awaiting-answer'
  | 'waiting-peer'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error';

export type SyncRole = 'host' | 'guest' | null;

type OfferTokenPayload = {
  version: number;
  kind: 'offer';
  roomId: string;
  description: RTCSessionDescriptionInit;
};

type AnswerTokenPayload = {
  version: number;
  kind: 'answer';
  roomId: string;
  description: RTCSessionDescriptionInit;
};

type PeerMessage =
  | { type: 'snapshot'; snapshot: StoreSnapshot<TLRecord> }
  | { type: 'diff'; diff: RecordsDiff<TLRecord> };

function encodeToken(payload: OfferTokenPayload | AnswerTokenPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeToken<T extends OfferTokenPayload | AnswerTokenPayload>(token: string): T {
  const binary = atob(token);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as T;
}

function isEmptyDiff(diff: RecordsDiff<TLRecord>): boolean {
  return (
    Object.keys(diff.added).length === 0 &&
    Object.keys(diff.updated).length === 0 &&
    Object.keys(diff.removed).length === 0
  );
}

function normalizeSnapshot(snapshot: StoreSnapshot<TLRecord>): StoreSnapshot<TLRecord> {
  return {
    store: snapshot.store,
    schema: snapshot.schema,
  } satisfies StoreSnapshot<TLRecord>;
}

async function waitForIceGathering(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  if (pc.iceGatheringState === 'complete') {
    const desc = pc.localDescription;
    if (!desc) throw new Error('ICE gathering finished without local description.');
    return { type: desc.type, sdp: desc.sdp ?? '' };
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const desc = pc.localDescription;
      if (desc) {
        resolve({ type: desc.type, sdp: desc.sdp ?? '' });
      } else {
        reject(new Error('Timed out while gathering ICE candidates.'));
      }
    }, 7000);

    const handleStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', handleStateChange);
        const desc = pc.localDescription;
        if (!desc) {
          reject(new Error('Missing local description after ICE gathering.'));
          return;
        }
        resolve({ type: desc.type, sdp: desc.sdp ?? '' });
      }
    };

    pc.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

export interface RoomSyncState {
  status: SyncStatus;
  error: string | null;
  role: SyncRole;
  offerToken: string | null;
  answerToken: string | null;
  createOffer: () => Promise<string>;
  acceptOffer: (token: string) => Promise<string>;
  submitAnswer: (token: string) => Promise<void>;
  reset: () => void;
}

export function useRoomSync(roomId: string, store: TLStore): RoomSyncState {
  const [status, setStatus] = React.useState<SyncStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [offerToken, setOfferToken] = React.useState<string | null>(null);
  const [answerToken, setAnswerToken] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<SyncRole>(null);

  const peerRef = React.useRef<RTCPeerConnection | null>(null);
  const channelRef = React.useRef<RTCDataChannel | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const hasInitialSnapshotRef = React.useRef(false);
  const pendingDiffsRef = React.useRef<RecordsDiff<TLRecord>[]>([]);

  const disposeListener = React.useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  const teardownConnection = React.useCallback(() => {
    disposeListener();

    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch (closeError) {
        console.warn('[sync] Failed to close data channel', closeError);
      }
      channelRef.current = null;
    }

    if (peerRef.current) {
      try {
        peerRef.current.close();
      } catch (closeError) {
        console.warn('[sync] Failed to close peer connection', closeError);
      }
      peerRef.current = null;
    }

    hasInitialSnapshotRef.current = false;
    pendingDiffsRef.current = [];
  }, [disposeListener]);

  const reset = React.useCallback(() => {
    teardownConnection();
    setRole(null);
    setOfferToken(null);
    setAnswerToken(null);
    setError(null);
    setStatus('idle');
  }, [teardownConnection]);

  const sendMessage = React.useCallback((message: PeerMessage) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    try {
      channel.send(JSON.stringify(message));
    } catch (sendError) {
      console.error('[sync] Failed to send message', sendError);
      setError('Failed to send sync message.');
      setStatus('error');
    }
  }, []);

  const applySnapshot = React.useCallback(
    (snapshot: StoreSnapshot<TLRecord>) => {
      try {
        store.mergeRemoteChanges(() => {
          store.loadStoreSnapshot(snapshot);
        });
        hasInitialSnapshotRef.current = true;

        if (pendingDiffsRef.current.length > 0) {
          for (const diff of pendingDiffsRef.current) {
            store.mergeRemoteChanges(() => {
              store.applyDiff(diff);
            });
          }
          pendingDiffsRef.current = [];
        }
      } catch (snapshotError) {
        console.error('[sync] Failed to load snapshot', snapshotError);
        setError('Failed to load remote snapshot.');
        setStatus('error');
      }
    },
    [store]
  );

  const applyDiff = React.useCallback(
    (diff: RecordsDiff<TLRecord>) => {
      if (!hasInitialSnapshotRef.current) {
        pendingDiffsRef.current.push(diff);
        return;
      }

      try {
        store.mergeRemoteChanges(() => {
          store.applyDiff(diff);
        });
      } catch (diffError) {
        console.error('[sync] Failed to apply diff', diffError);
        setError('Failed to apply remote changes.');
        setStatus('error');
      }
    },
    [store]
  );

  const handleMessage = React.useCallback(
    (event: MessageEvent) => {
      try {
        const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const message = JSON.parse(text) as PeerMessage;

        if (message.type === 'snapshot') {
          applySnapshot(message.snapshot);
        } else if (message.type === 'diff') {
          applyDiff(message.diff);
        }
      } catch (parseError) {
        console.error('[sync] Failed to parse incoming message', parseError);
      }
    },
    [applyDiff, applySnapshot]
  );

  const setupDataChannel = React.useCallback(
    (channel: RTCDataChannel) => {
      if (channelRef.current && channelRef.current !== channel) {
        try {
          channelRef.current.close();
        } catch (closeError) {
          console.warn('[sync] Failed to close previous data channel', closeError);
        }
      }

      channelRef.current = channel;
      channel.binaryType = 'arraybuffer';

      const handleOpen = () => {
        setStatus('online');

        const snapshot = normalizeSnapshot(store.getStoreSnapshot('document'));
        sendMessage({ type: 'snapshot', snapshot });

        disposeListener();
        unsubscribeRef.current = store.listen(
          (entry) => {
            if (isEmptyDiff(entry.changes)) {
              return;
            }
            sendMessage({ type: 'diff', diff: entry.changes });
          },
          { scope: 'all', source: 'user' }
        );
      };

      const handleClose = () => {
        disposeListener();
        setStatus('offline');
      };

      const handleError = () => {
        setError('Data channel error.');
        setStatus('error');
      };

      channel.addEventListener('open', handleOpen, { once: true });
      channel.addEventListener('message', handleMessage);
      channel.addEventListener('close', handleClose);
      channel.addEventListener('error', handleError);

      setStatus('connecting');
    },
    [disposeListener, handleMessage, sendMessage, store]
  );

  const ensurePeerConnection = React.useCallback(
    (role: 'host' | 'guest') => {
      if (peerRef.current) {
        return peerRef.current;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerRef.current = pc;
      setRole(role);

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed') {
          setStatus('error');
          setError('Peer connection failed.');
        } else if (state === 'disconnected') {
          setStatus('offline');
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          setStatus('error');
          setError('ICE negotiation failed.');
        }
      };

      pc.onicecandidateerror = (event) => {
        console.error('[sync] ICE candidate error', event.errorText);
        setError('ICE candidate error.');
        setStatus('error');
      };

      if (role === 'guest') {
        pc.ondatachannel = (evt) => {
          const incomingChannel = evt.channel;
          setupDataChannel(incomingChannel);
        };
      }

      return pc;
    },
    [setupDataChannel]
  );

  const createOffer = React.useCallback(async (): Promise<string> => {
    if (!roomId) {
      const err = new Error('Room ID is required to create an offer.');
      setError(err.message);
      setStatus('error');
      throw err;
    }

    teardownConnection();
    setOfferToken(null);
    setAnswerToken(null);
    setError(null);
    setStatus('creating-offer');

    try {
      const pc = ensurePeerConnection('host');
      const channel = pc.createDataChannel('tldraw-sync', { ordered: true });
      setupDataChannel(channel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const description = await waitForIceGathering(pc);

      const payload: OfferTokenPayload = {
        version: TOKEN_VERSION,
        kind: 'offer',
        roomId,
        description,
      };

      const token = encodeToken(payload);
      setOfferToken(token);
      setStatus('awaiting-answer');
      return token;
    } catch (offerError) {
      console.error('[sync] Failed to create offer', offerError);
      setError(offerError instanceof Error ? offerError.message : 'Failed to create offer.');
      setStatus('error');
      throw offerError;
    }
  }, [ensurePeerConnection, roomId, setupDataChannel, teardownConnection]);

  const acceptOffer = React.useCallback(
    async (token: string): Promise<string> => {
      if (!roomId) {
        const err = new Error('Room ID is required to accept an offer.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      teardownConnection();
      setOfferToken(null);
      setAnswerToken(null);
      setError(null);

      let payload: OfferTokenPayload;
      try {
        payload = decodeToken<OfferTokenPayload>(token);
      } catch (parseError) {
        const err = new Error('Offer token is invalid.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      if (payload.version !== TOKEN_VERSION || payload.kind !== 'offer') {
        const err = new Error('Offer token version is unsupported.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      if (payload.roomId !== roomId) {
        const err = new Error('Offer token was generated for a different room.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      try {
        const pc = ensurePeerConnection('guest');
        await pc.setRemoteDescription(payload.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const description = await waitForIceGathering(pc);

        const answerPayload: AnswerTokenPayload = {
          version: TOKEN_VERSION,
          kind: 'answer',
          roomId,
          description,
        };

        const encoded = encodeToken(answerPayload);
        setAnswerToken(encoded);
        setStatus('waiting-peer');
        return encoded;
      } catch (acceptError) {
        console.error('[sync] Failed to accept offer', acceptError);
        setError(acceptError instanceof Error ? acceptError.message : 'Failed to accept offer.');
        setStatus('error');
        throw acceptError;
      }
    },
    [ensurePeerConnection, roomId, teardownConnection]
  );

  const submitAnswer = React.useCallback(
    async (token: string) => {
      if (!peerRef.current) {
        const err = new Error('Create an offer before submitting an answer.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      let payload: AnswerTokenPayload;
      try {
        payload = decodeToken<AnswerTokenPayload>(token);
      } catch (parseError) {
        const err = new Error('Answer token is invalid.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      if (payload.version !== TOKEN_VERSION || payload.kind !== 'answer') {
        const err = new Error('Answer token version is unsupported.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      if (payload.roomId !== roomId) {
        const err = new Error('Answer token was generated for a different room.');
        setError(err.message);
        setStatus('error');
        throw err;
      }

      try {
        await peerRef.current.setRemoteDescription(payload.description);
        setAnswerToken(token);
        setStatus('connecting');
      } catch (submitError) {
        console.error('[sync] Failed to apply answer', submitError);
        setError(submitError instanceof Error ? submitError.message : 'Failed to apply answer.');
        setStatus('error');
        throw submitError;
      }
    },
    [roomId]
  );

  React.useEffect(() => {
    return () => {
      teardownConnection();
    };
  }, [teardownConnection]);

  React.useEffect(() => {
    reset();
  }, [reset, roomId]);

  return {
    status,
    error,
    role,
    offerToken,
    answerToken,
    createOffer,
    acceptOffer,
    submitAnswer,
    reset,
  };
}
