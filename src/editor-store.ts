import { type Asset } from './asset-service.js';
import { evaluateFrame, type EvaluateFrameOutput } from './animation-evaluator.js';
import {
  createGroupLayer,
  createLayerFromAsset,
  createShotLayerState,
  reorderLayers,
  setAppearanceAtFrame,
  setNumericAtFrame,
  type ChannelName,
  type Interp,
  type NumericChannelName,
  type ShotLayerState,
  upsertLayer,
} from './layer-service.js';

export interface ShotMeta {
  id: string;
  name: string;
  durationFrames: number;
  fps: number;
}

export interface EditorSelectionState {
  selectedLayerIds: string[];
  selectedChannelNames: ChannelName[];
  selectedKeyIds: string[];
}

export interface EditorUiState {
  playheadFrame: number;
  inFrame: number;
  outFrame: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  snapEnabled: boolean;
  autoKeyEnabled: boolean;
  tool: 'select' | 'pan' | 'path';
  curveEditorOpen: boolean;
}

export interface ShotEditorState {
  shot: ShotMeta;
  assetsById: Record<string, Asset>;
  layers: ShotLayerState;
  selection: EditorSelectionState;
  ui: EditorUiState;
}

export interface RootEditorState {
  byShotId: Record<string, ShotEditorState>;
  activeShotId?: string;
}

export interface AiPatchOp {
  op: 'add_key' | 'update_key' | 'set_variant_key';
  layerId: string;
  channel: ChannelName;
  frame: number;
  value: number | string;
  interp?: Interp;
}

export interface EditorActions {
  initializeShot(input: { shotId: string; name: string; durationFrames: number; fps: number; assetsById?: Record<string, Asset> }): void;
  setActiveShot(shotId: string): void;
  setPlayhead(shotId: string, frame: number): void;
  toggleAutoKey(shotId: string, value?: boolean): void;
  addLayerFromAsset(input: { shotId: string; layerId: string; assetId: string; zIndex?: number; parentGroupId?: string }): void;
  addGroup(input: { shotId: string; groupId: string; name: string; zIndex?: number; parentGroupId?: string }): void;
  setNumericKey(input: { shotId: string; layerId: string; channel: NumericChannelName; frame: number; value: number; interp?: Interp }): void;
  setAppearanceKey(input: { shotId: string; layerId: string; frame: number; variantId: string }): void;
  commitCanvasTransform(input: { shotId: string; layerIds: string[]; frame: number; delta: Partial<Record<'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity', number>>; autoKey?: boolean }): void;
  setLayerOrder(input: { shotId: string; orderedLayerIds: string[] }): void;
  setLayerSelection(input: { shotId: string; layerIds: string[] }): void;
  applyAiPatch(input: { shotId: string; ops: AiPatchOp[] }): void;
  undo(): void;
  redo(): void;
}

export type EditorStore = ReturnType<typeof createEditorStore>;
type Listener = (state: RootEditorState) => void;

export function createEditorStore(initial?: RootEditorState) {
  let state: RootEditorState = initial ?? { byShotId: {} };
  let past: RootEditorState[] = [];
  let future: RootEditorState[] = [];
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  const commit = (producer: (draft: RootEditorState) => RootEditorState) => {
    past = [...past, state];
    future = [];
    state = producer(cloneRoot(state));
    notify();
  };

  const actions: EditorActions = {
    initializeShot(input) {
      commit((draft) => {
        draft.byShotId[input.shotId] = {
          shot: {
            id: input.shotId,
            name: input.name,
            durationFrames: input.durationFrames,
            fps: input.fps,
          },
          assetsById: input.assetsById ?? {},
          layers: createShotLayerState(input.shotId),
          selection: { selectedLayerIds: [], selectedChannelNames: [], selectedKeyIds: [] },
          ui: {
            playheadFrame: 0,
            inFrame: 0,
            outFrame: input.durationFrames,
            isPlaying: false,
            loopEnabled: true,
            snapEnabled: true,
            autoKeyEnabled: true,
            tool: 'select',
            curveEditorOpen: false,
          },
        };
        draft.activeShotId = input.shotId;
        return draft;
      });
    },
    setActiveShot(shotId) {
      commit((draft) => ({ ...draft, activeShotId: shotId }));
    },
    setPlayhead(shotId, frame) {
      commit((draft) => {
        const shot = ensureShot(draft, shotId);
        shot.ui.playheadFrame = clamp(Math.round(frame), 0, shot.shot.durationFrames);
        return draft;
      });
    },
    toggleAutoKey(shotId, value) {
      commit((draft) => {
        const shot = ensureShot(draft, shotId);
        shot.ui.autoKeyEnabled = value ?? !shot.ui.autoKeyEnabled;
        return draft;
      });
    },
    addLayerFromAsset(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        const asset = shot.assetsById[input.assetId];
        if (!asset) return draft;
        const layer = createLayerFromAsset({
          id: input.layerId,
          shotId: input.shotId,
          asset,
          zIndex: input.zIndex ?? nextZIndex(shot.layers),
          parentGroupId: input.parentGroupId,
        });
        shot.layers = upsertLayer(shot.layers, layer);
        shot.selection.selectedLayerIds = [layer.id];
        return draft;
      });
    },
    addGroup(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        const group = createGroupLayer({
          id: input.groupId,
          shotId: input.shotId,
          name: input.name,
          zIndex: input.zIndex ?? nextZIndex(shot.layers),
          parentGroupId: input.parentGroupId,
        });
        shot.layers = upsertLayer(shot.layers, group);
        shot.selection.selectedLayerIds = [group.id];
        return draft;
      });
    },
    setNumericKey(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        const layer = shot.layers.layersById[input.layerId];
        if (!layer || layer.locked) return draft;
        shot.layers = upsertLayer(shot.layers, setNumericAtFrame(layer, input.channel, input.frame, input.value, input.interp));
        return draft;
      });
    },
    setAppearanceKey(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        const layer = shot.layers.layersById[input.layerId];
        if (!layer || layer.locked) return draft;
        shot.layers = upsertLayer(shot.layers, setAppearanceAtFrame(layer, input.frame, input.variantId));
        return draft;
      });
    },
    commitCanvasTransform(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        if (!(input.autoKey ?? shot.ui.autoKeyEnabled)) return draft;
        for (const layerId of input.layerIds) {
          const layer = shot.layers.layersById[layerId];
          if (!layer || layer.locked) continue;
          let next = layer;
          for (const [key, value] of Object.entries(input.delta)) {
            if (typeof value !== 'number') continue;
            next = setNumericAtFrame(next, deltaKeyToChannel(key), input.frame, value, 'linear');
          }
          shot.layers = upsertLayer(shot.layers, next);
        }
        return draft;
      });
    },
    setLayerOrder(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        shot.layers = reorderLayers(shot.layers, input.orderedLayerIds);
        return draft;
      });
    },
    setLayerSelection(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        shot.selection.selectedLayerIds = input.layerIds;
        return draft;
      });
    },
    applyAiPatch(input) {
      commit((draft) => {
        const shot = ensureShot(draft, input.shotId);
        for (const op of input.ops) {
          const layer = shot.layers.layersById[op.layerId];
          if (!layer || layer.locked) continue;
          if (op.op === 'set_variant_key' && typeof op.value === 'string') {
            shot.layers = upsertLayer(shot.layers, setAppearanceAtFrame(layer, op.frame, op.value));
          } else if (op.channel !== 'appearance' && typeof op.value === 'number') {
            shot.layers = upsertLayer(shot.layers, setNumericAtFrame(layer, op.channel, op.frame, op.value, op.interp));
          }
        }
        return draft;
      });
    },
    undo() {
      if (past.length === 0) return;
      future = [state, ...future];
      state = past[past.length - 1];
      past = past.slice(0, -1);
      notify();
    },
    redo() {
      if (future.length === 0) return;
      past = [...past, state];
      state = future[0];
      future = future.slice(1);
      notify();
    },
  };

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    selectActiveShot: () => (state.activeShotId ? state.byShotId[state.activeShotId] : undefined),
    selectEvaluatedActiveFrame: (): EvaluateFrameOutput | undefined => {
      const shot = state.activeShotId ? state.byShotId[state.activeShotId] : undefined;
      if (!shot) return undefined;
      return evaluateFrame({ frame: shot.ui.playheadFrame, shotLayers: shot.layers, assetsById: shot.assetsById });
    },
  };
}

function ensureShot(state: RootEditorState, shotId: string): ShotEditorState {
  const shot = state.byShotId[shotId];
  if (!shot) throw new Error(`Shot ${shotId} has not been initialized.`);
  return shot;
}

function nextZIndex(layers: ShotLayerState): number {
  if (layers.layerIds.length === 0) return 0;
  return Math.max(...layers.layerIds.map((id) => layers.layersById[id].zIndex)) + 1;
}

function deltaKeyToChannel(key: string): NumericChannelName {
  switch (key) {
    case 'x':
      return 'positionX';
    case 'y':
      return 'positionY';
    case 'scaleX':
      return 'scaleX';
    case 'scaleY':
      return 'scaleY';
    case 'rotation':
      return 'rotation';
    case 'opacity':
      return 'opacity';
    default:
      throw new Error(`Unsupported transform delta key: ${key}`);
  }
}

function cloneRoot(state: RootEditorState): RootEditorState {
  return structuredClone(state) as RootEditorState;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
