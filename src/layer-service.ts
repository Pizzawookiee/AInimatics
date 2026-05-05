import { type Asset, type AssetRole, deriveLayerHints } from './asset-service.js';

export type ChannelName =
  | 'positionX'
  | 'positionY'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'appearance';

export type NumericChannelName = Exclude<ChannelName, 'appearance'>;
export type Interp = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier' | 'hold';

export interface Keyframe<T = number | string> {
  id: string;
  frame: number;
  value: T;
  interp?: Interp;
  inTangent?: { dx: number; dy: number };
  outTangent?: { dx: number; dy: number };
}

export interface Channel<T = number | string> {
  name: ChannelName;
  defaultValue: T;
  keyframes: Keyframe<T>[];
}

export interface ChannelMap {
  positionX: Channel<number>;
  positionY: Channel<number>;
  scaleX: Channel<number>;
  scaleY: Channel<number>;
  rotation: Channel<number>;
  opacity: Channel<number>;
  appearance: Channel<string>;
}

export type LayerType = 'asset' | 'group';

export interface Layer {
  id: string;
  shotId: string;
  name: string;
  type: LayerType;
  assetId?: string;
  parentGroupId?: string;
  role?: AssetRole;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  colorTag?: string;
  channels: ChannelMap;
  uiHints: {
    hideTransformChannels: boolean;
    hideOpacityChannel: boolean;
    showAppearanceTrack: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ShotLayerState {
  shotId: string;
  layerIds: string[];
  layersById: Record<string, Layer>;
}

export interface CreateLayerInput {
  id: string;
  shotId: string;
  asset: Asset;
  name?: string;
  zIndex: number;
  parentGroupId?: string;
}

export interface CreateGroupInput {
  id: string;
  shotId: string;
  name: string;
  zIndex: number;
  parentGroupId?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mkKeyId(prefix: string, frame: number): string {
  return `${prefix}_k_${frame}_${Math.random().toString(36).slice(2, 8)}`;
}

function numericChannel(name: NumericChannelName, defaultValue: number): Channel<number> {
  return { name, defaultValue, keyframes: [] };
}

export function createEmptyChannels(defaultVariantId = ''): ChannelMap {
  return {
    positionX: numericChannel('positionX', 0),
    positionY: numericChannel('positionY', 0),
    scaleX: numericChannel('scaleX', 100),
    scaleY: numericChannel('scaleY', 100),
    rotation: numericChannel('rotation', 0),
    opacity: numericChannel('opacity', 100),
    appearance: { name: 'appearance', defaultValue: defaultVariantId, keyframes: [] },
  };
}

export function createShotLayerState(shotId: string): ShotLayerState {
  return { shotId, layerIds: [], layersById: {} };
}

export function createLayerFromAsset(input: CreateLayerInput): Layer {
  const hints = deriveLayerHints(input.asset);
  return {
    id: input.id,
    shotId: input.shotId,
    name: input.name ?? input.asset.name,
    type: 'asset',
    assetId: input.asset.id,
    parentGroupId: input.parentGroupId,
    role: hints.initialRole,
    zIndex: input.zIndex,
    visible: true,
    locked: hints.lockOnCreate,
    solo: false,
    channels: createEmptyChannels(input.asset.defaultVariantId),
    uiHints: {
      hideTransformChannels: hints.hideTransformChannels,
      hideOpacityChannel: hints.hideOpacityChannel,
      showAppearanceTrack: hints.addAppearanceTrack,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function createGroupLayer(input: CreateGroupInput): Layer {
  return {
    id: input.id,
    shotId: input.shotId,
    name: input.name,
    type: 'group',
    parentGroupId: input.parentGroupId,
    role: 'foreground',
    zIndex: input.zIndex,
    visible: true,
    locked: false,
    solo: false,
    channels: createEmptyChannels(),
    uiHints: {
      hideTransformChannels: false,
      hideOpacityChannel: false,
      showAppearanceTrack: false,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function upsertLayer(state: ShotLayerState, layer: Layer): ShotLayerState {
  const exists = Boolean(state.layersById[layer.id]);
  return {
    ...state,
    layerIds: exists ? state.layerIds : [...state.layerIds, layer.id],
    layersById: { ...state.layersById, [layer.id]: layer },
  };
}

export function deleteLayer(state: ShotLayerState, layerId: string): ShotLayerState {
  const layer = state.layersById[layerId];
  if (!layer) return state;

  const toDelete = new Set<string>([layerId]);
  if (layer.type === 'group') {
    for (const id of state.layerIds) {
      if (isDescendantOf(state.layersById, state.layersById[id], layerId)) toDelete.add(id);
    }
  }

  const nextById = { ...state.layersById };
  for (const id of toDelete) delete nextById[id];

  return {
    ...state,
    layerIds: state.layerIds.filter((id) => !toDelete.has(id)),
    layersById: nextById,
  };
}

export function setLayerParent(state: ShotLayerState, layerId: string, parentGroupId?: string): ShotLayerState {
  const layer = state.layersById[layerId];
  if (!layer) return state;
  if (parentGroupId && state.layersById[parentGroupId]?.type !== 'group') return state;

  return upsertLayer(state, { ...layer, parentGroupId, updatedAt: nowIso() });
}

export function reorderLayers(state: ShotLayerState, orderedLayerIds: string[]): ShotLayerState {
  const nextById = { ...state.layersById };
  const filteredIds = orderedLayerIds.filter((id) => Boolean(nextById[id]));
  filteredIds.forEach((id, index) => {
    nextById[id] = { ...nextById[id], zIndex: index, updatedAt: nowIso() };
  });
  return { ...state, layerIds: filteredIds, layersById: nextById };
}

export function addOrUpdateKey<T extends number | string>(channel: Channel<T>, key: Keyframe<T>): Channel<T> {
  const existingIndex = channel.keyframes.findIndex((candidate) => candidate.frame === key.frame);
  const next = [...channel.keyframes];

  if (existingIndex >= 0) next[existingIndex] = { ...next[existingIndex], ...key };
  else next.push(key);

  next.sort((a, b) => a.frame - b.frame);
  return { ...channel, keyframes: next };
}

export function setNumericAtFrame(
  layer: Layer,
  channelName: NumericChannelName,
  frame: number,
  value: number,
  interp: Interp = 'linear',
): Layer {
  const channel = layer.channels[channelName];
  const updatedChannel = addOrUpdateKey(channel, {
    id: mkKeyId(channelName, frame),
    frame,
    value,
    interp,
  });

  return {
    ...layer,
    channels: { ...layer.channels, [channelName]: updatedChannel },
    updatedAt: nowIso(),
  };
}

export function setAppearanceAtFrame(layer: Layer, frame: number, variantId: string): Layer {
  const updatedChannel = addOrUpdateKey(layer.channels.appearance, {
    id: mkKeyId('appearance', frame),
    frame,
    value: variantId,
    interp: 'hold',
  });

  return {
    ...layer,
    channels: { ...layer.channels, appearance: updatedChannel },
    updatedAt: nowIso(),
  };
}

function isDescendantOf(byId: Record<string, Layer>, layer: Layer | undefined, ancestorGroupId: string): boolean {
  let current = layer;
  while (current?.parentGroupId) {
    if (current.parentGroupId === ancestorGroupId) return true;
    current = byId[current.parentGroupId];
  }
  return false;
}
