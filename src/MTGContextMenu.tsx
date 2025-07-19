import { 
  DefaultContextMenu,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
} from 'tldraw';
import { MTGCardShape } from './shapes/MTGCardShape';
import { Card } from './types/canvas';

interface MTGContextMenuProps {
  addCardToHand?: (cardData: Card) => void;
}

export function MTGContextMenu({ addCardToHand }: MTGContextMenuProps = {}) {
  const editor = useEditor();
  const selectedShapeIds = useValue('selectedShapeIds', () => editor.getSelectedShapeIds(), [editor]);
  
  // Get selected MTG cards
  const selectedMTGCards = selectedShapeIds
    .map(id => editor.getShape(id))
    .filter((shape): shape is MTGCardShape => shape?.type === 'mtg-card');

  const hasMTGCards = selectedMTGCards.length > 0;
  
  // MTG card actions - Tap (toggle between 0° and 90°)
  const tapCard = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);
    
    // Process each card individually to avoid stale state
    for (const cardId of selectedIds) {
      // Get fresh card state from editor
      const card = editor.getShape(cardId) as MTGCardShape;
      if (!card) continue;
      
      const currentRotation = card.rotation;
      console.log('Current rotation:', currentRotation, 'radians =', (currentRotation * 180 / Math.PI), 'degrees');
      
      // Normalize rotation to [0, 2π] range and check if card is tapped
      const normalizedRotation = ((currentRotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      const isTapped = Math.abs(normalizedRotation - Math.PI / 2) < 0.3 || Math.abs(normalizedRotation - (3 * Math.PI / 2)) < 0.3;
      const targetRotation = isTapped ? 0 : Math.PI / 2; // Toggle: tapped → untapped, untapped → tapped
      const deltaRotation = targetRotation - currentRotation;
      
      console.log('Is tapped:', isTapped, 'Target rotation:', targetRotation, 'radians =', (targetRotation * 180 / Math.PI), 'degrees');
      console.log('Delta rotation:', deltaRotation, 'radians =', (deltaRotation * 180 / Math.PI), 'degrees');
      
      // Use rotateShapesBy for proper center rotation and state updates
      editor.rotateShapesBy([cardId], deltaRotation);
    }
    
    // Maintain selection after rotation
    editor.setSelectedShapes(selectedIds);
  };

  const transformCard = () => {
    const updates = selectedMTGCards
      .filter(card => card.props.src.length > 1)
      .map(card => {
        const nextIndex = (card.props.srcIndex + 1) % card.props.src.length;
        return {
          id: card.id,
          type: 'mtg-card' as const,
          props: {
            ...card.props,
            srcIndex: nextIndex,
          },
        };
      });
    
    if (updates.length > 0) {
      editor.updateShapes(updates);
    }
  };

  const copyCard = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.duplicateShapes(selectedIds, { x: 20, y: 20 });
  };

  const sendToHand = () => {
    if (addCardToHand) {
      selectedMTGCards.forEach(card => {
        // Create card data structure for hand
        const cardData = {
          id: Math.random().toString(36).substr(2, 9), // Generate new ID for hand
          name: card.props.cardName || 'Magic Card',
          src: card.props.src,
          srcIndex: card.props.srcIndex || 0,
        };
        addCardToHand(cardData);
      });
    }
    // Remove from canvas
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.deleteShapes(selectedIds);
  };

  const removeFromCanvas = () => {
    // Remove from canvas - matches original "Remove from Canvas" behavior
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.deleteShapes(selectedIds);
  };

  const bringToFront = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.bringToFront(selectedIds);
  };

  const sendToBack = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.sendToBack(selectedIds);
  };

  const hasMultiFaced = selectedMTGCards.some(card => card.props.src.length > 1);

  return (
    <DefaultContextMenu>
      {hasMTGCards && (
        <>
          <TldrawUiMenuGroup id="mtg-card-actions">
            <TldrawUiMenuItem
              id="tap"
              label="Tap"
              icon="rotate-cw"
              onSelect={tapCard}
            />
            <TldrawUiMenuItem
              id="remove-from-canvas"
              label="Remove from Canvas"
              icon="trash-2"
              onSelect={removeFromCanvas}
            />
            <TldrawUiMenuItem
              id="send-to-hand"
              label="Send to Hand"
              icon="arrow-left"
              onSelect={sendToHand}
            />
            <TldrawUiMenuItem
              id="copy"
              label="Copy"
              icon="copy"
              onSelect={copyCard}
            />
            {hasMultiFaced && (
              <TldrawUiMenuItem
                id="transform"
                label="Transform"
                icon="refresh-cw"
                onSelect={transformCard}
              />
            )}
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="mtg-position-actions">
            <TldrawUiMenuItem
              id="bring-to-front"
              label="Bring to front"
              icon="chevron-up"
              onSelect={bringToFront}
            />
            <TldrawUiMenuItem
              id="send-to-back"
              label="Bring to back"
              icon="chevron-down"
              onSelect={sendToBack}
            />
          </TldrawUiMenuGroup>
        </>
      )}
    </DefaultContextMenu>
  );
}