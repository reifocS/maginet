import { WebSocketServer, WebSocket } from "ws";

export interface SyncEnvelope {
  type: string;
  payload: unknown;
  meta?: Record<string, unknown>;
}

export interface AgentWebSocketServerOptions {
  port: number;
}

type MessageListener = (message: SyncEnvelope) => void;
type ConnectionListener = (peerId: string) => void;

export class AgentWebSocketServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port: number;
  private messageListeners = new Set<MessageListener>();
  private connectListeners = new Set<ConnectionListener>();
  private disconnectListeners = new Set<ConnectionListener>();
  private browserPeerId = "browser";

  constructor(options: AgentWebSocketServerOptions) {
    this.port = options.port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const address = this.wss!.address();
        const assignedPort = address !== null && typeof address === "object" ? address.port : this.port;
        resolve(assignedPort);
      });

      this.wss.on("error", (err) => {
        // Reject during startup; log after startup
        reject(err);
        console.error("[maginet-agent] WebSocket server error:", err);
      });

      this.wss.on("connection", (ws) => {
        // Close previous client if browser reconnects (e.g. page refresh)
        if (this.client && this.client.readyState === WebSocket.OPEN) {
          this.client.close();
        }
        this.client = ws;
        this.connectListeners.forEach((listener) => listener(this.browserPeerId));

        ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString()) as SyncEnvelope;
            this.messageListeners.forEach((listener) => listener(message));
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on("close", () => {
          this.client = null;
          this.disconnectListeners.forEach((listener) => listener(this.browserPeerId));
        });
      });
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  send(message: SyncEnvelope): void {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(JSON.stringify(message));
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }

  onConnect(listener: ConnectionListener): () => void {
    this.connectListeners.add(listener);
    return () => { this.connectListeners.delete(listener); };
  }

  onDisconnect(listener: ConnectionListener): () => void {
    this.disconnectListeners.add(listener);
    return () => { this.disconnectListeners.delete(listener); };
  }

  getBrowserPeerId(): string {
    return this.browserPeerId;
  }

  setBrowserPeerId(peerId: string): void {
    this.browserPeerId = peerId;
  }
}
