import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  stopEventPropagation,
} from 'tldraw';

// Define the MTG card shape type
export type MTGCardShape = TLBaseShape<
  'mtg-card',
  {
    w: number;
    h: number;
    src: string[];      // Array of image URLs for multi-faced cards
    srcIndex: number;   // Current face index
    isFlipped: boolean; // Card flip state
    cardName?: string;  // Card name for identification
  }
>;

// MTG card shape utility
export class MTGCardShapeUtil extends BaseBoxShapeUtil<MTGCardShape> {
  static override type = 'mtg-card' as const;

  // Canvas card preview methods
  showCanvasCardPreview(cardSrc: string) {
    // Check if Ctrl is pressed
    const isCtrlPressed = (window as any).isCtrlPressed || false;
    if (!isCtrlPressed || !cardSrc) return;

    // Find or create the zoomed card preview element
    let preview = document.getElementById('canvas-card-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'canvas-card-preview';
      preview.style.cssText = `
        display: none;
        position: fixed;
        bottom: 160px;
        right: 20px;
        height: 400px;
        width: 280px;
        border: 2px solid black;
        background-color: white;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        pointer-events: none;
      `;
      
      const img = document.createElement('img');
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;
      preview.appendChild(img);
      document.body.appendChild(preview);
    }

    const img = preview.querySelector('img') as HTMLImageElement;
    if (img) {
      img.src = cardSrc;
      preview.style.display = 'block';
    }
  }

  hideCanvasCardPreview() {
    const preview = document.getElementById('canvas-card-preview');
    if (preview) {
      preview.style.display = 'none';
    }
  }

  // Default card dimensions (typical Magic card aspect ratio)
  getDefaultProps(): MTGCardShape['props'] {
    return {
      w: 180,
      h: 251, // Standard Magic card ratio is ~0.717
      src: [],
      srcIndex: 0,
      isFlipped: false,
      cardName: '',
    };
  }

  // We'll implement rotation handling later

  // Render the card component
  component(shape: MTGCardShape) {
    const { w, h, src, srcIndex, isFlipped } = shape.props;
    
    // Get current card image
    const currentSrc = src[srcIndex] || '';
    
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            transform: isFlipped ? 'scaleX(-1)' : 'none',
            transition: 'transform 0.2s ease',
          }}
          onDoubleClick={(e) => {
            stopEventPropagation(e);
            // Handle double-click to flip card
            this.editor.updateShape({
              id: shape.id,
              type: 'mtg-card',
              props: {
                ...shape.props,
                isFlipped: !isFlipped,
              },
            });
          }}
          onContextMenu={(e) => {
            stopEventPropagation(e);
            // Let tldraw handle the context menu
          }}
          onMouseEnter={() => {
            // Show zoomed preview for canvas cards
            this.showCanvasCardPreview(currentSrc);
          }}
          onMouseLeave={() => {
            // Hide zoomed preview for canvas cards
            this.hideCanvasCardPreview();
          }}
        >
          {currentSrc ? (
            <img
              src={currentSrc}
              alt={shape.props.cardName || 'Magic Card'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              draggable={false}
            />
          ) : (
            // Placeholder when no image is available
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#f0f0f0',
                border: '2px dashed #ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              {shape.props.cardName || 'Card Image'}
            </div>
          )}

          {/* Multi-faced card indicator */}
          {src.length > 1 && (
            <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              stopEventPropagation(e);
              // Cycle through card faces
              const nextIndex = (srcIndex + 1) % src.length;
              this.editor.updateShape({
                id: shape.id,
                type: 'mtg-card',
                props: {
                  ...shape.props,
                  srcIndex: nextIndex,
                },
              });
            }}
          >
              {srcIndex + 1}/{src.length}
            </div>
          )}

          {/* Tap indicator - check tldraw's rotation */}
          {Math.abs(shape.rotation) > 0.7 && (
            <div
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '4px',
              backgroundColor: 'rgba(255,193,7,0.9)',
              color: 'black',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 'bold',
            }}
          >
              TAPPED
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  // Render selection indicator (tldraw handles rotation automatically)
  indicator(shape: MTGCardShape) {
    const { w, h } = shape.props;
    return (
      <rect
        width={w}
        height={h}
        rx={12}
        ry={12}
        fill="none"
        stroke="var(--color-selection-stroke)"
        strokeWidth="2"
        strokeDasharray="4 2"
      />
    );
  }
}