import { describe, expect, it } from "vitest";
import { Shape } from "../../types/canvas";
import {
  getResolvedShapePropertyValue,
  getShapePropertyDefinitions,
  inferPropertyEditorKind,
  normalizeHexColor,
} from "./propertiesPanelFields";

describe("propertiesPanelFields", () => {
  it("exposes specialized editable fields for shape types", () => {
    const shape: Shape = {
      id: "shape-1",
      type: "rectangle",
      point: [12, 24],
      size: [120, 80],
      srcIndex: 0,
    };

    expect(getShapePropertyDefinitions(shape)).toEqual([
      {
        key: "point",
        label: "Position",
        fixedLength: 2,
        listLabels: ["X", "Y"],
      },
      {
        key: "size",
        label: "Size",
        fixedLength: 2,
        listLabels: ["W", "H"],
      },
      { key: "rotation", label: "Rotation" },
      { key: "color", label: "Color" },
    ]);
  });

  it("resolves editor kinds from property values", () => {
    expect(inferPropertyEditorKind("point", [10, 20])).toBe("list");
    expect(inferPropertyEditorKind("fontSize", 16)).toBe("number");
    expect(inferPropertyEditorKind("isFlipped", true)).toBe("boolean");
    expect(inferPropertyEditorKind("color", "#FFAA00")).toBe("color");
    expect(inferPropertyEditorKind("text", "Hello")).toBe("multiline");
  });

  it("returns rendered defaults for optional shape properties", () => {
    const token: Shape = {
      id: "token-1",
      type: "token",
      point: [0, 0],
      size: [55, 55],
      srcIndex: 0,
      text: "+1/+1",
    };

    expect(getResolvedShapePropertyValue(token, "color")).toBe("#DCE1DE");
    expect(getResolvedShapePropertyValue(token, "fontSize")).toBe(12);
    expect(getResolvedShapePropertyValue(token, "rotation")).toBe(0);
  });

  it("normalizes hex input for the color field", () => {
    expect(normalizeHexColor("ffaa00", "#000000")).toBe("#FFAA00");
    expect(normalizeHexColor("#00ff99", "#000000")).toBe("#00FF99");
    expect(normalizeHexColor("not-a-color", "#123456")).toBe("#123456");
  });
});

