interface GridProps {
  width: number;
  height: number;
  gridSize: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  className?: string;
}

const Grid: React.FC<GridProps> = ({
  width,
  height,
  gridSize,
  stroke = "#ddd",
  strokeWidth = 1,
  opacity = 1,
  className,
}) => {
  const lines = [];

  for (let x = 0; x <= width; x += gridSize) {
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  for (let y = 0; y <= height; y += gridSize) {
    lines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  return <g className={className}>{lines}</g>;
};

export default Grid;
