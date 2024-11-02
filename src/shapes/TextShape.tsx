import React from "react";
import { Shape as ShapeType } from "../Canvas";
import { getBounds } from "../utils/canvas_utils";

// TODO Refactor use foreignObject to render text to keep return to lines
const TextShape = ({
  shape,
  commonProps,
  transform,
  selected,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGTextElement>;
  transform: string;
  selected: boolean;
}) => {
  const { point, text, color, fontSize } = shape;
  const bounds = getBounds(text ?? "", point[0], point[1], fontSize);
  return (
    <foreignObject
      x={point[0]}
      y={point[1]}
      width={bounds.width}
      height={bounds.height}
      transform={transform}
    >
      <div
        {...(commonProps as unknown as React.HTMLProps<HTMLDivElement>)}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          padding: "4px",
          whiteSpace: "pre",
          minHeight: 1,
          minWidth: 1,
          outline: 0,
          backgroundColor: "transparent",
          overflow: "hidden",
          userSelect: "none",
          display: "inline-block",
          position: "relative",
          color: selected ? "red" : color,
          fontSize: `${fontSize}px`,
          fontFamily: "Arial",
        }}
      >
        {text}
      </div>
    </foreignObject>
  );
};

export default TextShape;
