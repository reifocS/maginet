import { useState } from "react";
import { Counter } from "../types/canvas";

interface CounterControlsProps {
  currentCounters: Counter[];
  onUpdateCounters: (counters: Counter[]) => void;
  onClose: () => void;
}

const COMMON_LABELS = ["P/T", "loyalty", "charge"];
const DEFAULT_COLORS: Record<string, string> = {
  "P/T": "#2196F3",
  "loyalty": "#9C27B0",
  "charge": "#FF9800",
};

const CounterControls = ({ currentCounters, onUpdateCounters, onClose }: CounterControlsProps) => {
  const [newLabel, setNewLabel] = useState("P/T");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS["P/T"]);

  const isPTCounter = (counter: Counter) => counter.label === "P/T";

  const updateCounter = (index: number, updates: Partial<Counter>) => {
    const updated = [...currentCounters];
    updated[index] = { ...updated[index], ...updates };
    onUpdateCounters(updated);
  };

  const deleteCounter = (index: number) => {
    const updated = [...currentCounters];
    updated.splice(index, 1);
    onUpdateCounters(updated);
  };

  const addNewCounter = () => {
    const existing = currentCounters.findIndex(c => c.label === newLabel);
    if (existing >= 0) {
      if (newLabel === "P/T") {
        updateCounter(existing, {
          power: (currentCounters[existing].power || 0) + 1,
          toughness: (currentCounters[existing].toughness || 0) + 1,
        });
      } else {
        updateCounter(existing, {
          value: (currentCounters[existing].value || 0) + 1,
        });
      }
    } else {
      const newCounter: Counter = {
        label: newLabel,
        color: newColor,
      };
      if (newLabel === "P/T") {
        newCounter.power = 1;
        newCounter.toughness = 1;
      } else {
        newCounter.value = 1;
      }
      onUpdateCounters([...currentCounters, newCounter]);
    }
  };

  return (
    <div className="counter-controls-panel win-panel fixed top-1/2 left-1/2 z-(--z-counter-panel) min-w-[320px] max-w-[400px] -translate-x-1/2 -translate-y-1/2 p-3.5">
      <div className="counter-controls-header win-titlebar -mx-3.5 -mt-3.5 mb-3 flex items-center justify-between px-2.5 py-1.5">
        <h4 className="m-0 text-[13px] text-white">Manage Counters</h4>
        <button
          onClick={onClose}
          className="win-bevel h-5 w-5 cursor-pointer bg-win-button p-0 text-base leading-none text-win-text hover:bg-win-hover"
        >
          ×
        </button>
      </div>

      {currentCounters.length > 0 && (
        <div className="mb-4 border-b border-win-border-mid pb-3">
          {currentCounters.map((counter, index) => (
            <div key={index} className="mb-1.5 flex items-center gap-2 rounded-sm border border-win-border-mid bg-win-surface p-2">
              <div
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: counter.color || "#666" }}
              />
              <span className="min-w-[60px] flex-1 text-[13px] text-win-text">{counter.label}</span>

              {isPTCounter(counter) ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      className="counter-btn minus win-button h-7 w-7 p-0 text-base leading-none"
                      onClick={() => updateCounter(index, { power: (counter.power || 0) - 1 })}
                    >
                      −
                    </button>
                    <span className="min-w-[24px] text-center text-sm font-bold text-win-text">{counter.power || 0}</span>
                    <button
                      className="counter-btn plus win-button h-7 w-7 p-0 text-base leading-none"
                      onClick={() => updateCounter(index, { power: (counter.power || 0) + 1 })}
                    >
                      +
                    </button>
                  </div>
                  <span className="px-0.5 text-sm font-bold text-win-text-muted">/</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="counter-btn minus win-button h-7 w-7 p-0 text-base leading-none"
                      onClick={() => updateCounter(index, { toughness: (counter.toughness || 0) - 1 })}
                    >
                      −
                    </button>
                    <span className="min-w-[24px] text-center text-sm font-bold text-win-text">{counter.toughness || 0}</span>
                    <button
                      className="counter-btn plus win-button h-7 w-7 p-0 text-base leading-none"
                      onClick={() => updateCounter(index, { toughness: (counter.toughness || 0) + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    className="counter-btn minus win-button h-7 w-7 p-0 text-base leading-none"
                    onClick={() => updateCounter(index, { value: (counter.value || 0) - 1 })}
                  >
                    −
                  </button>
                  <span className="min-w-[24px] text-center text-sm font-bold text-win-text">{counter.value || 0}</span>
                  <button
                    className="counter-btn plus win-button h-7 w-7 p-0 text-base leading-none"
                    onClick={() => updateCounter(index, { value: (counter.value || 0) + 1 })}
                  >
                    +
                  </button>
                </div>
              )}

              <button
                className="win-bevel h-6 w-6 cursor-pointer bg-win-button p-0 text-xl leading-none text-win-danger hover:bg-win-hover"
                onClick={() => deleteCounter(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="new-counter-section mt-3">
        <h5 className="mb-2 text-[13px] font-normal text-win-text-muted">Add Counter</h5>
        <div className="mb-2 flex gap-2">
          <select
            className="win-input flex-1 cursor-pointer p-2 text-[13px] text-win-text"
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
              if (DEFAULT_COLORS[e.target.value]) {
                setNewColor(DEFAULT_COLORS[e.target.value]);
              }
            }}
          >
            {COMMON_LABELS.map(label => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="win-input h-9 w-10 cursor-pointer p-0.5"
            title="Counter color"
          />
          <button
            className="win-button px-4 py-2 text-[13px] font-medium"
            onClick={addNewCounter}
          >
            Add
          </button>
        </div>
        <input
          type="text"
          className="win-input w-full p-2 text-[13px] text-win-text placeholder:text-[#666666]"
          placeholder="Or type custom label..."
          value={COMMON_LABELS.includes(newLabel) ? "" : newLabel}
          onChange={(e) => setNewLabel(e.target.value || "P/T")}
        />
      </div>
    </div>
  );
};

export default CounterControls;
