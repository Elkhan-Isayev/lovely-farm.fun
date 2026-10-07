# Art prompts

All painted sprites were generated with **Higgsfield → GPT Image 2.5** (`gpt_image_2_5`), `background: transparent`, `quality: high`, 2k for sheets and 1k for single buildings. Reuse the same wording for new content so it matches.

## Shared style (start of every sheet prompt)

> Game sprite sheet for a cozy casual farming browser game (style of 2011 Flash social farm games like 'Lovely Farm' / FarmVille): hand-painted cartoon vector art, soft gradient shading, thin warm dark-brown outlines, bright saturated cheerful colors, slight top-down three-quarter view (camera ~35 degrees above). A strict 3x3 grid of 9 separate … each centered in its own cell with lots of empty transparent space between cells, no overlap, nothing touching cell borders, base at the bottom-center of each cell, no ground, no soil, no shadows, no text, no labels, no borders.

Then: "The harvest must be big, exaggerated and instantly recognizable." and the cells row by row, e.g. *Row 1: (1) radish plant: big round bright pink-red radish bulb half out of the soil line with a tuft of leaves; (2) …*. Animals add "all in three-quarter view FACING LEFT". Trees add "small compact garden trees (short trunk, round lush crown) heavily laden with LARGE, exaggerated, clearly visible fruit".

## Derived sheets (image editing)

The `-young` and `-bare` sheets were made by passing the finished sheet as `image_references` and asking:

- crops: "Edit this game sprite sheet. Keep exactly the same 3x3 grid layout, the same positions, the same hand-painted cartoon art style and colors, transparent background. Change every plant to a YOUNG mid-growth stage: noticeably smaller and lower plant with only fresh green leaves and stems, absolutely NO vegetables, NO fruits, NO flowers… Each plant must still be recognizable by its leaf shape (…list…)."
- trees: "…Remove ALL fruits (…list…): every tree shows only its green foliage." The lime kept some limes, so `tree-lime-bare` is an alias of `tree-lemon-bare` (see `sheets.json`).

## Single pictures

Buildings: "Single game building sprite for a cozy casual farming browser game (…same style…). Classic isometric game view (2:1 dimetric projection): the building's square footprint is a diamond with one corner pointing straight down at the viewer, the left wall faces down-left and the right wall faces down-right, both equally visible. <building>. Centered, the whole building visible, nothing cropped, no ground, no grass, no shadow, no text. Transparent background."

- The mill is drawn **without sails**; the sails are a separate front-view picture that the renderer rotates (`MILL_HUB` in `src/render/renderer.ts` is where the hub is).
- The greenhouse has its long side to the right; the renderer mirrors it for the 2×3 footprint.

Textures (opaque, `quality: medium`): "Seamless tileable texture, viewed straight from above: …grass / freshly tilled soil with 4 horizontal furrows / cobblestone path…, hand-painted cartoon style …, no perspective, no vignette." The grass is softened by `slice.py` (`"soften"`).

Backdrop (opaque, 21:9): "Wide panoramic background … bright summer sky … soft fluffy clouds; on the horizon in the lower third, gentle rolling green hills with a soft bluish distant forest line; the lower part is an even bright green meadow with no objects." The renderer puts the meadow line (57 % of the height) on the world horizon.

## The farmer

`farmer-boy` was generated as a 4×4 animation sheet ("ONE and the same young farmer boy in all 16 frames … three-quarter view, always FACING RIGHT, the same size and scale in every frame, feet on the same baseline"), with **key colours** the game recolours: hair `#ff2fd0` (magenta), shirt `#20d020` (green), overalls/skirt `#2060ff` (blue). Frames, row by row: idle; walk ×3; shovel up / shovel in the ground; can level / can pouring; sowing; reaching with a basket / holding a full basket; sprinkling fertilizer; hammer up / down; shooing ×2. `farmer-girl` was made by editing that sheet ("same 16 poses… change the character into a cute young farmer GIRL… ponytail… skirt…"). `slice.py` (`"character": true`) builds an atlas with the feet at the bottom centre of every cell and the three masks; `nomask` protects props that happen to be green (the plant in the boy's frame 9).

## Root crops

Radish, carrot, onion, beet, red onion and potato were regenerated "GROWING IN THE GROUND: a small low mound of dark soil, only the TOP HALF of the root peeks out" (sheet `roots`), so they look planted.

## Adding a sprite

1. Generate a sheet (or a single picture) with the wording above; save it as `art/sheets/<name>.webp`.
2. Add it to `sheets.json` with the ids in reading order.
3. `python3 scripts/art/slice.py <name>` (needs Pillow, numpy, scipy) — writes `public/art/<id>.webp` and updates `src/render/artManifest.ts`.
4. `tests/art.test.ts` checks that every crop, tree, animal, decoration and building has its pictures.
