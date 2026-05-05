# AInimatics

AInimatics is an early-stage foundation for an AI-assisted animatics editor. The goal is to help creators turn shot lists, uploaded assets, generated sprites, and natural-language direction into editable animatic scenes.

The current repository contains the TypeScript core for an After Effects-style MVP. It does **not** include a graphical web app yet; it provides the asset, layer, keyframe, evaluator, and editor-store contracts that the app UI, persistence layer, Remotion renderer, and AI integrations will build on.

## Planned product features

- **Shot-based animatics workflow**: create scenes and shots that can later be edited in a layer stack and timeline.
- **Asset library**: represent uploaded images, generated sprites, backgrounds, props, characters, and semantic locations with capability flags.
- **Manual keyframe animation**: animate position, scale, rotation, opacity, and appearance/sprite swaps as editable timeline channels.
- **Layer stack and groups**: instantiate assets as shot layers and group nested layers for AE-style composition behavior.
- **AI-assisted drafting**: allow AI/Codex workflows to resolve saved characters/locations, create shot plans, generate missing sprites, and apply editable keyframes.
- **Render handoff foundation**: evaluate frames deterministically so preview and future Remotion rendering can consume the same shot state.

## What is implemented now

- Capability-based asset modeling and presets.
- Layer and group creation helpers.
- Keyframe channels for transform, opacity, and appearance.
- Numeric interpolation and stepped appearance evaluation.
- Group transform/opacity inheritance.
- A lightweight editor store for initializing shots, adding layers, applying manual or AI-generated keyframes, and evaluating the active frame.
- Architecture and AI orchestration documentation under `docs/`.

## Getting started

### Prerequisites

- Node.js 22 or newer is recommended.
- npm 11 or newer is recommended.

### Install dependencies

```bash
npm install
```

### Run checks

```bash
npm run typecheck
```

There is no app server or UI to launch yet. Until the UI is added, the main way to validate the project is the TypeScript typecheck.

## Minimal TypeScript usage

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
console.log(frame);
```

## Documentation

- [`docs/ae-first-mvp-architecture.md`](docs/ae-first-mvp-architecture.md): architecture overview for the AE-first core.
- [`docs/ai-agent-app-contract.md`](docs/ai-agent-app-contract.md): how an AI agent should resolve saved assets/locations, plan vague prompts, instantiate layers, and apply editable keyframes.
- [`docs/developer-planning.md`](docs/developer-planning.md): developer-facing planning notes, current artifacts, deferred work, and progress-review checklist.

## Current status

AInimatics is pre-alpha. The current codebase is best understood as a domain/runtime foundation rather than a complete end-user application.
