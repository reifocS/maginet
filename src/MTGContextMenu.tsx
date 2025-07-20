import {
  DefaultContextMenu,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  TLImageShape,
  AssetRecordType,
} from 'tldraw';
import { Card } from './types/canvas';

interface MTGContextMenuProps {
  addCardToHand?: (cardData: Card) => void;
  sendToTopOfDeck?: (cardData: Card) => void;
  sendToBottomOfDeck?: (cardData: Card) => void;
}

export function MTGContextMenu({ addCardToHand, sendToTopOfDeck, sendToBottomOfDeck }: MTGContextMenuProps = {}) {
  const editor = useEditor();
  const selectedShapeIds = useValue('selectedShapeIds', () => editor.getSelectedShapeIds(), [editor]);

  // Get selected MTG cards (now image shapes with MTG metadata)
  const selectedMTGCards = selectedShapeIds
    .map(id => editor.getShape(id))
    .filter((shape): shape is TLImageShape =>
      shape?.type === 'image' && shape.meta?.isMTGCard === true
    );

  const hasMTGCards = selectedMTGCards.length > 0;

  // MTG card actions - Tap (toggle between 0° and 90°)
  const tapCard = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);

    // Process each card individually to avoid stale state
    for (const cardId of selectedIds) {
      // Get fresh card state from editor
      const card = editor.getShape(cardId) as TLImageShape;
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
    // Transform multi-faced cards by updating assets and shape metadata
    selectedMTGCards.forEach(card => {
      const cardSrc = card.meta?.cardSrc as string[] || [];
      const currentIndex = (card.meta?.cardSrcIndex as number) || 0;

      if (cardSrc.length > 1) {
        const nextIndex = (currentIndex + 1) % cardSrc.length;
        const nextImageUrl = cardSrc[nextIndex];

        // Create new asset for the new face
        const assetId = AssetRecordType.createId();

        editor.createAssets([
          {
            id: assetId,
            type: 'image',
            typeName: 'asset',
            props: {
              name: card.meta?.cardName as string || 'Magic Card',
              src: nextImageUrl,
              w: 180,
              h: 251,
              mimeType: 'image/jpeg',
              isAnimated: false,
            },
            meta: {},
          },
        ]);

        // Update the shape with new asset and metadata
        editor.updateShape({
          id: card.id,
          type: 'image',
          props: {
            ...card.props,
            assetId: assetId,
          },
          meta: {
            ...card.meta,
            cardSrcIndex: nextIndex,
          },
        });
      }
    });
  };

  const copyCard = () => {
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.duplicateShapes(selectedIds, { x: 20, y: 20 });
  };


  const sendToHand = () => {
    if (addCardToHand) {
      selectedMTGCards.forEach(card => {
        // Create card data structure for hand using metadata
        const cardData = {
          id: Math.random().toString(36).substr(2, 9), // Generate new ID for hand
          name: (card.meta?.cardName as string) || 'Magic Card',
          src: (card.meta?.cardSrc as string[]) || [],
          srcIndex: (card.meta?.cardSrcIndex as number) || 0,
        };
        addCardToHand(cardData);
      });
    }
    // Remove from canvas
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.deleteShapes(selectedIds);
  };

  const sendToTopOfDeckAction = () => {
    if (sendToTopOfDeck) {
      selectedMTGCards.forEach(card => {
        // Create card data structure using metadata
        const cardData = {
          id: Math.random().toString(36).substr(2, 9), // Generate new ID
          name: (card.meta?.cardName as string) || 'Magic Card',
          src: (card.meta?.cardSrc as string[]) || [],
          srcIndex: (card.meta?.cardSrcIndex as number) || 0,
        };
        sendToTopOfDeck(cardData);
      });
    }
    // Remove from canvas
    const selectedIds = selectedMTGCards.map(card => card.id);
    editor.deleteShapes(selectedIds);
  };

  const sendToBottomOfDeckAction = () => {
    if (sendToBottomOfDeck) {
      selectedMTGCards.forEach(card => {
        // Create card data structure using metadata
        const cardData = {
          id: Math.random().toString(36).substr(2, 9), // Generate new ID
          name: (card.meta?.cardName as string) || 'Magic Card',
          src: (card.meta?.cardSrc as string[]) || [],
          srcIndex: (card.meta?.cardSrcIndex as number) || 0,
        };
        sendToBottomOfDeck(cardData);
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

  const hasMultiFaced = selectedMTGCards.some(card => {
    const cardSrc = card.meta?.cardSrc as string[] || [];
    return cardSrc.length > 1;
  });

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
              id="send-to-top-of-deck"
              label="Send to Top of Deck"
              icon="arrow-up"
              onSelect={sendToTopOfDeckAction}
            />
            <TldrawUiMenuItem
              id="send-to-bottom-of-deck"
              label="Send to Bottom of Deck"
              icon="arrow-down"
              onSelect={sendToBottomOfDeckAction}
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