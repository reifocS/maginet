import { useEffect, useRef } from "react";

export type ActionLogEntry = {
  playerId: string;
  playerName?: string;
  action: string;
  cardsInHand: number;
  timestamp?: number;
};

export default function ActionLog({
  actions = [],
}: {
  actions?: ActionLogEntry[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const rafId = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [actions]);

  return (
    <div
      className="action-log-container win-panel fixed top-4 right-4 z-50 w-72 overflow-hidden p-2.5"
      onWheelCapture={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <h3 className="action-log-header bg-win-header-bg border-b-2 border-win-border-dark p-2 text-sm font-semibold">
        Action Log
      </h3>
      <div className="action-log-content max-h-60 overflow-y-auto" ref={scrollRef}>
        <div className="flex flex-col gap-2 px-3 pt-2 pb-3">
          {actions.map((action, index) => (
            <div
              key={index}
              className="action-log-item rounded-sm bg-win-surface px-3 py-2 text-[0.8rem] win-inset-shadow border border-win-border-mid"
            >
              <span className="font-medium">
                {(action.playerName || action.playerId) ?? "Player"}: {" "}
                {action.cardsInHand} cards in hand
              </span>
              <div className="flex items-center justify-between gap-2 mt-1 text-xs text-win-text-muted">
                <span className="text-win-text">{action.action}</span>
                {action.timestamp && (
                  <span className="tabular-nums text-win-text-muted">
                    {new Date(action.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
