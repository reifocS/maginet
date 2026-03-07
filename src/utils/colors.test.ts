import { describe, expect, it } from "vitest";
import { getContrastColor } from "./colors";

describe("getContrastColor", () => {
  it("uses white text on dark colors", () => {
    expect(getContrastColor("#000000")).toBe("white");
    expect(getContrastColor("#216869")).toBe("white");
  });

  it("uses black text on light colors", () => {
    expect(getContrastColor("#FFFFFF")).toBe("black");
    expect(getContrastColor("#DCE1DE")).toBe("black");
  });

  it("falls back safely for invalid input", () => {
    expect(getContrastColor("not-a-color")).toBe("black");
  });
});

