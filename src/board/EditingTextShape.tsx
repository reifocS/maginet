import React from "react";
import { getBounds } from "../utils/canvas_utils";
import { Shape } from "../types/canvas";
import { Textarea } from "../components/ui/Input";
import {
  getAdjustedPointForFixedRotatedTopLeft,
  getShapeRotationTransform,
} from "./components/shapeTransforms";

interface EditableTextProps {
  editingTextShape?: Shape;
  onTextBlur: () => void;
  editingText: { id: string; text: string };
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
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
  const transform = getShapeRotationTransform(editingTextShape!);

  const inputWidth = bounds.width;

  const inputHeight = bounds.height;

  function determineTextCoordinates() {
    if (editingTextShape?.type === "token") {
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

  function normalizeText(text: string) {
    return text.replace(/\t/g, "        ").replace(/\r?\n|\r/g, "\n");
  }

  const { x, y } = determineTextCoordinates();

  function getUpdatedTextShapePatch(shape: Shape, updatedText: string) {
    const nextBounds = getBounds(updatedText ?? "", 0, 0, shape.fontSize);
    const nextSize: [number, number] = [nextBounds.width, nextBounds.height];

    if (shape.type !== "text") {
      return {
        text: updatedText,
        size: shape.size,
      };
    }

    return {
      text: updatedText,
      size: nextSize,
      point: getAdjustedPointForFixedRotatedTopLeft(
        [shape.point[0], shape.point[1]],
        { width: bounds.width, height: bounds.height },
        { width: nextBounds.width, height: nextBounds.height },
        shape.rotation || 0
      ),
    };
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const updatedText = normalizeText(e.target.value);
    setEditingText({ ...editingText, text: updatedText });
    setShapes((prevShapes) =>
      prevShapes.map((shape) =>
        shape.id === editingText.id
          ? { ...shape, ...getUpdatedTextShapePatch(shape, updatedText) }
          : shape
      )
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter = insert new line
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = editingText.text.substring(0, start) + "\n" + editingText.text.substring(end);
        const updatedText = normalizeText(newText);
        setEditingText({ ...editingText, text: updatedText });
        setShapes((prevShapes) =>
          prevShapes.map((shape) =>
            shape.id === editingText.id
              ? { ...shape, ...getUpdatedTextShapePatch(shape, updatedText) }
              : shape
          )
        );
        // Set cursor position after the newline
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1;
        }, 0);
      } else {
        // Enter = submit
        e.preventDefault();
        onTextBlur();
      }
    }
  };

  return (
    <foreignObject
      data-shape-id={editingTextShape?.id}
      data-editing-shape-type={editingTextShape?.type}
      x={x}
      y={y}
      height={bounds.height}
      width={bounds.width}
      transform={transform}
    >
      <Textarea
        variant="unstyled"
        ref={inputRef}
        data-editing-textarea="true"
        value={editingText.text ?? ""}
        onChange={onTextChange}
        onBlur={onTextBlur}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          fontSize: `${editingTextShape?.fontSize ?? 16}px`,
          fontFamily: "Arial",
          width: "100%",
          height: "100%",
          border: "none",
          padding: "4px",
          whiteSpace: "pre",
          lineHeight: "normal",
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
      />
    </foreignObject>
  );
}
