# Changelog

All notable changes to this project are documented here. Versioning follows [Semantic Versioning](https://semver.org/).

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
