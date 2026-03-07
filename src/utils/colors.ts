export const colors = {
  "#000000": "white",
  "#49A078": "white",
  "#216869": "white",
  "#DCE1DE": "black",
};

export function getContrastColor(hexColor: string) {
  const normalized = hexColor.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "black";
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);

  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 128 ? "black" : "white";
}
