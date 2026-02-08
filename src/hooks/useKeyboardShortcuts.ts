import { useEffect } from "react";
import type { Shape } from "../types/canvas";

interface UseKeyboardShortcutsOptions {
  isSetupComplete: boolean;
  editingText: { id: string; text: string } | null;
  selectedShapeIds: string[];
  shapes: Shape[];
  isPanning: boolean;
  showCounterControls: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSetIsCommandPressed: (v: boolean) => void;
  onSetIsSpacePressed: (v: boolean) => void;
  onToggleHelp: () => void;
  onSetShowCounterControls: (v: boolean) => void;
  applyZoomStepRef: React.RefObject<(point: number[], direction: "in" | "out") => void>;
  engageCardRef: React.RefObject<() => void>;
  drawCardRef: React.RefObject<() => void>;
  onDeleteSelected: () => void;
}

export function useKeyboardShortcuts({
  isSetupComplete,
  editingText,
  selectedShapeIds,
  shapes,
  isPanning,
  showCounterControls,
  onUndo,
  onRedo,
  onSetIsCommandPressed,
  onSetIsSpacePressed,
  onToggleHelp,
  onSetShowCounterControls,
  applyZoomStepRef,
  engageCardRef,
  drawCardRef,
  onDeleteSelected,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSetupComplete) return;
      if (document.body.classList.contains("modal-open")) return;
      if (editingText) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT"
        ) {
          return;
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? event.metaKey : event.ctrlKey;

      if (cmdKey && event.key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (event.key === "Control") {
        onSetIsCommandPressed(true);
      } else if (event.key === " ") {
        event.preventDefault();
        onSetIsSpacePressed(true);
        document.body.style.cursor = "grab";
      } else if (event.key === "?" || event.key === "/") {
        onToggleHelp();
      } else if (event.key === "+" || event.key === "=") {
        const center = [window.innerWidth / 2, window.innerHeight / 2];
        applyZoomStepRef.current(center, "in");
      } else if (event.key === "-" || event.key === "_") {
        const center = [window.innerWidth / 2, window.innerHeight / 2];
        applyZoomStepRef.current(center, "out");
      } else if ((event.key === "t" || event.key === "T") && !cmdKey) {
        if (selectedShapeIds.length > 0) {
          event.preventDefault();
          engageCardRef.current();
        }
      } else if ((event.key === "c" || event.key === "C") && !cmdKey) {
        if (selectedShapeIds.length === 1) {
          const selectedShape = shapes.find((s) => s.id === selectedShapeIds[0]);
          if (selectedShape && selectedShape.type === "image") {
            event.preventDefault();
            onSetShowCounterControls(true);
          }
        }
      } else if ((event.key === "d" || event.key === "D") && !cmdKey) {
        event.preventDefault();
        drawCardRef.current();
      } else if (event.key === "Escape") {
        if (showCounterControls) {
          event.preventDefault();
          onSetShowCounterControls(false);
        }
      } else if (event.key === "Backspace" && selectedShapeIds.length > 0) {
        onDeleteSelected();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!isSetupComplete) return;
      if (document.body.classList.contains("modal-open")) return;
      if (event.key === "Control") {
        onSetIsCommandPressed(false);
      } else if (event.key === " ") {
        onSetIsSpacePressed(false);
        if (!isPanning) {
          document.body.style.cursor = "default";
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    editingText,
    selectedShapeIds,
    isPanning,
    onUndo,
    onRedo,
    showCounterControls,
    shapes,
    isSetupComplete,
    onSetIsCommandPressed,
    onSetIsSpacePressed,
    onToggleHelp,
    onSetShowCounterControls,
    applyZoomStepRef,
    engageCardRef,
    drawCardRef,
    onDeleteSelected,
  ]);
}
