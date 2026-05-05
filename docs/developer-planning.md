# Developer planning notes

This document keeps implementation planning, PR readiness notes, deferred scope, and progress-review checklists out of the public-facing README.

## Initial PR readiness

The current artifacts are enough for an initial foundation pull request because they establish the contracts needed for the rest of the app to build against:

- A capability-based asset model that can represent sprites, still images, backgrounds, locations, and future media without hard-coded legacy asset types.
- Layer and group primitives for an AE-first layer stack, including nested group behavior.
- Keyframe channels for position, scale, rotation, opacity, and appearance/sprite swaps.
- A deterministic frame evaluator suitable for viewer playback and later Remotion handoff.
- A lightweight editor store that demonstrates manual keyframes, canvas auto-keying, selection, undo/redo, and AI/Codex patch application.
- Architecture and AI orchestration documentation under `docs/`.

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
| `docs/ai-agent-app-contract.md` | AI/Codex orchestration flow for resolving saved characters/locations, planning vague prompts, instantiating layers, generating missing sprites, and applying editable keyframes. |
| `README.md` | Public-facing project overview, feature summary, setup instructions, and documentation links. |
| `package.json` / `tsconfig.json` | Minimal TypeScript project scaffolding and typecheck command. |

## Recommended initial PR scope

Keep the initial pull request limited to the foundational contracts and explicitly call out what is intentionally deferred:

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

## AI orchestration planning summary

For natural-language prompts such as “make a scene 1280x720 where my uploaded character is sitting in a bar and walks out the door,” the agent should follow `docs/ai-agent-app-contract.md`: query project context, resolve saved assets/locations by role, tags, capabilities, upload provenance, and anchors, instantiate layers through app actions, generate missing variants only when needed, and apply all animation as editable keyframe patches.

For vaguer prompts such as “my character sits in a bar and then walks out the door,” the agent should first expand the request into a reviewable shot plan, infer low-risk defaults, ask for confirmation when identity/location/tone is ambiguous, and then convert each planned shot into the same concrete app operations.

## Progress review checklist

Use this checklist to assess whether the foundation has grown into a working MVP:

- [ ] Asset import persists capability metadata, tags, variants, and provenance.
- [ ] Shot creation supports project resolution, fps, duration, and ordering.
- [ ] Layer stack UI can add, rename, reorder, group, hide, lock, and solo layers.
- [ ] Timeline UI can add, move, copy, paste, and delete keyframes.
- [ ] Inspector UI can edit position, scale, rotation, opacity, and appearance channels.
- [ ] Curve editor can adjust interpolation and bezier tangents for numeric channels.
- [ ] AI agent can resolve saved characters/locations and ask clarifying questions on ambiguity.
- [ ] AI-generated scene plans can be reviewed before mutating a project.
- [ ] AI-generated animation is applied as editable keyframe patches.
- [ ] Remotion rendering consumes the same evaluated frame state used by preview.
- [ ] Automated tests cover asset validation, layer helpers, evaluator interpolation, group inheritance, and editor-store actions.
