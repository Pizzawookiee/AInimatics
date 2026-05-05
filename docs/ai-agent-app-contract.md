# AI agent app contract

This document clarifies how an AI agent should query AInimatics when a user gives a natural-language request such as:

> Make a scene 1280x720 horizontal resolution where my character `<uploaded character>` is sitting in a bar, medium shot, and he gets up and walks out the door.

The core idea is that the AI should not guess from text alone. It should ask the app for structured project context, resolve user references to saved assets/locations, instantiate layer objects through app actions, and apply editable keyframes through the same channel model used by the manual editor.

## Required AI-accessible app tools

The app should expose a small tool/API surface to the AI agent. These tools can be implemented as HTTP endpoints, local Codex tools, or server-side functions, but the contracts should remain stable.

| Tool | Purpose |
| --- | --- |
| `getProjectContext(projectId)` | Returns project resolution, fps, style bible, active sequence, and high-level metadata. |
| `searchAssets(projectId, query)` | Searches saved assets by name, role, tags, capabilities, embeddings, and provenance. |
| `getAsset(assetId)` | Returns full asset metadata, variants, capabilities, anchors, and references. |
| `searchLocations(projectId, query)` | Searches location assets or background/location bundles by role, tags, anchors, and camera hints. |
| `createShot(input)` | Creates or updates a shot with resolution, fps, duration, description, and status. |
| `instantiateLayer(input)` | Creates a shot layer from an asset using `createLayerFromAsset()` defaults. |
| `instantiateGroup(input)` | Creates a group/container layer for nested assets or character rigs. |
| `applyKeyframePatch(input)` | Applies editable keyframes/appearance swaps as patch operations. |
| `requestImageGeneration(input)` | Optional: generates missing sprites/backgrounds through the image generation pipeline. |
| `requestRenderPreview(input)` | Optional: renders or previews the evaluated shot. |

## Reference resolution flow

When the user says `my character <uploaded character>`, the agent should resolve that phrase through asset search before creating anything.

1. Parse the prompt into intent slots:
   - canvas: `1280x720`, horizontal
   - subject: `uploaded character`
   - location: `bar`
   - framing: `medium shot`
   - action: `sitting`, `gets up`, `walks out the door`
2. Query project context for defaults such as fps, active sequence, style bible, and existing saved entities.
3. Search for the character using the uploaded file id if available; otherwise search by asset role, tags, display name, and embeddings.
4. Search for a saved bar location or background asset. Prefer assets with `role='location'`, `aiBlockingContext=true`, `hasSpatialAnchors=true`, or tags such as `bar`, `interior`, `door`.
5. If multiple candidates match, ask the user to choose. If exactly one high-confidence candidate matches, proceed.
6. If no location exists, either ask permission to generate one or create a new semantic `location` placeholder plus generated background asset.
7. Instantiate the resolved assets into the shot and apply draft keyframes.

## Entity resolution response shape

The app should return search results with confidence and evidence so the AI can explain or ask follow-up questions.

```ts
export interface EntitySearchResult {
  id: string;
  kind: 'asset' | 'location' | 'shot' | 'sequence';
  label: string;
  score: number;
  reasons: string[];
  role?: string;
  tags?: string[];
  capabilities?: Record<string, boolean | string>;
  thumbnailUri?: string;
}
```

Example character search:

```json
{
  "query": "uploaded character",
  "filters": {
    "kind": "visual",
    "role": "character",
    "capabilities.supportsTransform": true
  },
  "results": [
    {
      "id": "asset_char_hero",
      "kind": "asset",
      "label": "Uploaded Character - Marcus",
      "score": 0.94,
      "reasons": ["uploaded in current project", "role=character", "matches selected upload token"],
      "role": "character",
      "tags": ["hero", "uploaded", "male"]
    }
  ]
}
```

Example location search:

```json
{
  "query": "bar with door",
  "filters": {
    "role": "location",
    "capabilities.aiBlockingContext": true
  },
  "results": [
    {
      "id": "asset_loc_bar_main",
      "kind": "asset",
      "label": "Main Bar Interior",
      "score": 0.89,
      "reasons": ["tag=bar", "has door anchor", "has camera hints"],
      "role": "location",
      "tags": ["bar", "interior", "night"]
    }
  ]
}
```

## How saved characters and locations are known

Saved entities are known because imported/generated assets carry structured metadata:

- `kind`: broad media category such as `visual` or `semantic`.
- `role`: user-facing role such as `character`, `background`, `prop`, or `location`.
- `tags`: searchable labels like `hero`, `bar`, `door`, `night`, or `uploaded`.
- `capabilities`: behavior flags such as `supportsVariants`, `aiBlockingContext`, and `hasSpatialAnchors`.
- `metadata.spatialAnchors`: named points such as `bar_stool`, `door`, `counter`, or `exit_path_start`.
- `variants`: sprite/appearance options such as `sitting`, `standing`, `walking_1`, and `walking_2`.
- provenance fields in `metadata`: uploaded file ids, source prompts, generation model, style references, or character identity ids.

The agent should always prefer these structured fields over free-text inference.

## Example full orchestration

### 1. Get project context

```json
{
  "tool": "getProjectContext",
  "input": { "projectId": "proj_123" }
}
```

Expected response:

```json
{
  "projectId": "proj_123",
  "fps": 24,
  "resolution": { "width": 1920, "height": 1080 },
  "activeSequenceId": "seq_001",
  "styleBibleId": "style_noir_cutout",
  "assetCount": 42
}
```

### 2. Resolve the character

```json
{
  "tool": "searchAssets",
  "input": {
    "projectId": "proj_123",
    "query": "uploaded character",
    "filters": {
      "role": ["character"],
      "kind": ["visual"],
      "supportsTransform": true
    },
    "limit": 5
  }
}
```

If the user attached a file in the prompt, include its upload id:

```json
{
  "query": "character referenced by uploaded file upload_abc",
  "filters": {
    "metadata.uploadId": "upload_abc"
  }
}
```

### 3. Resolve the bar/location

```json
{
  "tool": "searchLocations",
  "input": {
    "projectId": "proj_123",
    "query": "bar interior with exit door",
    "requiredAnchors": ["door"],
    "preferredCapabilities": ["aiBlockingContext", "hasSpatialAnchors", "hasCameraHints"],
    "limit": 5
  }
}
```

### 4. Create the shot

```json
{
  "tool": "createShot",
  "input": {
    "projectId": "proj_123",
    "sequenceId": "seq_001",
    "name": "Hero exits bar",
    "resolution": { "width": 1280, "height": 720 },
    "durationFrames": 144,
    "fps": 24,
    "description": "Medium shot: character starts seated in a bar, stands, walks to the door, exits."
  }
}
```

### 5. Instantiate location/background and character layers

A semantic location may not render by itself. If the location has a paired background asset, instantiate that background visually and keep the semantic location as blocking context.

```json
{
  "tool": "instantiateLayer",
  "input": {
    "shotId": "shot_010",
    "layerId": "layer_bar_bg",
    "assetId": "asset_bg_bar_main",
    "zIndex": 0,
    "initialValues": {
      "positionX": 640,
      "positionY": 360,
      "scaleX": 100,
      "scaleY": 100,
      "opacity": 100
    }
  }
}
```

```json
{
  "tool": "instantiateLayer",
  "input": {
    "shotId": "shot_010",
    "layerId": "layer_hero",
    "assetId": "asset_char_hero",
    "zIndex": 10,
    "initialValues": {
      "positionX": 500,
      "positionY": 510,
      "scaleX": 72,
      "scaleY": 72,
      "opacity": 100,
      "appearance": "sitting"
    }
  }
}
```

### 6. Generate missing sprite variants if needed

If the character does not have `sitting`, `standing`, or `walking` variants, the agent should call image generation instead of inventing variant ids.

```json
{
  "tool": "requestImageGeneration",
  "input": {
    "projectId": "proj_123",
    "assetId": "asset_char_hero",
    "intent": "create character sprite variants",
    "variants": ["sitting", "standing", "walking_1", "walking_2"],
    "styleReferenceAssetIds": ["asset_char_hero"],
    "constraints": {
      "preserveIdentity": true,
      "transparentBackground": true,
      "matchProjectStyleBible": true
    }
  }
}
```

### 7. Apply editable keyframes

The agent should produce an editable patch rather than hidden procedural animation.

```json
{
  "tool": "applyKeyframePatch",
  "input": {
    "shotId": "shot_010",
    "source": "ai",
    "ops": [
      { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 0, "value": "sitting" },
      { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 36, "value": "standing" },
      { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 72, "value": "walking_1" },
      { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 84, "value": "walking_2" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 0, "value": 500, "interp": "hold" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 0, "value": 510, "interp": "hold" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 36, "value": 500, "interp": "easeInOut" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 36, "value": 470, "interp": "easeInOut" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 120, "value": 1040, "interp": "easeInOut" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 120, "value": 455, "interp": "easeInOut" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "opacity", "frame": 132, "value": 100, "interp": "linear" },
      { "op": "add_key", "layerId": "layer_hero", "channel": "opacity", "frame": 144, "value": 0, "interp": "linear" }
    ]
  }
}
```

The app should then call the same editor-store path as manual edits (`applyAiPatch`) so users can inspect, undo, retime, or edit each generated keyframe.

## Medium shot and door-aware staging

The AI should convert cinematography terms into initial values using location metadata:

- `medium shot`: character scale and camera/framing defaults should keep the upper body prominent while preserving enough environment to see the door.
- `sitting in a bar`: initial position should snap near a `bar_stool`, `chair`, or `counter` anchor if present.
- `walks out the door`: end position should target the `door` or `exit` spatial anchor.
- If anchors are missing, the AI should choose plausible coordinates, mark them as inferred, and optionally suggest adding anchors to the location asset.

Example anchor-aware plan:

```json
{
  "locationAssetId": "asset_loc_bar_main",
  "anchorsUsed": [
    { "id": "bar_stool", "purpose": "start seated pose" },
    { "id": "door", "purpose": "exit destination" }
  ],
  "inferences": [
    "Medium shot scale chosen from default character height and 1280x720 frame.",
    "Door path adjusted to avoid bar counter foreground area."
  ]
}
```

## Ambiguity policy

The AI should ask a clarifying question when:

- More than one saved character or location has similar confidence.
- The prompt references `my character` without an upload token, active selection, or clear name match.
- A required sprite variant is missing and image generation is not enabled.
- A location lacks enough anchors for the requested action and the result would be visually important.

The AI can proceed without clarification when:

- There is an active selected asset in the UI and the phrase clearly refers to it.
- A prompt upload id maps to exactly one saved asset.
- A saved character/location is the only high-confidence match.
- Missing staging anchors are non-critical and can be inferred from the frame.

## Vague prompt expansion policy

For a vague prompt such as:

> My character `<uploaded character>` sits in a bar and then walks out the door.

The AI should act as a shot planner before it acts as an animation operator. It should expand the request into a concise shot plan, choose reasonable defaults, identify assumptions, and then query the app with specific asset, shot, layer, and keyframe operations.

### Planner responsibilities

1. Resolve the referenced character and location exactly as described in the reference resolution flow.
2. Infer missing production choices only when they are low risk:
   - resolution: use project default, or `1280x720` if the user previously requested horizontal HD.
   - fps: use project default.
   - duration: choose a short animatic-friendly duration, usually 6-10 seconds for a simple action.
   - shot count: choose 2-4 shots unless the user asks for a single continuous shot.
   - framing: use readable defaults such as establishing, medium, and exit/wide shots.
3. Produce a `ScenePlan` object that the user can review before app mutations if confidence is low.
4. Convert each approved shot into concrete `createShot`, `instantiateLayer`, optional `requestImageGeneration`, and `applyKeyframePatch` calls.
5. Preserve editability: all generated motion should become layer channels and keyframes, not hidden procedural instructions.

### Suggested scene plan for the vague bar prompt

The AI could propose a three-shot animatic:

```json
{
  "sceneTitle": "Character exits bar",
  "assumptions": [
    "Use project default fps and style.",
    "Use a 1280x720 horizontal frame if the project has no active resolution.",
    "Use a saved bar location if one exists; otherwise request generation or confirmation.",
    "Use existing sitting/standing/walking variants if available; otherwise generate missing variants."
  ],
  "shots": [
    {
      "shotId": "planned_001",
      "name": "Bar setup",
      "durationFrames": 48,
      "framing": "medium-wide establishing shot",
      "description": "Show the character seated at the bar with the exit door visible in the background.",
      "requiredAnchors": ["bar_stool", "door"],
      "animationIntent": "Hold seated pose with subtle idle motion."
    },
    {
      "shotId": "planned_002",
      "name": "Character stands",
      "durationFrames": 48,
      "framing": "medium shot",
      "description": "The character rises from the stool and turns toward the door.",
      "requiredVariants": ["sitting", "standing"],
      "animationIntent": "Swap from sitting to standing and lift position slightly."
    },
    {
      "shotId": "planned_003",
      "name": "Exit walk",
      "durationFrames": 96,
      "framing": "wide enough to include stool and door",
      "description": "The character walks from the bar stool to the door and fades or cuts as they exit.",
      "requiredAnchors": ["bar_stool", "door"],
      "requiredVariants": ["walking_1", "walking_2"],
      "animationIntent": "Move along an anchor-aware path to the door with stepped walking variants."
    }
  ]
}
```

### Query sequence generated from the scene plan

After planning, the agent should turn the plan into concrete app queries:

1. `getProjectContext(projectId)` to fetch fps, default resolution, active sequence, style, and selected/uploaded assets.
2. `searchAssets(projectId, query)` with role/capability filters to resolve the uploaded character.
3. `searchLocations(projectId, query)` to find a bar asset with door/bar-stool anchors.
4. `getAsset(assetId)` for the resolved character and location to inspect variants, anchors, paired background assets, and camera hints.
5. `requestImageGeneration(input)` only for missing variants or missing bar/background assets.
6. `createShot(input)` once per planned shot.
7. `instantiateLayer(input)` for the background/location visual layer and character layer in each shot.
8. `applyKeyframePatch(input)` for shot-specific editable keyframes.

### Example concrete operations for the three-shot plan

The following abbreviated operation list shows the level of specificity the planner should produce before mutating the project:

```json
{
  "operations": [
    {
      "tool": "createShot",
      "input": {
        "name": "Bar setup",
        "resolution": { "width": 1280, "height": 720 },
        "durationFrames": 48,
        "description": "Medium-wide setup: character seated at the bar, door visible."
      }
    },
    {
      "tool": "applyKeyframePatch",
      "input": {
        "shotName": "Bar setup",
        "ops": [
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 0, "value": "sitting" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 0, "value": 470, "interp": "hold" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 0, "value": 510, "interp": "hold" }
        ]
      }
    },
    {
      "tool": "createShot",
      "input": {
        "name": "Character stands",
        "resolution": { "width": 1280, "height": 720 },
        "durationFrames": 48,
        "description": "Medium shot: character rises from the stool and turns toward the door."
      }
    },
    {
      "tool": "applyKeyframePatch",
      "input": {
        "shotName": "Character stands",
        "ops": [
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 0, "value": "sitting" },
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 24, "value": "standing" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 0, "value": 510, "interp": "easeInOut" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionY", "frame": 36, "value": 465, "interp": "easeInOut" }
        ]
      }
    },
    {
      "tool": "createShot",
      "input": {
        "name": "Exit walk",
        "resolution": { "width": 1280, "height": 720 },
        "durationFrames": 96,
        "description": "Wide exit shot: character walks from stool to the door and leaves."
      }
    },
    {
      "tool": "applyKeyframePatch",
      "input": {
        "shotName": "Exit walk",
        "ops": [
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 0, "value": "standing" },
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 12, "value": "walking_1" },
          { "op": "set_variant_key", "layerId": "layer_hero", "channel": "appearance", "frame": 24, "value": "walking_2" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 0, "value": 500, "interp": "easeInOut" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "positionX", "frame": 84, "value": 1040, "interp": "easeInOut" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "opacity", "frame": 84, "value": 100, "interp": "linear" },
          { "op": "add_key", "layerId": "layer_hero", "channel": "opacity", "frame": 96, "value": 0, "interp": "linear" }
        ]
      }
    }
  ]
}
```

### When to ask versus proceed

For vague prompts, the agent should ask for confirmation when the creative decision changes the meaning of the scene, such as choosing between multiple characters, multiple bars, a comedic versus dramatic tone, or a one-shot versus multi-shot sequence. The agent can proceed without confirmation for reversible drafting choices such as initial timing, scale, rough path, default easing, and temporary inferred anchors, because those choices become editable keyframes.

A useful confirmation message is:

> I found Marcus as the uploaded character and Main Bar Interior as the likely bar location. I can draft this as three shots: seated setup, standing beat, and exit walk. I will use existing variants where available and generate missing sitting/walking sprites if needed. Proceed?
