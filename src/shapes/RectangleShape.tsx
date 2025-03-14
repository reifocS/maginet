import React from "react";
import { Shape as ShapeType } from "../types/canvas";
import { DOMVector } from "../utils/vec";
import { getBounds } from "../utils/canvas_utils";

const RectangleShape = ({
  shape,
  commonProps,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGRectElement>;
}) => {
  const { point, size, text, fontSize, rotation } = shape;
  const vector = new DOMVector(point[0], point[1], size[0], size[1]);
  const coordinates = vector.toDOMRect();
  const { x, y, width, height } = coordinates;
  const bounds = getBounds(text ?? "", point[0], point[1], fontSize);

  const transform = `rotate(${rotation || 0} ${x + width / 2} ${
    y + height / 2
  }) translate(${x} ${y})`;

  return (
    <g transform={transform} {...commonProps}>
      <rect
        width={width}
        height={height}
        fill="transparent"
        stroke="black"
        x={0}
        y={0}
      />
      {text && (
        <foreignObject x={0} y={0} width={bounds.width} height={bounds.height}>
          <div
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              padding: "4px",
              whiteSpace: "pre",
              minHeight: 1,
              minWidth: 1,
              outline: 0,
              overflow: "hidden",
              userSelect: "none",
              display: "inline-block",
              position: "relative",
              pointerEvents: "none",
              color: "white",
              fontSize: `${fontSize}px`,
              fontFamily: "Arial",
            }}
          >
            {text}
          </div>
        </foreignObject>
      )}
    </g>
  );
};

export default RectangleShape;
