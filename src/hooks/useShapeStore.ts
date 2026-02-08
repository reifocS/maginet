import { create } from "zustand";
import { Card, Counter, Shape, rotateShape, flipShape } from "../types/canvas";
import { generateId } from "../utils/math";
import vec from "../utils/vec";

interface HistoryEntry {
  shapes: Shape[];
  selectedShapeIds: string[];
  timestamp: number;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface ShapeStore {
  shapes: Shape[];
  selectedShapeIds: string[];
  shapeInCreation: { shape: Shape; origin: number[] } | null;
  editingText: { id: string; text: string } | null;
  history: HistoryState;
  canUndo: boolean;
  canRedo: boolean;
  isDraggingShape: boolean;
  isResizingShape: boolean;
  isRotatingShape: boolean;
  setShapes: (shapes: Shape[] | ((shapes: Shape[]) => Shape[])) => void;
  addShape: (shape: Shape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  deleteShape: (id: string) => void;
  setSelectedShapeIds: (ids: string[]) => void;
  setShapeInCreation: (
    shapeInCreation: { shape: Shape; origin: number[] } | null
  ) => void;
  setEditingText: (editingText: { id: string; text: string } | null) => void;
  createShape: (type: Shape["type"], point: number[]) => void;
  updateShapeInCreation: (point: number[]) => void;
  flipSelectedShapes: () => void;
  rotateSelectedShapes: (angle: number) => void;
  engageSelected: () => void;
  tapShape: (id: string) => void;
  untapAll: () => void;
  copySelected: () => void;
  updateCountersOnSelected: (counters: Counter[]) => void;
  clearCountersOnSelected: () => void;
  changeColorOnSelected: (color: string) => void;
  sendSelectedToBack: () => void;
  sendSelectedToFront: () => void;
  increaseSrcIndexOnSelected: () => void;
  removeSelectedImages: () => Card[];
  getSelectedImages: () => Card[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  shouldSkipHistory: () => boolean;
}

export const useShapeStore = create<ShapeStore>((set, get) => ({
  shapes: [],
  selectedShapeIds: [],
  shapeInCreation: null,
  editingText: null,
  selectionRect: null,
  history: {
    past: [],
    future: [],
  },
  canUndo: false,
  canRedo: false,
  isDraggingShape: false,
  isResizingShape: false,
  isRotatingShape: false,
  shouldSkipHistory: () => {
    const state = get();
    return (
      state.isDraggingShape ||
      state.isResizingShape ||
      state.isRotatingShape ||
      state.editingText !== null
    );
  },
  setShapes: (shapes) => {
    // Push history before updating shapes, unless we're in the middle of an operation
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }

    if (typeof shapes === "function") {
      set((state) => ({ shapes: shapes(state.shapes) }));
    } else {
      set({ shapes });
    }
  },
  addShape: (shape) => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({ shapes: [...state.shapes, shape] }));
  },
  updateShape: (id, updates) =>
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        shape.id === id ? { ...shape, ...updates } : shape
      ),
    })),
  deleteShape: (id) => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.filter((shape) => shape.id !== id),
    }));
  },
  setSelectedShapeIds: (ids) => set({ selectedShapeIds: ids }),
  setShapeInCreation: (shapeInCreation) => set({ shapeInCreation }),
  setEditingText: (editingText) => set({ editingText }),
  createShape: (type, point) =>
    set(() => ({
      shapeInCreation: {
        shape: {
          id: generateId(),
          point,
          size: [0, 0],
          type,
          srcIndex: 0,
        },
        origin: point,
      },
    })),
  updateShapeInCreation: (point) =>
    set((state) => {
      if (!state.shapeInCreation) return {};
      const delta = vec.sub(point, state.shapeInCreation.origin);
      return {
        shapeInCreation: {
          ...state.shapeInCreation,
          shape: {
            ...state.shapeInCreation.shape,
            size: delta,
          },
        },
      };
    }),
  flipSelectedShapes: () => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id)
          ? flipShape(shape)
          : shape
      ),
    }));
  },
  rotateSelectedShapes: (angle) => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id)
          ? { ...shape, rotation: (shape.rotation || 0) + angle }
          : shape
      ),
    }));
  },
  engageSelected: () => {
    const { selectedShapeIds } = get();
    if (selectedShapeIds.length === 0) return;
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id) &&
          (shape.type === "image" || shape.type === "rectangle")
          ? shape.rotation !== 0
            ? rotateShape(shape, -90)
            : rotateShape(shape, 90)
          : shape
      ),
    }));
  },
  tapShape: (id) => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) => {
        if (shape.id === id && shape.type === "image") {
          const currentRotation = shape.rotation || 0;
          return { ...shape, rotation: currentRotation === 90 ? 0 : 90 };
        }
        return shape;
      }),
    }));
  },
  untapAll: () => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        (shape.type === "image" || shape.type === "rectangle") && shape.rotation
          ? { ...shape, rotation: 0 }
          : shape
      ),
    }));
  },
  copySelected: () => {
    const { shapes, selectedShapeIds } = get();
    if (selectedShapeIds.length === 0) return;
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    const copies = shapes
      .filter((shape) => selectedShapeIds.includes(shape.id))
      .map((shape) => ({
        ...shape,
        id: generateId(),
        point: [shape.point[0] + 100, shape.point[1] + 100],
      }));
    set((state) => ({ shapes: [...state.shapes, ...copies] }));
  },
  updateCountersOnSelected: (counters) => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id) && shape.type === "image"
          ? { ...shape, counters }
          : shape
      ),
    }));
  },
  clearCountersOnSelected: () => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id) && shape.type === "image"
          ? { ...shape, counters: [] }
          : shape
      ),
    }));
  },
  changeColorOnSelected: (color) => {
    const { selectedShapeIds } = get();
    if (selectedShapeIds.length !== 1) return;
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id) ? { ...shape, color } : shape
      ),
    }));
  },
  sendSelectedToBack: () => {
    const { shapes, selectedShapeIds } = get();
    if (selectedShapeIds.length === 0) return;
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    const selected = shapes.filter((s) => selectedShapeIds.includes(s.id));
    const rest = shapes.filter((s) => !selectedShapeIds.includes(s.id));
    set({ shapes: [...selected, ...rest], selectedShapeIds: [] });
  },
  sendSelectedToFront: () => {
    const { shapes, selectedShapeIds } = get();
    if (selectedShapeIds.length === 0) return;
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    const selected = shapes.filter((s) => selectedShapeIds.includes(s.id));
    const rest = shapes.filter((s) => !selectedShapeIds.includes(s.id));
    set({ shapes: [...rest, ...selected], selectedShapeIds: [] });
  },
  increaseSrcIndexOnSelected: () => {
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.map((shape) =>
        state.selectedShapeIds.includes(shape.id) && shape.type === "image"
          ? { ...shape, srcIndex: (shape.srcIndex + 1) % (shape.src?.length ?? 1) }
          : shape
      ),
    }));
  },
  removeSelectedImages: () => {
    const { shapes, selectedShapeIds } = get();
    const removed: Card[] = shapes
      .filter((s) => selectedShapeIds.includes(s.id) && s.type === "image")
      .map((s) => ({ id: s.id, src: s.src as string[], srcIndex: s.srcIndex }));
    if (!get().shouldSkipHistory()) {
      get().pushHistory();
    }
    set((state) => ({
      shapes: state.shapes.filter(
        (s) => !(s.type === "image" && selectedShapeIds.includes(s.id))
      ),
      selectedShapeIds: [],
    }));
    return removed;
  },
  getSelectedImages: () => {
    const { shapes, selectedShapeIds } = get();
    return shapes
      .filter((s) => selectedShapeIds.includes(s.id) && s.type === "image")
      .map((s) => ({ id: s.id, src: s.src as string[], srcIndex: s.srcIndex }));
  },
  pushHistory: () => {
    // Skip if in the middle of an operation
    if (get().shouldSkipHistory()) {
      return;
    }

    const state = get();

    const entry: HistoryEntry = {
      shapes: structuredClone(state.shapes),
      selectedShapeIds: [...state.selectedShapeIds],
      timestamp: Date.now(),
    };

    set((state) => ({
      history: {
        past: [...state.history.past, entry].slice(-50), // Keep last 50
        future: [], // Clear redo stack on new action
      },
      canUndo: true,
      canRedo: false,
    }));
  },
  undo: () => {
    const state = get();
    if (state.history.past.length === 0) return;

    // Save current state to future
    const current: HistoryEntry = {
      shapes: structuredClone(state.shapes),
      selectedShapeIds: [...state.selectedShapeIds],
      timestamp: Date.now(),
    };

    // Pop from past
    const previous = state.history.past[state.history.past.length - 1];
    const newPast = state.history.past.slice(0, -1);

    // Update state
    set({
      shapes: previous.shapes,
      selectedShapeIds: previous.selectedShapeIds,
      history: {
        past: newPast,
        future: [current, ...state.history.future],
      },
      canUndo: newPast.length > 0,
      canRedo: true,
    });
  },
  redo: () => {
    const state = get();
    if (state.history.future.length === 0) return;

    // Save current state to past
    const current: HistoryEntry = {
      shapes: structuredClone(state.shapes),
      selectedShapeIds: [...state.selectedShapeIds],
      timestamp: Date.now(),
    };

    // Pop from future
    const next = state.history.future[0];
    const newFuture = state.history.future.slice(1);

    // Update state
    set({
      shapes: next.shapes,
      selectedShapeIds: next.selectedShapeIds,
      history: {
        past: [...state.history.past, current],
        future: newFuture,
      },
      canUndo: true,
      canRedo: newFuture.length > 0,
    });
  },
  clearHistory: () => {
    set({
      history: {
        past: [],
        future: [],
      },
      canUndo: false,
      canRedo: false,
    });
  },
}));
