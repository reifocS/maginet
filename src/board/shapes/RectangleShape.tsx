import React from "react";
import { Shape as ShapeType } from "../../types/canvas";
import { DOMVector } from "../../utils/vec";

const RectangleShape = ({
  shape,
  commonProps,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGRectElement>;
}) => {
  const { point, size, rotation, color } = shape;
  const vector = new DOMVector(point[0], point[1], size[0], size[1]);
  const coordinates = vector.toDOMRect();
  const { x, y, width, height } = coordinates;

  const transform = `rotate(${rotation || 0} ${x + width / 2} ${
    y + height / 2
  }) translate(${x} ${y})`;

  return (
    <g transform={transform} {...commonProps}>
      <rect
        width={width}
        height={height}
        fill="none"
        stroke={color || "#facc15"}
        strokeWidth={3}
        strokeOpacity={0.9}
        rx={6}
        ry={6}
        x={0}
        y={0}
        style={{
          filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.12))",
        }}
      />
    </g>
  );
};

export default RectangleShape;
