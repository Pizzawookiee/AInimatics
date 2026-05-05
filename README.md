# AInimatics

AInimatics is an early-stage animatics editor core focused on an After Effects-style MVP: assets become shot layers, layers expose timeline channels, and frames are evaluated deterministically for preview or rendering.

## Is this enough for an initial pull request?

Yes. The current artifacts are enough for an initial architecture pull request because they establish the minimal contracts needed for the rest of the app to build against:

- A capability-based asset model that can represent sprites, still images, backgrounds, locations, and future media without hard-coded legacy asset types.
- Layer and group primitives for an AE-first layer stack, including nested group behavior.
- Keyframe channels for position, scale, rotation, opacity, and appearance/sprite swaps.
- A deterministic frame evaluator suitable for viewer playback and later Remotion handoff.
- A lightweight editor store that demonstrates the intended action flow for manual keyframes, canvas auto-keying, selection, undo/redo, and AI/Codex patch application.
- A short architecture note in `docs/ae-first-mvp-architecture.md` summarizing the design and MVP flow.

This should be treated as a foundation PR rather than a complete product PR. It defines the domain model and runtime primitives, but it does not yet include UI components, persistence, Remotion rendering, spreadsheet import, image generation integration, or automated unit tests.

## Current artifacts

| Artifact | Purpose |
| --- | --- |
| `src/asset-service.ts` | Asset capabilities, presets, validation, legacy migration, UI hints, and layer hints. |
| `src/layer-service.ts` | Layer/group creation, channel defaults, keyframe helpers, parenting, deletion, and ordering. |
| `src/animation-evaluator.ts` | Per-frame evaluation for interpolation, appearance swaps, group transforms, and renderable layer state. |
| `src/editor-store.ts` | Lightweight editor state/actions for shot setup, layer creation, manual keys, auto-key commits, AI patches, and undo/redo. |
| `src/index.ts` | Public barrel exports for the core modules. |
| `docs/ae-first-mvp-architecture.md` | Architectural overview and MVP implementation flow. |
| `docs/ai-agent-app-contract.md` | AI/Codex orchestration flow for resolving saved characters/locations, instantiating layers, generating missing sprites, and applying editable keyframes. |
| `package.json` / `tsconfig.json` | Minimal TypeScript project scaffolding and typecheck command. |

## Quickstart

```bash
npm run typecheck
```

The project currently relies on the TypeScript compiler available in the development environment. If this repository is moved to a clean environment, add TypeScript as a dev dependency before running the typecheck command.

## Minimal usage sketch

```ts
import {
  capabilitiesFromPreset,
  createAsset,
  createEditorStore,
} from './src/index.js';

const hero = createAsset({
  id: 'asset_hero',
  name: 'Hero',
  kind: 'visual',
  role: 'character',
  variants: [
    { id: 'idle', label: 'Idle', uri: '/assets/hero-idle.png' },
    { id: 'talk', label: 'Talk', uri: '/assets/hero-talk.png' },
  ],
  defaultVariantId: 'idle',
  capabilities: capabilitiesFromPreset('character'),
});

const editor = createEditorStore();
editor.actions.initializeShot({
  shotId: 'shot_001',
  name: 'Opening shot',
  durationFrames: 120,
  fps: 24,
  assetsById: { [hero.id]: hero },
});
editor.actions.addLayerFromAsset({
  shotId: 'shot_001',
  layerId: 'layer_hero',
  assetId: hero.id,
});
editor.actions.setNumericKey({
  shotId: 'shot_001',
  layerId: 'layer_hero',
  channel: 'positionX',
  frame: 24,
  value: 300,
});

const frame = editor.selectEvaluatedActiveFrame();
```

## Recommended PR scope

For the initial pull request, keep the scope limited to these foundational contracts and explicitly call out what is intentionally deferred:

1. UI panels and canvas interactions.
2. Persistence/API endpoints.
3. Spreadsheet import.
4. Image generation and Codex tool integration.
5. Remotion composition generation/render jobs.
6. Unit tests for validation, keyframe interpolation, group composition, and store actions.

## Suggested next PRs

1. Add unit tests for `asset-service`, `layer-service`, `animation-evaluator`, and `editor-store`.
2. Add a persistence schema or API contract for assets, shots, layers, channels, and keyframes.
3. Build a minimal timeline/inspector prototype that calls the editor store actions.
4. Add Remotion composition generation from `evaluateFrame()` output.
5. Add Codex/image-generation integration behind patch-based, diffable editor actions.

## AI orchestration

For natural-language prompts such as “make a scene 1280x720 where my uploaded character is sitting in a bar and walks out the door,” the agent should follow the structured contract in `docs/ai-agent-app-contract.md`: query project context, resolve saved assets/locations by role, tags, capabilities, upload provenance, and anchors, instantiate layers through app actions, generate missing variants only when needed, and apply all animation as editable keyframe patches.

For vaguer prompts such as “my character sits in a bar and then walks out the door,” the agent should first expand the request into a reviewable shot plan, infer low-risk defaults, ask for confirmation when identity/location/tone is ambiguous, and then convert each planned shot into the same concrete app operations.
