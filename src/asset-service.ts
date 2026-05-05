export type AssetKind = 'visual' | 'audio' | 'data' | 'semantic';

export type AssetRole =
  | 'foreground'
  | 'background'
  | 'character'
  | 'prop'
  | 'location'
  | 'fx'
  | 'ui';

export type InterpolationHint = 'linear' | 'bezier' | 'hold';

export interface SpatialAnchor {
  id: string;
  label?: string;
  x: number;
  y: number;
  z?: number;
  tags?: string[];
}

export interface CameraHints {
  defaultFraming?: 'wide' | 'medium' | 'closeup';
  minZoom?: number;
  maxZoom?: number;
  suggestedPanPath?: Array<{ t: number; x: number; y: number }>;
  bounds?: { left: number; top: number; right: number; bottom: number };
}

export interface SafeZones {
  actionSafe?: { left: number; top: number; right: number; bottom: number };
  titleSafe?: { left: number; top: number; right: number; bottom: number };
  customZones?: Array<{
    id: string;
    label?: string;
    polygon: Array<{ x: number; y: number }>;
  }>;
}

export interface AssetCapabilities {
  supportsVariants: boolean;
  appearanceTrackRecommended: boolean;
  supportsTransform: boolean;
  supportsOpacity: boolean;
  supportsTrim: boolean;
  hasSpatialAnchors: boolean;
  hasCameraHints: boolean;
  hasSafeZones: boolean;
  aiGenerationEligible: boolean;
  aiBlockingContext: boolean;
  aiStyleReferenceEligible: boolean;
  defaultInterpolation: InterpolationHint;
  defaultLayerLock: boolean;
  defaultLayerRole?: AssetRole;
}

export interface AssetVariant {
  id: string;
  label: string;
  uri: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export interface AssetMetadata {
  spatialAnchors?: SpatialAnchor[];
  cameraHints?: CameraHints;
  safeZones?: SafeZones;
  [key: string]: unknown;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  role?: AssetRole;
  tags: string[];
  capabilities: AssetCapabilities;
  variants: AssetVariant[];
  defaultVariantId?: string;
  metadata?: AssetMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export type LegacyType = 'sprite' | 'image' | 'background' | 'location';
export type PresetName = 'character' | 'background' | 'prop' | 'location' | 'genericVisual';

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface UiDerivedFlags {
  showTransformChannels: boolean;
  showOpacityChannel: boolean;
  showAppearanceTrack: boolean;
  showAnchorEditor: boolean;
  showCameraHintsEditor: boolean;
  defaultLockLayer: boolean;
  defaultRole: AssetRole;
  aiActions: {
    canGenerate: boolean;
    canUseAsBlockingContext: boolean;
    canUseAsStyleReference: boolean;
  };
}

export interface NewLayerHints {
  initialRole: AssetRole;
  lockOnCreate: boolean;
  addAppearanceTrack: boolean;
  hideTransformChannels: boolean;
  hideOpacityChannel: boolean;
}

export interface CreateAssetInput {
  id: string;
  name: string;
  kind: AssetKind;
  role?: AssetRole;
  tags?: string[];
  variants?: AssetVariant[];
  defaultVariantId?: string;
  metadata?: AssetMetadata;
  capabilities?: Partial<AssetCapabilities>;
}

export interface UpdateAssetInput {
  name?: string;
  role?: AssetRole;
  tags?: string[];
  variants?: AssetVariant[];
  defaultVariantId?: string;
  metadata?: AssetMetadata;
  capabilities?: Partial<AssetCapabilities>;
}

export interface LegacyAsset {
  id: string;
  name: string;
  type: LegacyType;
  variants?: AssetVariant[];
  defaultVariantId?: string;
  tags?: string[];
  metadata?: AssetMetadata;
}

const roleValues: AssetRole[] = ['foreground', 'background', 'character', 'prop', 'location', 'fx', 'ui'];

function nowIso(): string {
  return new Date().toISOString();
}

function baseCapabilities(): AssetCapabilities {
  return {
    supportsVariants: false,
    appearanceTrackRecommended: false,
    supportsTransform: true,
    supportsOpacity: true,
    supportsTrim: false,
    hasSpatialAnchors: false,
    hasCameraHints: false,
    hasSafeZones: false,
    aiGenerationEligible: false,
    aiBlockingContext: false,
    aiStyleReferenceEligible: true,
    defaultInterpolation: 'linear',
    defaultLayerLock: false,
    defaultLayerRole: 'foreground',
  };
}

export function capabilitiesFromPreset(name: PresetName): AssetCapabilities {
  switch (name) {
    case 'character':
      return {
        ...baseCapabilities(),
        supportsVariants: true,
        appearanceTrackRecommended: true,
        aiGenerationEligible: true,
        defaultInterpolation: 'bezier',
        defaultLayerRole: 'character',
      };
    case 'background':
      return {
        ...baseCapabilities(),
        aiGenerationEligible: true,
        aiBlockingContext: true,
        hasCameraHints: true,
        defaultLayerLock: true,
        defaultLayerRole: 'background',
      };
    case 'prop':
      return {
        ...baseCapabilities(),
        defaultLayerRole: 'prop',
      };
    case 'location':
      return {
        ...baseCapabilities(),
        supportsTransform: false,
        supportsOpacity: false,
        hasSpatialAnchors: true,
        hasCameraHints: true,
        hasSafeZones: true,
        aiGenerationEligible: false,
        aiBlockingContext: true,
        aiStyleReferenceEligible: false,
        defaultInterpolation: 'hold',
        defaultLayerLock: true,
        defaultLayerRole: 'location',
      };
    case 'genericVisual':
      return baseCapabilities();
  }
}

export function mapLegacyTypeToPreset(legacyType: LegacyType): PresetName {
  switch (legacyType) {
    case 'sprite':
      return 'character';
    case 'background':
      return 'background';
    case 'location':
      return 'location';
    case 'image':
      return 'genericVisual';
  }
}

export function createAsset(input: CreateAssetInput): Asset {
  const capabilities = { ...baseCapabilities(), ...input.capabilities };
  const asset: Asset = {
    id: input.id,
    name: input.name,
    kind: input.kind,
    role: input.role ?? capabilities.defaultLayerRole ?? 'foreground',
    tags: input.tags ?? [],
    capabilities,
    variants: input.variants ?? [],
    defaultVariantId: input.defaultVariantId,
    metadata: input.metadata,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  assertValidAsset(asset, 'Asset validation failed');
  return asset;
}

export function updateAsset(existing: Asset, patch: UpdateAssetInput): Asset {
  const updated: Asset = {
    ...existing,
    ...patch,
    capabilities: {
      ...existing.capabilities,
      ...patch.capabilities,
    },
    updatedAt: nowIso(),
  };

  assertValidAsset(updated, 'Asset update invalid');
  return updated;
}

export function migrateLegacyAsset(legacy: LegacyAsset): Asset {
  const preset = mapLegacyTypeToPreset(legacy.type);
  const roleByPreset: Record<PresetName, AssetRole> = {
    character: 'character',
    background: 'background',
    prop: 'prop',
    location: 'location',
    genericVisual: 'foreground',
  };
  const kindByPreset: Record<PresetName, AssetKind> = {
    character: 'visual',
    background: 'visual',
    prop: 'visual',
    location: 'semantic',
    genericVisual: 'visual',
  };

  return createAsset({
    id: legacy.id,
    name: legacy.name,
    kind: kindByPreset[preset],
    role: roleByPreset[preset],
    variants: legacy.variants ?? [],
    defaultVariantId: legacy.defaultVariantId,
    tags: legacy.tags ?? [],
    metadata: legacy.metadata,
    capabilities: capabilitiesFromPreset(preset),
  });
}

export function validateAsset(asset: Asset): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!asset.id.trim()) errors.push(issue('ASSET_ID_EMPTY', 'Asset id is required.', 'id', 'error'));
  if (!asset.name.trim()) errors.push(issue('ASSET_NAME_EMPTY', 'Asset name is required.', 'name', 'error'));
  if (asset.role && !roleValues.includes(asset.role)) {
    errors.push(issue('ASSET_ROLE_INVALID', `Invalid role: ${asset.role}`, 'role', 'error'));
  }

  if (asset.capabilities.supportsVariants) {
    if (asset.variants.length === 0) {
      errors.push(issue('VARIANTS_REQUIRED', 'supportsVariants=true requires at least one variant.', 'variants', 'error'));
    }
    if (!asset.defaultVariantId) {
      errors.push(issue('DEFAULT_VARIANT_REQUIRED', 'supportsVariants=true requires defaultVariantId.', 'defaultVariantId', 'error'));
    }
  }

  if (asset.defaultVariantId && !asset.variants.some((variant) => variant.id === asset.defaultVariantId)) {
    errors.push(issue('DEFAULT_VARIANT_NOT_FOUND', `defaultVariantId "${asset.defaultVariantId}" does not exist in variants.`, 'defaultVariantId', 'error'));
  }

  if (asset.capabilities.appearanceTrackRecommended && asset.variants.length < 2) {
    warnings.push(issue('APPEARANCE_TRACK_WITH_FEW_VARIANTS', 'appearanceTrackRecommended=true but fewer than two variants are present.', 'capabilities.appearanceTrackRecommended', 'warning'));
  }

  if (asset.kind === 'semantic' && asset.role === 'location') {
    const hasContextSignal = asset.capabilities.hasSpatialAnchors || asset.capabilities.hasCameraHints || asset.capabilities.hasSafeZones;
    if (!hasContextSignal) {
      errors.push(issue('LOCATION_CONTEXT_MISSING', 'Location assets should enable at least one scene-context capability.', 'capabilities', 'error'));
    }
  }

  for (const [index, anchor] of asset.metadata?.spatialAnchors?.entries() ?? []) {
    if (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) {
      errors.push(issue('ANCHOR_OUT_OF_RANGE', `Anchor "${anchor.id}" must use normalized x/y values.`, `metadata.spatialAnchors[${index}]`, 'error'));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function deriveUiFlags(asset: Asset): UiDerivedFlags {
  const capabilities = asset.capabilities;
  return {
    showTransformChannels: capabilities.supportsTransform,
    showOpacityChannel: capabilities.supportsOpacity,
    showAppearanceTrack: capabilities.supportsVariants || capabilities.appearanceTrackRecommended,
    showAnchorEditor: capabilities.hasSpatialAnchors,
    showCameraHintsEditor: capabilities.hasCameraHints,
    defaultLockLayer: capabilities.defaultLayerLock,
    defaultRole: capabilities.defaultLayerRole ?? 'foreground',
    aiActions: {
      canGenerate: capabilities.aiGenerationEligible,
      canUseAsBlockingContext: capabilities.aiBlockingContext,
      canUseAsStyleReference: capabilities.aiStyleReferenceEligible,
    },
  };
}

export function deriveLayerHints(asset: Asset): NewLayerHints {
  const flags = deriveUiFlags(asset);
  return {
    initialRole: flags.defaultRole,
    lockOnCreate: flags.defaultLockLayer,
    addAppearanceTrack: flags.showAppearanceTrack,
    hideTransformChannels: !flags.showTransformChannels,
    hideOpacityChannel: !flags.showOpacityChannel,
  };
}

function assertValidAsset(asset: Asset, label: string): void {
  const validation = validateAsset(asset);
  if (!validation.valid) {
    const errors = validation.errors.map((error) => `${error.code}: ${error.message}`).join(' | ');
    throw new Error(`${label}: ${errors}`);
  }
}

function issue(code: string, message: string, path: string, severity: 'error' | 'warning'): ValidationIssue {
  return { code, message, path, severity };
}
