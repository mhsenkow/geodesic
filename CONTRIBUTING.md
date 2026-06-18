# Contributing to Geodesic

Thanks for helping improve the geodesic dome hub generator.

## Development setup

```bash
git clone <repo-url>
cd geodesic
npm install
npm run dev          # http://localhost:3000
```

## Project structure

```
src/
├── geodesic/     # Pure math — no Three.js
├── geometry/     # Hub mesh generation, STL export, validation
├── scene/        # Three.js main + inspector scenes
├── ui/           # App orchestration, bindings, keyboard, toasts
├── guides/       # SVG/CSV export helpers
├── presets/      # Named configuration presets
├── storage/      # localStorage persistence
└── styles/       # CSS design tokens
```

## Code style

- TypeScript strict mode; no `any` unless unavoidable
- Keep geodesic math pure (testable without WebGL)
- Match existing naming: `camelCase` functions, `PascalCase` classes
- Minimal comments — explain non-obvious geometry or print logic only
- Small, focused PRs preferred

## Testing

```bash
npm run test:unit           # Vitest — geodesic math
npm run test:e2e            # Playwright — app smoke tests
npm run test:visual         # Screenshot regression
npm run test:visual:update  # Refresh baselines after intentional UI changes
```

All PRs should pass `npm run build` and `npm test`.

## Pull request checklist

- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] New math/geometry logic has unit tests
- [ ] UI changes update visual snapshots if needed (`npm run test:visual:update`)
- [ ] CHANGELOG.md updated for user-facing changes
- [ ] No secrets or absolute local paths committed

## Reporting issues

Include: browser/OS, dome settings (V-level, diameter, material), steps to reproduce, and screenshots if visual.
