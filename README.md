# Body Atlas — Interactive 3D Human Body Atlas

A static, single-page, fully offline 3D human body atlas for medical students.
Dark premium medical-app aesthetic. **All anatomy is real**: every mesh comes
from BodyParts3D 4.0 (© The Database Center for Life Science, CC BY 4.0) —
never AI-generated or procedural. See `ATTRIBUTION.txt`.

## Run locally

ES modules require http(s) — do **not** open `index.html` via `file://`.

```sh
cd ~/workspace/body-atlas
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy

Copy the whole directory to any static host (GitHub Pages, Netlify, …).
No backend, no database, no accounts, no tracking, zero external runtime
fetches. Three.js is vendored in `vendor/`; the only external URL anywhere is
the plain license link in the menu footer / About section.

## Layout

```
index.html            entry + import map (three -> ./vendor/three.module.js)
css/app.css           all styling (phone portrait + iPad landscape breakpoints)
js/main.js            shell: hamburger menu, section switching
js/sections.js        section REGISTRY — add future sections here, no other
                      code changes needed ('Quizzes' and 'Drug Guide' are
                      coming-soon placeholders demonstrating the pattern)
js/atlas.js           the Three.js atlas (viewer, layers, spread, labels…)
data/manifest.json    per-model bbox/centroid/triangles (original mm coords)
data/descriptions.js  1–2 sentence study notes per structure
vendor/               three.module.js + addons (OrbitControls, GLTFLoader)
models/               42 GLBs (40 organs + skeleton-full + musculature + skin)
_build/               build pipeline (kept, not needed at runtime)
  build_models.py     mapping -> merge -> obj2gltf -> manifest + alignment gate
  merged/             merged per-model OBJs (original coordinates)
```

## Features

- **Complete Body mode**: skin + musculature + 40 organs + full skeleton,
  assembled in one shared anatomical coordinate system.
- **Spread structures apart** slider: skin fades out, every structure explodes
  radially from the body's central axis (eased, live during orbit/autorotate).
- **Layer chips**: Skin / Muscles / Organs / Skeleton (heavy GLBs lazy-load
  with progress indicators).
- **System explorer**: 8 tabs (Cardiovascular … Integumentary) with structure lists.
- **Tap-to-select**: raycast picking, highlight, info card with study notes.
- **Type-ahead search** with camera fly-to.
- **Floating labels** (toggleable, decluttered, capped).
- Orbit / zoom / pan (touch + mouse), damped, auto-rotate toggle, DPR ≤ 2.
- No pull-to-refresh (`overscroll-behavior: none`, `touch-action: none`).
- Phone portrait bottom-sheet layout; iPad landscape (≥821px) side-panel layout.

## Data notes / judgment calls

- Bone organs (skull, ribs, …) are geometrically inside `skeleton-full.glb`.
  To avoid duplicate-geometry z-fighting, Complete Body mode renders the full
  skeleton and hides the 14 individual bone GLBs; selecting a bone organ
  switches to the Organs layer where all 40 are shown and highlighted.
- Cerebellum meshes are carved out of the Brain model (both list the same
  meshes hierarchically); likewise mandible⊂skull, sternum⊂rib cage,
  sacrum⊂pelvis/vertebral column.
- The shared ileocecal-junction mesh (FJ2599) is assigned to Large Intestine.
- `musculature.glb` merges major muscle groups from the finer ISA set
  (deltoids, biceps/triceps, pecs, traps, glutes, quads, hamstring group via
  biceps femoris + semitendinosus + semimembranosus, calves, obliques,
  sternocleidomastoid, …). Latissimus dorsi / erector spinae / rectus
  abdominis have no rows under those names in the ISA set, so deep back
  extensors are represented via deep postvertebral/iliocostalis meshes and
  the abs via the anterior abdominal wall muscle.
