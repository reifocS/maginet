import React from "react";
import TextShape from "../shapes/TextShape";
import ImageShape from "../shapes/ImageShape";
import RectangleShape from "../shapes/RectangleShape";
import PingShape from "../shapes/PingShape";
import TokenShape from "../shapes/TokenShape";
import { Shape as ShapeType } from "../Canvas";

export const STACKING_OFFSET = 10;

function ShapeFactory({
  shape,
  commonProps,
  selected,
  readOnly,
  setEditingText,
  inputRef,
  setHoveredCard,
  stackIndex,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGElement>;
  selected: boolean;
  readOnly: boolean;
  setEditingText: (value: { id: string; text: string }) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  setHoveredCard: React.Dispatch<React.SetStateAction<string | null>>;
  stackIndex: number;
}) {
  const transform = `rotate(${shape.rotation || 0} ${
    shape.point[0] + shape.size[0] / 2
  } ${shape.point[1] + shape.size[1] / 2}) translate(0, ${
    stackIndex * STACKING_OFFSET
  })`;
  switch (shape.type) {
    case "text":
      return (
        <TextShape
          shape={shape}
          commonProps={{
            ...(commonProps as React.SVGProps<SVGTextElement>),
            onDoubleClick: (e) => {
              e.stopPropagation();
              if (readOnly) return;
              setEditingText({ id: shape.id, text: shape.text! });
              setTimeout(() => inputRef.current?.focus(), 0);
            },
          }}
          transform={transform}
          selected={selected}
        />
      );
    case "image":
      return (
        <ImageShape
          shape={shape}
          commonProps={{
            ...(commonProps as React.SVGProps<SVGGElement>),
            onMouseEnter: () => {
              if (readOnly && shape.isFlipped) return;
              setHoveredCard(shape.src?.[shape.srcIndex] ?? null);
            },
            onMouseLeave: () => setHoveredCard(null),
          }}
          transform={transform}
          readOnly={readOnly}
        />
      );
    case "rectangle":
      return (
        <RectangleShape
          shape={shape}
          commonProps={commonProps as React.SVGProps<SVGRectElement>}
        />
      );
    case "ping":
      return <PingShape shape={shape} />;
    case "token":
      return (
        <TokenShape
          shape={shape}
          commonProps={{
            ...(commonProps as React.SVGProps<SVGGElement>),
            onDoubleClick: (e) => {
              e.stopPropagation();
              if (readOnly) return;
              setEditingText({ id: shape.id, text: shape.text! });
              setTimeout(() => inputRef.current?.focus(), 0);
            },
          }}
        />
      );
    default:
      throw new Error(`Unknown shape type: ${shape.type}`);
  }
}

export default ShapeFactory;