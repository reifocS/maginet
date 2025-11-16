import React from "react";
import { Shape as ShapeType } from "../types/canvas";
import { colors } from "../utils/colors";
import { DOMVector } from "../utils/vec";

const TokenShape = ({
  shape,
  commonProps,
  transform,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGGElement>;
  transform: string;
}) => {
  const { point, size, color, text, fontSize } = shape;
  const vector = new DOMVector(point[0], point[1], size[0], size[1]);

  const coordinates = vector.toDOMRect();

  const { x, y, width, height } = coordinates;
  return (
    <g {...commonProps} transform={transform}>
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        fill="#1F2421"
      />
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={(width / 2) * 0.9}
        ry={(height / 2) * 0.9}
        fill={color ?? "#DCE1DE"}
      />
      {text && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: colors[color as keyof typeof colors] ?? "black",
            fontSize: `${fontSize}px`,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {text}
        </text>
      )}
    </g>
  );
};

export default TokenShape;
