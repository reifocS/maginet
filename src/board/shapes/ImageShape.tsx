import { Shape as ShapeType } from "../../types/canvas";
import CounterOverlay from "./CounterOverlay";

const ImageShape = ({
  shape,
  commonProps,
  transform,
  readOnly,
}: {
  shape: ShapeType;
  commonProps: React.SVGProps<SVGGElement>;
  transform: string;
  readOnly: boolean;
}) => {
  const { point, size, src, srcIndex, isFlipped } = shape;
  const [x, y] = point;
  const [width, height] = size;

  return (
    <g {...commonProps}>
      <image
        className="card-image"
        href={isFlipped ? "https://i.imgur.com/LdOBU1I.jpeg" : src?.[srcIndex]}
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          opacity: readOnly ? 0.7 : 1,
          transition: 'opacity 0.2s ease',
        }}
        transform={transform}
      />
      <CounterOverlay shape={shape} transform={transform} />
    </g>
  );
};

export default ImageShape;
