# Geodesic Architecture

## Pipeline overview

```
Base polyhedron (icosa / octa / tetra)
  → subdivide (Class I geodesic) OR dualize (Goldberg)
  → truncateDome (flat base ring, door wedge)
  → classHubs (valence + angle signature)
  → hub prototype cache (one CSG per hub type)
  → instantiate at each vertex (rotation / reflection align)
  → inspector / export (print frame, refine ≥64, boolean print base)
  → STL / 3MF / ZIP validation
```

## Hub geometry engines

| Style | Engine | Watertight |
|-------|--------|------------|
| Sharp | Manifold CSG union → subtract bores | Yes |
| Organic | CSG + `smoothOut` + `refineToLength` | Yes |
| Metaball | SDF `levelSet` + socket booleans | Yes |
| Hybrid | Metaball shell with boosted smooth blend | Yes |

Preview uses **lower detail** (24–36 segments), optional **LOD** (fast/balanced/full), and instanced strut bodies for legible stock-scale framing. Export forces **detail ≥ 64** and `refineToLength` for printable triangle size.

## Caching

- **Prototype cache** (`hub-prototype.ts`): keyed by stable param fingerprint; cleared only when hub params change.
- **Volume cache** (`material.ts`): LRU capped at 64 entries for cost estimates.

## Export conventions

- Print frame: **+Y up**, seated on bed, then `orientGeometryForSTL` rotates to **Z-up** for slicers.
- Build-foot thickness/scale are export geometry settings and are included in validation/material estimates.
- Embossed labels: Manifold **boolean union** (not mesh merge).
- ZIP bundles include STLs plus manifest, design JSON, strut table, optional BOM, and README.
- 3MF: deduplicated vertices; every physical hub copy gets a packed `<item>` transform.

## Settings

- Schema version **2** in `localStorage` (`geodesic-settings-v2`); v1 migrated automatically.
- Share URLs use compact base64 payload (`#s=…`).

See also [PRINT-GUIDE.md](./PRINT-GUIDE.md) for slicer tuning.
