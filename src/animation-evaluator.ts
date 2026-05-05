import { type Asset } from './asset-service.js';
import { type Channel, type ChannelMap, type Interp, type Keyframe, type Layer, type ShotLayerState } from './layer-service.js';

export interface EvaluatedTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface EvaluatedLayerFrame {
  layerId: string;
  assetId?: string;
  visible: boolean;
  zIndex: number;
  world: EvaluatedTransform;
  appearanceVariantId?: string;
}

export interface EvaluateFrameInput {
  frame: number;
  shotLayers: ShotLayerState;
  assetsById: Record<string, Asset>;
}

export interface EvaluateFrameOutput {
  frame: number;
  layers: EvaluatedLayerFrame[];
}

export function evaluateFrame(input: EvaluateFrameInput): EvaluateFrameOutput {
  const activeLayerIds = resolveActiveLayerIds(input.shotLayers);
  const evaluatedLayers: EvaluatedLayerFrame[] = [];

  for (const layerId of activeLayerIds) {
    const layer = input.shotLayers.layersById[layerId];
    if (!layer?.visible) continue;

    const local = evalLocalTransform(layer.channels, input.frame);
    const world = accumulateWorldTransform(input.shotLayers.layersById, layer, local, input.frame);
    const asset = layer.assetId ? input.assetsById[layer.assetId] : undefined;

    evaluatedLayers.push({
      layerId: layer.id,
      assetId: layer.assetId,
      visible: layer.visible,
      zIndex: layer.zIndex,
      world,
      appearanceVariantId: layer.type === 'asset' ? evalAppearance(layer, asset, input.frame) : undefined,
    });
  }

  evaluatedLayers.sort((a, b) => a.zIndex - b.zIndex);
  return { frame: input.frame, layers: evaluatedLayers };
}

function resolveActiveLayerIds(shotLayers: ShotLayerState): string[] {
  const layers = shotLayers.layerIds.map((id) => shotLayers.layersById[id]).filter((layer): layer is Layer => Boolean(layer));
  const soloed = layers.filter((layer) => layer.solo);
  if (soloed.length === 0) return shotLayers.layerIds;

  const allowed = new Set<string>();
  for (const layer of soloed) {
    allowed.add(layer.id);
    let parent = layer.parentGroupId ? shotLayers.layersById[layer.parentGroupId] : undefined;
    while (parent) {
      allowed.add(parent.id);
      parent = parent.parentGroupId ? shotLayers.layersById[parent.parentGroupId] : undefined;
    }
  }

  return shotLayers.layerIds.filter((id) => allowed.has(id));
}

function evalLocalTransform(channels: ChannelMap, frame: number): EvaluatedTransform {
  return {
    x: evalNumericChannel(channels.positionX, frame),
    y: evalNumericChannel(channels.positionY, frame),
    scaleX: evalNumericChannel(channels.scaleX, frame),
    scaleY: evalNumericChannel(channels.scaleY, frame),
    rotation: evalNumericChannel(channels.rotation, frame),
    opacity: clamp(evalNumericChannel(channels.opacity, frame), 0, 100),
  };
}

function evalNumericChannel(channel: Channel<number>, frame: number): number {
  const keys = channel.keyframes;
  if (keys.length === 0) return channel.defaultValue;

  const exact = keys.find((key) => key.frame === frame);
  if (exact) return exact.value;

  const prev = findPrev(keys, frame);
  const next = findNext(keys, frame);

  if (!prev && next) return next.value;
  if (prev && !next) return prev.value;
  if (!prev || !next) return channel.defaultValue;

  const interp = next.interp ?? prev.interp ?? 'linear';
  if (interp === 'hold') return prev.value;

  const t = (frame - prev.frame) / (next.frame - prev.frame);
  return interpolateNumeric(prev, next, t, interp);
}

function evalAppearance(layer: Layer, asset: Asset | undefined, frame: number): string | undefined {
  const keys = layer.channels.appearance.keyframes;
  if (keys.length === 0) return layer.channels.appearance.defaultValue || asset?.defaultVariantId;

  let active: Keyframe<string> | undefined;
  for (const key of keys) {
    if (key.frame <= frame) active = key;
    else break;
  }

  return active?.value ?? layer.channels.appearance.defaultValue ?? asset?.defaultVariantId;
}

function accumulateWorldTransform(
  byId: Record<string, Layer>,
  layer: Layer,
  local: EvaluatedTransform,
  frame: number,
): EvaluatedTransform {
  const chain: Layer[] = [];
  let current: Layer | undefined = layer;

  while (current) {
    chain.push(current);
    current = current.parentGroupId ? byId[current.parentGroupId] : undefined;
  }

  chain.reverse();
  let world: EvaluatedTransform = { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100 };

  for (const node of chain) {
    const nodeLocal = node.id === layer.id ? local : evalLocalTransform(node.channels, frame);
    world = compose(world, nodeLocal);
  }

  return { ...world, opacity: clamp(world.opacity, 0, 100) };
}

function compose(parent: EvaluatedTransform, child: EvaluatedTransform): EvaluatedTransform {
  const parentScaleX = parent.scaleX / 100;
  const parentScaleY = parent.scaleY / 100;
  return {
    x: parent.x + child.x * parentScaleX,
    y: parent.y + child.y * parentScaleY,
    scaleX: parent.scaleX * (child.scaleX / 100),
    scaleY: parent.scaleY * (child.scaleY / 100),
    rotation: parent.rotation + child.rotation,
    opacity: (parent.opacity * child.opacity) / 100,
  };
}

function interpolateNumeric(a: Keyframe<number>, b: Keyframe<number>, t: number, interp: Interp): number {
  switch (interp) {
    case 'linear':
      return lerp(a.value, b.value, t);
    case 'easeIn':
      return lerp(a.value, b.value, t * t);
    case 'easeOut':
      return lerp(a.value, b.value, 1 - (1 - t) * (1 - t));
    case 'easeInOut': {
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      return lerp(a.value, b.value, eased);
    }
    case 'bezier':
      return cubicHermite(a, b, t);
    case 'hold':
      return a.value;
  }
}

function cubicHermite(a: Keyframe<number>, b: Keyframe<number>, t: number): number {
  const dt = Math.max(1, b.frame - a.frame);
  const m0 = a.outTangent ? a.outTangent.dy / Math.max(1e-6, a.outTangent.dx) : (b.value - a.value) / dt;
  const m1 = b.inTangent ? b.inTangent.dy / Math.max(1e-6, b.inTangent.dx) : (b.value - a.value) / dt;
  const t2 = t * t;
  const t3 = t2 * t;

  return (2 * t3 - 3 * t2 + 1) * a.value
    + (t3 - 2 * t2 + t) * (m0 * dt)
    + (-2 * t3 + 3 * t2) * b.value
    + (t3 - t2) * (m1 * dt);
}

function findPrev<T>(keys: Keyframe<T>[], frame: number): Keyframe<T> | undefined {
  let previous: Keyframe<T> | undefined;
  for (const key of keys) {
    if (key.frame < frame) previous = key;
    else break;
  }
  return previous;
}

function findNext<T>(keys: Keyframe<T>[], frame: number): Keyframe<T> | undefined {
  return keys.find((key) => key.frame > frame);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
