# Changelog

All notable changes to this project are documented here. Versioning follows [Semantic Versioning](https://semver.org/).

## [1.8.0] - 2026-06-19

### Added

- **Watertight embossed labels** — hub labels and alignment notches fuse via Manifold
  boolean union instead of merged triangle soup, so export stays a single closed solid.
- **Metaball shell polish** — `smoothOut` + `refineToLength` on the SDF shell before socket
  booleans for softer, Weaverbird-like joins while bores stay crisp.
- **Export toolkit** — ZIP batch STL, GLB preview, BOM CSV, vertex coordinates CSV, design
  JSON import, 3MF vertex dedup and per-hub quantity items.
- **Printability upgrades** — meet-angle / socket-fit warnings, support material estimate,
  build-plate pack check, nozzle presets, tree-support base flare, export gate on errors.
- **UI & UX** — flat base ring toggle, preview quality LOD, custom preset save/load, inspector
  revert, preset descriptions, keyboard shortcuts panel, debounced dome rebuild.
- **Settings schema v2** — migrated localStorage, compact share URLs (`#s=…`).
- **Performance** — stable cache fingerprints, persistent prototype cache, volCache LRU cap,
  1D bin-packing stick count for material estimates.
- **Organic extras** — junction drip (metaball gravity bias), surface noise, style-specific
  smooth curves, lumber depth-axis from catalog profiles.
- `docs/ARCHITECTURE.md` and expanded test coverage (112 unit tests).

### Changed

- Export All Hubs now downloads a single ZIP instead of staggered individual STLs.
- Auto-open inspector on first load is off by default (`autoOpenInspector`).
- Manifold load failure toast now correctly mentions round + timber CSG.

## [1.7.0] - 2026-06-18

### Added

- **Metaball hub style.** A third hub style alongside Sharp and Organic: the
  shell is a signed-distance field (node sphere smooth-max'd with one capsule per
  strut) realized via `Manifold.levelSet`, giving genuinely amorphous, molten
  joins. Crisp bores / screw holes / entry bevels are booleaned out afterward so
  sockets still fit. Watertight by construction. `surfaceSmooth` → blend radius,
  `bodyScale` → node size, `subdStrutSize` → strut radius. Works round + timber.
- **Base Shape selector** — the geodesic grid can now seed from an
  **icosahedron** (classic geodesic/buckyball), **octahedron**, or
  **tetrahedron**, each producing a distinct dome family across all frequencies.
- **Goldberg / Fullerene topology** — dualize any geodesic sphere into the true
  buckyball mesh (hex + pentagon faces, every hub 3-valent). Ideal for uniform
  connector sets and metaball presets.
- Hub Style is now a 3-way control shown for both round and timber.
- **Strut Taper** — slim each arm toward its tip for teardrop silhouettes
  (round + metaball).
- **Hollow Through-Core** and **Base Drain Vent** — optional axial bore and a
  vent through the print foot for lighter, faster prints.
- **Socket fit toolkit** (`socket-fit.ts`) — per-axis tolerances (`tolX` /
  `tolY`), **Friction Ribs**, and **Raised Screw Bosses** as real positive
  geometry (not mesh hacks).
- **Hub decorations** — embossed hub labels on the print foot and socket
  alignment notches for assembly orientation.
- **Printability checks** — minimum wall vs nozzle diameter warnings on export;
  optional **Overhang Heatmap** in the Hub Inspector.
- **3MF build plate export** — packs one copy of each hub type onto a virtual
  plate with per-object metadata and a sidecar `geodesic-manifest.json`.
- **Feel presets** — Pebble, Coral (metaball), Bone, Featherweight, Industrial,
  and Buckyball (Goldberg) quick-starts tuned for the new options.
- Unit tests for base seeds, Goldberg duals, metaball watertightness, luscious
  hub options, printability/fit, and 3MF export.

### Notes

- `genSphere` is generalized to any triangular seed polyhedron. Class II/III
  geodesic subdivisions remain on the roadmap.

## [1.6.0] - 2026-06-18

### Changed

- **Unified Manifold CSG hub engine** for both round and timber, organic and sharp.
  Hubs are now built as real watertight solids: `union(node + strut shells)` →
  `smoothOut()` + `refineToLength()` → subtract rod/lumber bores → subtract screw
  holes. This replaces the merge-and-weld mesh path (overlapping sockets welded
  into a triangle soup) that produced self-intersecting, non-watertight shells.
- **Genuinely organic surfaces.** `smoothOut()` fills tangent vectors and
  `refineToLength()` tessellates the curved surface (the Weaverbird / subdivision
  analog). The previous code called `smoothOut()` without refining, so the
  organic blend never materialized.
- **Watertight boolean print base** (round + timber). The base is unioned in
  Manifold and the whole orient → base → seat-on-bed pipeline stays in Manifold
  until a single mesh conversion, so the plate is fused, not a merged shell.
- **Fast dome preview** via per-hub-type prototype caching: CSG runs once per hub
  type and each placement is an instanced rotation, not a fresh solve.
- Dome preview no longer carries a print base (cleaner assembly view); the base
  appears on the standalone printable hub in the inspector and STL export.

### Added

- **Strut Cut List panel** — every strut length drawn as a scaled bar with its
  cut length and count, longest first, plus total linear length.
- **Material & Cost panel** — estimates linear stock (sticks needed from stock
  length + waste %, and cost) and 3D-print material (solid volume from the
  watertight hub meshes, infill-adjusted filament mass + length, and cost),
  with a combined total. Inputs persist.
- **Quick-pick chips** under Blend Radius, Mesh Detail, Connection Length and
  Mesh Smooth — one-click optimal presets that highlight when active.
- `Entry Bevel` now subtracts a conical (round) / flared rectangular (timber)
  lead-in at each socket mouth for easier strut insertion.
- `Socket Depth` now scales round sockets too (was timber-only).
- `Subdivide Mesh` drives an extra refinement pass on the organic hull.
- Manifold-integrity unit tests: every round/timber, organic/sharp hub — and
  every classified hub type of a real V2 dome — is asserted watertight
  (single solid, `status() === NoError`, no open or non-manifold edges).
- Reworked presets, including a Sharp vs Organic timber pair and a soft
  "pebble" playground hub, all tuned for the new engine.

### Fixed

- **Dome-preview hub alignment.** Same-class hubs can be mirror images of the
  cached prototype, which a pure rotation can never align (struts were off by up
  to ~70°). Placement is now reflection-aware (mirrors the prototype + flips
  winding when a reflection fits better) and falls back to an exact per-vertex
  rebuild when a class signature matched only by coincidence. A regression test
  pins every V2/V3 hub to ≤3° or an exact rebuild.
- STL validation quantizes coordinates before edge analysis, so the Float64→
  Float32 export cast no longer reports spurious "open"/"non-manifold" edges on
  dense organic meshes.
- Falls back to the legacy lathe/extrude mesh only if Manifold WASM fails to load.

### Parameters

- Removed the duplicate wall-thickness slider (was both "Wall Thickness" and
  "Socket Wall"); wall lives once in Slicer Settings.
- `Junction Meet Blend` and `Socket Depth` now apply to round tube hubs too
  (were timber-only) and are shown for both materials.
- Refinement sliders (Blend Radius, Junction Meet, Entry Bevel, Mesh Detail,
  Connection Length, Strut Size, Mesh Smooth, Socket Depth) now rebuild the dome
  preview on release, so the assembled view reflects the same shape as the
  inspector and export.
- Rewrote slider labels/hints to describe the Manifold engine (node size, strut
  sleeves, smooth+refine) instead of the removed lathe/Taubin pipeline; removed
  the empty "Timber Tuning" section.

## [1.5.0] - 2026-06-18

### Changed

- **Timber hubs rebuilt** as explicit profile-sweep geometry (same pattern as round PVC lathe hubs)
- Tapered hollow sockets per strut axis; outer flare merges at center, inner lumber bore stays open
- Removed SDF / marching-cubes pipeline (was producing non-printable shard meshes)

## [1.4.0] - 2026-06-18

### Added

- **SDF + marching cubes** timber hub generator — smooth filleted junctions, fully hollow lumber passages
- Laplacian mesh smoothing pass after isosurface extraction
- Unit tests for hollow center and mesh generation

### Changed

- Timber hubs no longer use boolean-merged box primitives (which caused overlapping solids)
- **Sharp** = tighter blend radius; **Organic** = wider smooth merge (Flare Scale controls blend)
- STL export uses higher grid resolution than dome preview

## [1.3.0] - 2026-06-18

### Added

- **Metric / Imperial unit toggle** in sidebar header (persisted in settings)
- Dual-unit hints on lumber and tube dimension fields
- Door width validation capped at ~85% of dome diameter

### Changed

- All dimension inputs display in the selected unit system (internal storage remains m + mm)
- Material stock dropdown **filters by material type** (lumber only when timber selected)
- Switching round ↔ timber auto-selects matching stock (2×4 or 3/4" PVC)
- **Sharp timber hubs** use a compact central junction with sockets offset from center (cleaner geometry)
- Slider readouts (tolerance, foot margin, bevel, wall) show mm or inches
- Door width field hidden when door opening is disabled
- Default unit system is metric

## [1.2.0] - 2026-06-18

### Added

- **Hub style variants** for timber: **Sharp** (crisp prismatic tubes) vs **Organic** (tapered flare + blended core)
- Inspector sliders for **socket wall thickness** and **entry bevel** (live preview)
- Shed 3m Timber (Organic) preset

### Changed

- Timber sockets rebuilt as **single watertight tube meshes** per strut (no overlapping wall panels + box core)
- Sockets meet at center via natural overlap instead of a bolted-on sphere/cylinder junction
- Flare slider only appears for organic timber or round tube modes

## [1.1.0] - 2026-06-18

### Added

- **Standard stock catalog** — 1×4, 2×4, 2×6 lumber; PVC Sch40; EMT conduit; solid rod (actual mm dims)
- **Material stock picker** in sidebar with nominal → actual size notes
- **Screw pilot holes** for timber (through-wall) and round tube (set-screw dimples)
- Screw size selector (#8 / M4 / M5)
- Pavilion 2×6 preset

### Changed

- **Timber hub geometry rebuilt** — clean four-wall sockets + compact box node (no organic sphere/taper mess)
- Timber mode hides organic flare slider; body scale capped for structural hubs
- Shed preset uses proper 2×4 catalog dimensions

## [1.0.0] - 2026-06-18

### Added

- Vite + TypeScript modular architecture (`src/geodesic`, `src/geometry`, `src/scene`, `src/ui`)
- Local Three.js dependency (no CDN)
- Presets: Greenhouse, Shed, Event, Playground configurations
- Door opening support in dome truncation
- Print orientation override (custom print-up vector)
- Strut length CSV export
- Hub placement SVG map export
- STL validation before download with toast warnings
- Settings persistence via `localStorage`
- Keyboard shortcuts (I, E, Esc, ← →)
- Loading overlay and toast notifications
- Mobile touch-friendly controls
- Vitest unit tests for geodesic math
- Playwright e2e and visual regression tests
- GitHub Actions CI and GitHub Pages deploy
- Print guide, contributing guide, example gallery scaffold

### Changed

- Split 988-line monolithic `index.html` into maintainable modules
- Extracted CSS to `src/styles/main.css`

## [0.1.0] - 2026-06-17

### Added

- Initial prototype: single-file geodesic hub generator
- Organic Weaverbird-style hub geometry
- STL export with build foot
