import { Camera } from "../Canvas";
import vec from "./vec";

export function panCamera(camera: Camera, dx: number, dy: number): Camera {
  return {
    x: camera.x - dx / camera.z,
    y: camera.y - dy / camera.z,
    z: camera.z,
  };
}

export function getCameraZoom(zoom: number): number {
  return vec.clamp(zoom, 0.5, 10);
}

export function zoomCamera(
  camera: Camera,
  point: number[],
  dz: number
): Camera {
  const next = camera.z - (dz / 50) * camera.z;
  const p0 = screenToWorld(point, camera);
  camera.z = getCameraZoom(next);
  const p1 = screenToWorld(point, camera);
  const { x, y } = camera;
  const newPoint = vec.add([x, y], vec.sub(p1, p0));
  camera.x = newPoint[0];
  camera.y = newPoint[1];

  return { ...camera };
}
export function screenToWorld(point: number[], camera: Camera): number[] {
  return vec.sub(vec.div(point, camera.z), [camera.x, camera.y]);
}
let canvas: HTMLCanvasElement;
/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
export function getTextWidth(text: string, font: string) {
  // re-use canvas object for better performance
  canvas = canvas || document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 0;
  context.font = font;
  const metrics = context.measureText(text);
  return metrics.width;
}
if (document.getElementById("__textMeasure")) {
  document.getElementById("__textMeasure")!.remove();
}
// A div used for measurement
const mdiv = document.createElement("pre");
mdiv.id = "__textMeasure";

Object.assign(mdiv.style, {
  whiteSpace: "pre",
  width: "auto",
  border: "1px solid red",
  padding: "4px",
  margin: "0px",
  opacity: "0",
  position: "absolute",
  top: "-500px",
  left: "0px",
  zIndex: "9999",
});

mdiv.tabIndex = -1;

document.body.appendChild(mdiv);

export const getBounds = (
  text: string,
  x: number,
  y: number,
  fontSize?: number
) => {
  mdiv.innerHTML = text || " "; // + '&nbsp;'
  mdiv.style.font = `${fontSize || 16}px Arial`;
  mdiv.innerHTML = text + "&zwj;";

  const [minX, minY] = [x, y];
  const [width, height] = [mdiv.offsetWidth, mdiv.offsetHeight];
  return {
    minX,
    maxX: minX + width,
    minY,
    maxY: minY + height,
    width,
    height,
  };
};
