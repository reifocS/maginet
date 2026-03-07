import React from "react";
import toast from "react-hot-toast";
import { Textarea } from "../../components/ui/Input";
import { DebugSnapshotImportResult } from "../../debug/stateSnapshot";

type SnapshotModalProps = {
  getCurrentSnapshotText: () => string;
  onClose: () => void;
  onLoadSnapshot: (raw: string) => DebugSnapshotImportResult;
};

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "true");
  fallback.style.position = "fixed";
  fallback.style.left = "-9999px";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

export default function SnapshotModal({
  getCurrentSnapshotText,
  onClose,
  onLoadSnapshot,
}: SnapshotModalProps) {
  const [snapshotText, setSnapshotText] = React.useState(() =>
    getCurrentSnapshotText()
  );

  const refreshSnapshot = () => {
    setSnapshotText(getCurrentSnapshotText());
  };

  const copySnapshot = async () => {
    const nextText = getCurrentSnapshotText();
    setSnapshotText(nextText);

    try {
      await copyTextToClipboard(nextText);
      toast.success("Snapshot copied");
    } catch {
      toast.error("Could not copy the snapshot");
    }
  };

  const loadSnapshot = () => {
    const result = onLoadSnapshot(snapshotText);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onClose();
  };

  return (
    <div className="snapshot-modal flex w-[min(680px,92vw)] flex-col gap-3">
      <div className="text-[11px] leading-[1.45] text-win-text-subtle">
        Capture the current table, camera, selection, and shape state. Paste a
        snapshot back here later to replay the same setup.
      </div>
      <Textarea
        className="min-h-[240px] w-full resize-y p-2 font-[Courier_New,Lucida_Console,monospace] text-[10px] leading-[1.45]"
        aria-label="Snapshot JSON"
        spellCheck={false}
        value={snapshotText}
        onChange={(event) => setSnapshotText(event.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="modal-button win-button px-4 py-2"
          type="button"
          onClick={refreshSnapshot}
        >
          Refresh
        </button>
        <button
          className="modal-button win-button px-4 py-2"
          type="button"
          onClick={() => {
            void copySnapshot();
          }}
        >
          Copy Current
        </button>
        <button
          className="modal-button win-button px-4 py-2"
          type="button"
          onClick={loadSnapshot}
        >
          Load Snapshot
        </button>
      </div>
    </div>
  );
}
