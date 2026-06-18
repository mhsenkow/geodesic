# Changelog

All notable changes to this project are documented here. Versioning follows [Semantic Versioning](https://semver.org/).

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
