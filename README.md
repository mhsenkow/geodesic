# Geodesic — Organic Hub Generator

Browser-based tool for designing **geodesic dome connector hubs** with Weaverbird-style organic geometry. Configure dome structure, material (round PVC/EMT or rectangular timber), and slicer settings, then preview hubs in 3D and export print-ready STL files.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Live demo](https://mhsenkow.github.io/geodesic/)**

## Features

- Icosahedral / octahedral / tetrahedral domes V1–V8 with shallow-cap through full-sphere coverage and optional door opening
- Round PVC/EMT/rod or rectangular timber socket geometry
- **Watertight Manifold CSG hub engine** — union of node blob + strut shells,
  `smoothOut()` + `refineToLength()` for organic (Weaverbird-style) surfaces,
  then boolean-subtracted bores, screw holes, and entry bevels. Every exported
  hub is a guaranteed single closed solid.
- Organic **or** sharp hub styles, with flare, junction-meet blend, socket depth,
  strut size, surface smoothing, and detail all driving real geometry
- Watertight, fused **print base** for bed adhesion on each printable hub
- Hub classification by valence + angle signature
- Interactive 3D preview with physical strut bodies, length coloring, prototype-cached hubs, and Hub Inspector with build plate guide
- STL export with watertight validation, socket/depth fit checks, tunable build base, and test/production ZIP bundles with manifests
- Strut length CSV and hub placement SVG exports
- Named presets with settings persistence
- Keyboard shortcuts and mobile-friendly layout

## Quick start

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build → dist/
npm test          # unit + e2e tests
```

## Project layout

```
geodesic/
├── index.html              # App shell
├── src/
│   ├── geodesic/           # Dome math (pure TS)
│   ├── geometry/           # Hub meshes, STL export, validation
│   ├── scene/              # Three.js scenes
│   ├── ui/                 # App, bindings, keyboard, toasts
│   ├── guides/             # CSV/SVG export helpers
│   ├── presets/            # Named configurations
│   ├── storage/            # localStorage
│   └── styles/main.css
├── tests/
│   ├── unit/               # Vitest
│   ├── e2e/                # Playwright smoke tests
│   └── visual/             # Screenshot regression
├── docs/PRINT-GUIDE.md
├── public/gallery/         # Example build photos
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## Usage

1. Pick a **preset** or configure Structure / Material / Slicer settings
2. Open **Hub Inspector** (button, click vertex, or press `I`)
3. Tune organic refinement and print orientation
4. **Download STL** (`E` key) or export strut table / hub map from sidebar

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `I` | Open inspector |
| `E` | Export selected hub STL |
| `Esc` | Close inspector |
| `←` `→` | Cycle hub types |

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck + production build |
| `npm run test:unit` | Vitest geodesic math tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run test:visual` | Screenshot regression |
| `npm run test:visual:update` | Refresh visual baselines |

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR guidelines and [docs/PRINT-GUIDE.md](docs/PRINT-GUIDE.md) for printing tips.

## Tech stack

- **Vite** + **TypeScript**
- **Three.js** 0.160 (local npm dependency)
- **Vitest** (unit) + **Playwright** (e2e + visual)
- **GitHub Actions** CI + Pages deploy

## License

MIT — see [LICENSE](LICENSE).
