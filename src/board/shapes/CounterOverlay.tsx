import { Shape } from "../../types/canvas";

interface CounterOverlayProps {
  shape: Shape;
  transform: string;
}

const DEFAULT_COLOR = "#666";

const CounterOverlay = ({ shape, transform }: CounterOverlayProps) => {
  const { point, size, counters } = shape;
  const [x, y] = point;
  const [width, height] = size;

  if (!counters || counters.length === 0) {
    return null;
  }

  // Show all counters
  const activeCounters = counters;

  // Position counters in bottom-right corner, stacked vertically
  const counterSize = 36;
  const spacing = 4;
  const startX = x + width - counterSize - 8;
  const startY = y + height - (activeCounters.length * (counterSize + spacing)) + spacing;

  return (
    <g transform={transform}>
      {activeCounters.map((counter, index) => {
        const color = counter.color || DEFAULT_COLOR;
        const cy = startY + index * (counterSize + spacing) + counterSize / 2;
        const cx = startX + counterSize / 2;

        // Determine if this is a P/T counter
        const isPT = counter.label === "P/T";

        // Format display text
        let displayText: string;
        let showLabel = true;

        if (isPT) {
          // P/T counter: show as "+5/+5" or "-2/+3"
          const power = counter.power || 0;
          const toughness = counter.toughness || 0;
          const powerSign = power >= 0 ? "+" : "";
          const toughnessSign = toughness >= 0 ? "+" : "";
          displayText = `${powerSign}${power}/${toughnessSign}${toughness}`;
          showLabel = false; // Don't show "P/T" label, the format is self-explanatory
        } else {
          // Single value counter
          displayText = (counter.value || 0).toString();
          showLabel = true;
        }

        return (
          <g key={index}>
            {/* Background circle */}
            <circle
              cx={cx}
              cy={cy}
              r={counterSize / 2}
              fill={color}
              stroke={adjustColor(color, 30)}
              strokeWidth="2"
            />
            {/* Counter text */}
            <text
              x={cx}
              y={showLabel ? cy - 3 : cy}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fill: getContrastColor(color),
                fontSize: isPT ? "10px" : "12px",
                fontWeight: "bold",
                fontFamily: "monospace",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {displayText}
            </text>
            {/* Counter label badge (small text below) */}
            {showLabel && (
              <text
                x={cx}
                y={cy + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fill: getContrastColor(color),
                  fontSize: "7px",
                  fontWeight: "normal",
                  fontFamily: "sans-serif",
                  pointerEvents: "none",
                  userSelect: "none",
                  opacity: 0.9,
                }}
              >
                {counter.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

// Helper function to lighten/darken color for border
function adjustColor(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// Helper function to get contrasting text color (white or black)
function getContrastColor(hexColor: string): string {
  const color = hexColor.replace("#", "");
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? "#000000" : "#FFFFFF";
}

export default CounterOverlay;
