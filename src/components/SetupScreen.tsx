import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { processRawText } from "../hooks/useCards";
import { DEFAULT_DECK } from "../DEFAULT_DECK";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";

interface SetupScreenProps {
  deckParam: string;
  peer: Peer | null;
  connections: Map<string, DataConnection>;
  connectToPeer: (peerId: string) => void;
  error: Error | null;
  isDeckLoading: boolean;
  deckError: Error | null;
  deckNames: string[];
  onSetupComplete: () => void;
}

export default function SetupScreen({
  deckParam,
  peer,
  connections,
  connectToPeer,
  error,
  isDeckLoading,
  deckError,
  deckNames,
  onSetupComplete,
}: SetupScreenProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [setupStep, setSetupStep] = useState<"deck" | "multiplayer">(() =>
    deckParam.trim() ? "multiplayer" : "deck"
  );
  const [deckDraft, setDeckDraft] = useState(() => deckParam);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupPeerId, setSetupPeerId] = useState("");
  const [setupCopied, setSetupCopied] = useState(false);

  const deckDraftCount = processRawText(deckDraft).length;

  const handleDeckContinue = () => {
    const trimmed = deckDraft.trim();
    const parsed = processRawText(trimmed);
    if (parsed.length === 0) {
      setSetupError("Paste a deck list to continue.");
      return;
    }
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("deck", trimmed);
    navigate(`${location.pathname}?${nextParams.toString()}`, { replace: true });
    setSetupError(null);
    setSetupStep("multiplayer");
  };

  const handleUseSampleDeck = () => {
    setDeckDraft(DEFAULT_DECK.join("\n"));
    setSetupError(null);
  };

  const handleCopyPeerId = () => {
    if (!peer?.id) return;
    navigator.clipboard.writeText(peer.id);
    setSetupCopied(true);
    window.setTimeout(() => setSetupCopied(false), 2000);
  };

  const deckCardCount = deckNames.length;
  const deckStatus = deckError
    ? "Deck failed to load. Check card names."
    : deckCardCount > 0
      ? isDeckLoading
        ? `Loading ${deckCardCount} cards...`
        : `Deck ready: ${deckCardCount} cards`
      : "No deck selected";

  return (
    <div className="setup-screen fixed inset-0 z-(--z-setup) flex items-center justify-center p-[clamp(16px,4vw,48px)] bg-[repeating-linear-gradient(45deg,#dcdcdc_0px,#dcdcdc_12px,#cfcfcf_12px,#cfcfcf_24px)] animate-[setup-fade_0.2s_ease-out]">
      <div className="setup-card win-panel w-[min(760px,92vw)] rounded-[6px] p-[clamp(16px,3vw,28px)] flex flex-col gap-4 animate-[setup-rise_0.25s_ease-out]">
        <div className="setup-header flex justify-between items-start gap-4">
          <div>
            <p className="setup-kicker m-0 mb-1.5 text-[10px] tracking-[0.24em] uppercase text-win-text-muted">Table Setup</p>
            <h1 className="setup-title m-0 text-[clamp(22px,3vw,30px)]">
              {setupStep === "deck"
                ? "Select your deck"
                : "Multiplayer (optional)"}
            </h1>
            <p className="setup-subtitle mt-1 text-[13px] text-win-text-muted max-w-[52ch]">
              {setupStep === "deck"
                ? "Paste a decklist to load your cards. You can change it later."
                : "Connect now or skip to start solo. You can still connect later from the sidebar."}
            </p>
          </div>
          <div className="setup-step-badge rounded bg-win-subtle px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase text-win-text whitespace-nowrap">
            {setupStep === "deck" ? "Step 1 of 2" : "Step 2 of 2"}
          </div>
        </div>

        {setupStep === "deck" ? (
          <div className="setup-body flex flex-col gap-3">
            <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted" htmlFor="setup-deck">
              Deck list
            </label>
            <textarea
              id="setup-deck"
              className="setup-textarea win-input w-full p-3 text-[13px] leading-[1.4] font-[inherit] min-h-[180px] resize-y shadow-none"
              value={deckDraft}
              onChange={(event) => {
                setDeckDraft(event.target.value);
                if (setupError) {
                  setSetupError(null);
                }
              }}
              placeholder={`1 Legion Angel
3 Wedding Announcement
...`}
            />
            <div className="setup-meta flex justify-between text-xs text-win-text-muted">
              <span>
                {deckDraftCount > 0
                  ? `${deckDraftCount} cards detected`
                  : "Paste one card per line"}
              </span>
              {setupError && <span className="setup-error text-xs text-win-danger">{setupError}</span>}
            </div>
            <div className="setup-actions flex gap-2.5 justify-end flex-wrap">
              <button
                type="button"
                className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                onClick={handleUseSampleDeck}
              >
                Use sample deck
              </button>
              <button
                type="button"
                className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                onClick={handleDeckContinue}
                disabled={deckDraftCount === 0}
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-body flex flex-col gap-3">
            <div className="setup-deck-summary flex items-center justify-between text-xs text-win-text-muted rounded bg-[#e0e0e0] border border-win-border-mid px-2.5 py-2">
              <span>Deck status</span>
              <span>{deckStatus}</span>
            </div>
            {deckError && (
              <div className="setup-error text-xs text-win-danger">
                Deck failed to load. Check card names.
              </div>
            )}
            <div className="setup-grid grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
              <div className="setup-panel win-bevel flex flex-col gap-2 rounded bg-win-bg-light p-2.5">
                <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted" htmlFor="setup-peer-id">
                  Friend&apos;s peer ID
                </label>
                <div className="setup-input-row flex gap-2.5 items-center">
                  <input
                    id="setup-peer-id"
                    className="setup-input win-input w-full p-3 text-[13px] leading-[1.4] shadow-none"
                    type="text"
                    value={setupPeerId}
                    onChange={(event) => setSetupPeerId(event.target.value)}
                    placeholder="Enter peer ID"
                  />
                  <button
                    type="button"
                    className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                    onClick={() => connectToPeer(setupPeerId.trim())}
                    disabled={!setupPeerId.trim()}
                  >
                    Connect
                  </button>
                </div>
                {connections.size > 0 && (
                  <div className="setup-status text-xs text-win-text-muted">
                    Connected to {connections.size} peer
                    {connections.size !== 1 ? "s" : ""}
                  </div>
                )}
                {error && <div className="setup-error text-xs text-win-danger">{error.message}</div>}
              </div>
              <div className="setup-panel win-bevel flex flex-col gap-2 rounded bg-win-bg-light p-2.5">
                <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted">Your ID</label>
                <div className="setup-input-row flex gap-2.5 items-center">
                  <input
                    className="setup-input win-input w-full p-3 text-[13px] leading-[1.4] shadow-none"
                    type="text"
                    readOnly
                    value={peer?.id ?? "Generating ID..."}
                  />
                  <button
                    type="button"
                    className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                    onClick={handleCopyPeerId}
                    disabled={!peer?.id}
                  >
                    {setupCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="setup-hint text-[11px] text-win-text-muted">
                  Share this ID so a friend can connect to you.
                </div>
              </div>
            </div>
            <div className="setup-actions flex gap-2.5 justify-end flex-wrap">
              <button
                type="button"
                className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                onClick={() => setSetupStep("deck")}
              >
                Back
              </button>
              <button
                type="button"
                className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                onClick={onSetupComplete}
                disabled={deckNames.length === 0}
              >
                Enter table
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
