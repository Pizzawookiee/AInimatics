# AE-first MVP architecture

This repository starts the AInimatics editor around an After Effects-style model: assets become layers, layers expose timeline channels, and the frame evaluator turns channel keyframes into renderable layer states.

## Design decisions

- Assets use capabilities rather than a rigid `sprite | image | background | location` enum, so the UI can show tracks and AI actions from feature flags.
- Layers are shot-specific instances of assets or group containers.
- Every layer owns stable channels for position, scale, rotation, opacity, and appearance.
- Appearance is evaluated as a stepped channel for sprite/image variant swaps.
- Groups are precomp-like containers whose transforms and opacity are inherited by child layers.
- AI/Codex-generated animation is applied as editable keyframes through the same store actions as manual edits.

## Core modules

- `asset-service.ts`: capability presets, validation, migration from legacy asset types, and derived UI/layer hints.
- `layer-service.ts`: layer and group creation, channel defaults, keyframe insertion, reordering, parenting, and deletion helpers.
- `animation-evaluator.ts`: deterministic per-frame evaluation for playback and Remotion handoff.
- `editor-store.ts`: a lightweight Zustand-style store with actions for shot initialization, manual keyframes, canvas auto-key commits, AI patch application, and undo/redo.

## MVP flow

1. Import or generate assets and assign capability presets.
2. Drag an asset into a shot to create a layer with capability-derived defaults.
3. Keyframe transform, opacity, and appearance manually via inspector, canvas, timeline, or curve editor UI.
4. Optionally apply AI/Codex patches to selected channels and time ranges.
5. Evaluate frames with `evaluateFrame()` and pass the output to preview or Remotion rendering.
