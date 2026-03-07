import React from "react";
import { useShapeStore } from "../../hooks/useShapeStore";
import { getResolvedShapePropertyValue, getShapePropertyDefinitions } from "./propertiesPanelFields";

export default function PropertiesPanel() {
  const shapes = useShapeStore((state) => state.shapes);
  const selectedShapeIds = useShapeStore((state) => state.selectedShapeIds);
  const editingText = useShapeStore((state) => state.editingText);
  const updateShape = useShapeStore((state) => state.updateShape);
  const pushHistory = useShapeStore((state) => state.pushHistory);

  const historyBatchShapeIdRef = React.useRef<string | null>(null);

  const selectedShape = React.useMemo(() => {
    if (selectedShapeIds.length !== 1) {
      return null;
    }

    return shapes.find((shape) => shape.id === selectedShapeIds[0]) ?? null;
  }, [shapes, selectedShapeIds]);

  const hasColorProperty = React.useMemo(() => {
    if (!selectedShape || editingText) {
      return false;
    }

    return getShapePropertyDefinitions(selectedShape).some(
      (definition) => definition.key === "color"
    );
  }, [editingText, selectedShape]);

  const colorValue = React.useMemo(() => {
    if (!selectedShape || !hasColorProperty) {
      return "#000000";
    }

    return String(getResolvedShapePropertyValue(selectedShape, "color"));
  }, [hasColorProperty, selectedShape]);

  React.useEffect(() => {
    historyBatchShapeIdRef.current = null;
  }, [selectedShape?.id]);

  function ensureHistorySnapshot() {
    if (!selectedShape) return;
    if (historyBatchShapeIdRef.current === selectedShape.id) return;
    pushHistory();
    historyBatchShapeIdRef.current = selectedShape.id;
  }

  function resetHistoryBatch() {
    historyBatchShapeIdRef.current = null;
  }

  function handleColorChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedShape) return;
    ensureHistorySnapshot();
    updateShape(selectedShape.id, { color: event.currentTarget.value });
  }

  if (!hasColorProperty) {
    return null;
  }

  return (
    <label className="win-button fixed top-[140px] right-[84px] z-(--z-selection-panel) hidden min-[721px]:inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-semibold text-win-text pointer-events-auto">
      <span>Color</span>
      <span
        aria-hidden="true"
        className="h-4 w-4 rounded-[2px] border border-black/40"
        style={{ backgroundColor: colorValue }}
      />
      <input
        aria-label="Change selected shape color"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        type="color"
        value={colorValue}
        onChange={handleColorChange}
        onBlur={resetHistoryBatch}
      />
    </label>
  );
}
