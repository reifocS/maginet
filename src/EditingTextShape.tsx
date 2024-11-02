import React from "react";
import { getBounds } from "./utils/canvas_utils";
import { Shape } from "./Canvas";

interface EditableTextProps {
  editingTextShape?: Shape;
  onTextBlur: () => void;
  editingText: { id: string; text: string };
  inputRef: React.RefObject<HTMLTextAreaElement>;
  setEditingText: (value: { id: string; text: string }) => void;
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
}

// Todo refactor: use a div to get text dimensions
export default function EditableText({
  editingTextShape,
  onTextBlur,
  inputRef,
  editingText,
  setEditingText,
  setShapes,
}: EditableTextProps) {
  const { point, text, fontSize } = editingTextShape!;
  const bounds = getBounds(text ?? "", point[0], point[1], fontSize);

  const inputWidth = bounds.width;

  const inputHeight = bounds.height;

  function determineTextCoordinates() {
    if (
      editingTextShape?.type === "token" ||
      editingTextShape?.type === "rectangle"
    ) {
      const [width, height] = editingTextShape.size;
      const [x1, y1] = editingTextShape.point;
      let x = x1 + width / 2;
      let y = y1 + height / 2;
      y -= inputHeight / 2;
      x -= inputWidth / 2;
      return { x, y };
    }
    const x = editingTextShape?.point[0];
    const y = editingTextShape?.point[1];
    return { x, y };
  }
  const { x, y } = determineTextCoordinates();
  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const updatedText = e.target.value;
    setEditingText({ ...editingText, text: updatedText });
    setShapes((prevShapes) =>
      prevShapes.map((shape) =>
        shape.id === editingText.id
          ? {
              ...shape,
              text: updatedText,
              size:
                shape.type === "text" ? [inputWidth, inputHeight] : shape.size,
            }
          : shape
      )
    );
  }

  return (
    <foreignObject x={x} y={y} height={bounds.height} width={bounds.width}>
      <textarea
        ref={inputRef}
        value={editingText.text ?? ""}
        onChange={onTextChange}
        onBlur={onTextBlur}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          fontSize: `${editingTextShape?.fontSize ?? 16}px`,
          fontFamily: "Arial",
          width: "100%",
          height: "100%",
          border: "none",
          padding: "4px",
          whiteSpace: "pre",
          resize: "none",
          minHeight: 1,
          minWidth: 1,
          outline: 0,
          overflow: "hidden",
          pointerEvents: "all",
          backfaceVisibility: "hidden",
          display: "inline-block",
          backgroundColor: "transparent",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            onTextBlur();
          }
        }}
      />
    </foreignObject>
  );
}
