# 100 Ways to Make Geodesic Wonderful 🌐

*A deep, holistic field guide to turning this from "a very good hub generator" into "the tool people use to dream up a dome on Friday and sleep under it by Sunday — whether it's built from drinking straws or 2×4s."*

> Written after a full read of the codebase (geodesic math, the Manifold CSG hub engine, the four hub styles, the materials catalog, the export pipeline, the UI, and the test suite). Every technical item points at real code so you can act on it. Items marked **🎯 Flagship** are the highest-leverage moves; a suggested roadmap is at the very bottom.

---

## ✅ Progress — 39/100 Implemented So Far

Items marked **✅** below are done, tested, and verified. The whole test suite is green (**138 unit tests**, +21 new), `tsc` is clean, the production build succeeds, and the UI changes were confirmed in a live browser. Highlights of this pass:

**The strut accuracy fix (the headline) is complete and proven.** `computeStrutTypes` now returns a true **cut length** (chord − socket seating at both ends), an **insertion depth**, a **seat-bevel angle**, and the **hub pair** each strut joins. A shared `roundSocketGeometry`/`hubSocketInfo` is the single source of truth (`socket-fit.ts`, `socket-geometry.ts`) consumed by the mesh builder, the fit checks, and the cut math alike. Ground-truth tests (`tests/unit/strut-accuracy.test.ts`) assert the V2 icosa chord-factor ratio (~0.884), Euler's V−E+F=2, hub angles (60°/90°), and that cut length = chord − both insets.

- **§1 Accuracy:** #1 cut length · #2 three numbers · #3 single socket source of truth · #4 real seat depth · #5 seat-bevel angles · #6 buildable-tolerance clustering · #8 radius-relative vertex weld · #9/#89 chord-factor tests · #10/#90 Euler + angle tests · #14 Euler check · #15 fixed-kerf model.
- **§3 Materials (straws→2×4s):** #28 straws/skewers/dowels/bamboo · #29 lumber gaps (2×3, 1×6, 2×8) **+ 2×4 & straw presets** · #30 1½"/2" PVC, 1¼" EMT · #31 fiberglass/copper/aluminum · #32 density/modulus/cost properties · #33 stock-wall vs connector-wall · #37 per-material cost & stock length.
- **§4 Build layer:** #42 strut→hub adjacency (filled the empty CSV columns) · #43 per-stick `cut_sheet.csv` · #44 README shopping list with trade names · #45 fastener counts in the BOM · #51 `vertices.csv` in the ZIP.
- **§5 Safety:** #53 span/strength warning · #54 structure weight estimate.
- **§6 UX:** #63 fixed the 404'd Print Guide link · #64 strut-length color legend · #67 confirm-before-reset · #70 implemented the orphaned auto-open-inspector control.
- **§9 Health:** #87 typecheck now gates CI (+ Playwright cache) · #91 open-mesh detection test · #92 STL-bytes round-trip test · #96 legacy fallback test.
- **§1/§2 Hub alignment:** #11 hub sockets now land on dome edges exactly · #25 bounded the n! permutation search.
- **§1 Timber roll:** #12 rectangular sockets + strut bodies now share the dome-radial roll reference, so the lumber's wide face registers square (no twist) and survives prototype rotation. Plus **craft/popsicle sticks** added to the catalog (popsicle, jumbo craft, paint stirrer) with a Popsicle Stick Dome preset — yes, timber scales all the way down to model sticks.

**Bug fix — dome hub alignment (sockets twisting off the struts).** `alignmentQuat` paired struts to prototype sockets *without knowing the rotation*, so a symmetry-rotated hub matched the wrong sockets — a *pristine* full icosphere had **24/42 hubs 30°+ misaligned** (they limped along via slow per-vertex rebuilds). Rewrote it to score every strut correspondence by a cheap frame fit, keep the best, then polish to the least-squares optimum, and capped the exhaustive search at valence ≤6 (high-valence hubs no longer trigger the 9!≈363k blow-up that hung V3 timber builds). A headless probe now reports **0.00° residual on every hub** of geodesic/Goldberg/hemisphere/full-sphere/flat-base domes; a regression test pins it. Verified in-browser on the full-sphere buckyball.

**Bug fix — timber (square) hub quality across all three styles.** The organic timber path was applying near-maximal `minSmoothness` (~0.8) to a union of rectangular prisms, ballooning it into a lumpy "crumpled-foil" surface that rounded away the flat socket faces a 2×4 needs. Retuned `smoothPlan` with a rect-specific path (gentle, stable fillet + low sharp-angle threshold so box faces stay crisp), enlarged `timberCoreRadius` so the node is a solid blended mass (not a spiky star) at high valence, and routed Metaball/Hybrid → the crisp-socket Organic build for timber (a marching-cubes SDF can't hold flat faces). All three styles now produce clean, flat-faced timber hubs — verified in-browser and by the timber integrity/watertight tests.

The remaining 64 are mostly larger features (assembly sequencer, AR, simulation, wizard, gallery) or higher-risk refactors — tackled next.

---

## The North Star

Right now the project is excellent at **one half** of its mission: it makes *beautiful, watertight, printable hubs*. The Manifold engine is genuinely impressive — boolean union of node + struts, `smoothOut` + `refineToLength` for organic surfaces, guaranteed single closed solids, real fit checks. That half is 8/10.

The **other half** — *"figure out how to actually construct this with a range of materials"* — is more like 3/10. The tool hands you gorgeous STLs and a list of strut lengths, then waves goodbye at the moment the real build begins. There's no assembly story, the material catalog can't reach either end of the "straws → 2×4s" spectrum, and — the thing you already felt — **the strut numbers aren't the numbers you cut to.**

These 100 items are organized to close that gap while making the whole experience more delightful, more correct, and more fun.

---

## 🔬 The Diagnosis: Why Your Struts Aren't Accurate

You were right, and it's not your printer or your saw. There are **four** compounding sources of strut error, and the biggest one is conceptual.

### The headline bug: you're being told to cut struts ~72 mm too long

`computeStrutTypes()` in `src/geodesic/math.ts:282` computes strut length as the **straight-line distance between two dome vertices** (hub center to hub center):

```ts
const len = Math.hypot(va[0]-vb[0], va[1]-vb[1], va[2]-vb[2]) * (scaleToMeters / (DOME_RADIUS*2));
```

But a physical strut does **not** span hub-center to hub-center. It plugs *into a socket* at each end and bottoms out deep inside the hub. In `src/geometry/node-hub-manifold.ts:135`, the socket floor sits at `voidInset` from the hub center:

```
voidInset = max(strutLen - rodD*1.3, strutLen*0.32)   // ≈ 36 mm at default ¾" PVC settings
```

So the real geometry looks like this along one edge:

```
   hub A center                                      hub B center
        |<-- voidInset_A -->|                |<-- voidInset_B -->|
        O===================[==strut you cut==]===================O
        |                   ^ socket floor    ^ socket floor      |
        |<---------------- L (what the tool reports) ------------>|

   Correct cut length = L − voidInset_A − voidInset_B   (≈ L − 72 mm at defaults)
```

If you cut to the reported `L` and seat the struts fully, **every hub-center pushes ~72 mm farther apart than designed.** On a 4 m dome with ~0.7 m struts that's a **~10 % oversize per edge**, and because the error accumulates around every ring, the dome fights itself and won't close cleanly. That single off-by-`2·voidInset` is almost certainly the dominant inaccuracy you're feeling.

The other three contributors:

- **The flat-base snap distorts base struts silently.** `truncDome()` (`math.ts:199`) flattens every vertex within `rad*0.12` of the cut plane straight down to `yT`. That's a 12 %-of-radius band — base-ring struts and their hub angles get moved *off the sphere* before any length is ever measured, and nothing flags those as "modified."
- **No end-cut (miter/bevel) angles exist anywhere.** `StrutType` carries only `{length, count, label}` (`types/index.ts:38`). For socketed builds the socket sets the angle, but for anyone butting timber strut-to-strut, or skinning the dome with panels, the compound cut angles are build-critical and simply absent.
- **Length bucketing splits identical struts.** Grouping by `len.toFixed(4)` (0.1 mm) means floating-point jitter between *geometrically identical* struts can land them in two different "types," inflating your cut list — while still being far too fine for anyone cutting wood.

Section 1 below is the cure. Everything else builds the wonderful thing on top of an accurate foundation.

---

## §1 — The Strut & Geometry Accuracy Overhaul

*Fix the foundation first. If the numbers lie, nothing built on them can be trusted.*

**1. ✅ 🎯 Report true cut length, not center-to-center distance.** Make `computeStrutTypes` subtract each end's socket-floor depth: `cutLen = chord − floorDepth(hubA) − floorDepth(hubB)`. The floor depth is already computable from the same `roundDims`/`timberDims` that build the mesh (`node-hub-manifold.ts:135`, `socket-fit.ts`). This is the single most important fix in the whole document.

**2. ✅ 🎯 Report *three* numbers per strut, clearly labeled.** Builders need: **(a)** center-to-center (the design dimension), **(b)** cut length (what you set your saw stop to), and **(c)** insertion depth per end (so they understand the join). Surface all three in the cut list and CSV so there's never ambiguity about "which length is this?"

**3. ✅ Make socket geometry a single source of truth.** Today the depth formula lives in `socketLengthFromSettings` (`socket-fit.ts:38`) *and* a hand-rolled `socketReach` copy in `hub-decorations.ts:64`, with different `minLen` floors per call site. Extract one `socketGeometry(p)` returning `{mouthOpening, boreDepth, seatDepth, floorFromCenter}` and have the mesh builder, decorations, fit-checks, *and* the new strut-length math all consume it. No drift, ever.

**4. ✅ Fix the over-reported socket depth.** The inspector shows `socketLen` (~70 mm) as "socket depth," but the strut only actually *engages* ~35 mm before bottoming out (`fit-checks.ts:49`). Report the real **seat depth** (`strutLen − voidInset`), which is roughly half of what's shown today.

**5. ✅ 🎯 Compute strut end-cut (bevel) angles.** Add `cutAngleA`, `cutAngleB`, and a compound `rollAngle` to `StrutType`. The data already exists — `classHubs` builds the pairwise meet angles (`math.ts:258`) and the inspector displays them (`inspector-scene.ts:146`). Turn that into the saw setting a timber builder needs for flush joints. This unlocks butt-jointed and panelized builds entirely.

**6. ✅ Cluster strut lengths by a *buildable* tolerance, not `toFixed(4)`.** Replace the 0.1 mm decimal-truncation grouping (`math.ts:291`) with 1-D clustering at a material-aware gap (e.g. 0.5 mm for PVC, 1 mm for timber). This both *merges* the floating-point-jitter false-splits and stops pretending anyone can cut wood to 0.1 mm.

**7. Shrink and honestly label the flat-base distortion.** The `rad*0.12` snap band (`math.ts:174`) is aggressive. Either snap only vertices within a tight epsilon of `yT` (true bottom ring), or keep the flat base but tag those struts/hubs as "flat-base modified" in every output so their lengths read as intentional, not sphere-true.

**8. ✅ Make the vertex-merge tolerance relative to radius.** `addVert` dedups on `toFixed(7)` of *world* coordinates (`math.ts:29`). At large `rad` or odd scales this can false-merge distinct vertices (a strut silently vanishes) or fail to merge shared ones (a phantom seam + extra strut type). Quantize on `(coord/rad)` or use a spatial hash keyed to min-edge-length.

**9. ✅ 🎯 Validate the math against known geodesic chord factors.** This is how you *prove* accuracy. A V1 icosphere has exactly 1 strut length × 30; a V2 icosa dome has the famous A/B chord-factor pair (~0.348 / ~0.403). Assert these literal values in tests (see item 89). Right now `computeStrutTypes` could be off by a constant and every test still passes.

**10. ✅ Verify hub angles against ground truth.** A 6-valent field hub should read ≈60°/120°; a 5-valent pentagon hub ≈63.43°. `classHubs` never checks this. Add assertions so a regression in the angle-signature math can't ship green.

**11. ✅ Build each hub from its *own* strut directions, not a type representative.** Export currently builds one hub per *type* from `ht.verts[0]`'s exact angles (`export.ts:152`) and reuses it for every vertex grouped under that type by 0.1° rounding. Vertices that differ by <0.1° get a hub modeled for slightly the wrong angles. Either build per-vertex or snap grouped hubs to a canonical averaged angle set.

**12. ✅ Account for socket roll on rectangular timber.** `frameForStrutAxisZ` (`hub-orient.ts:6`) picks the roll about the strut axis arbitrarily from `WORLD_UP`. For non-square lumber (a 2×4!) that means the wide face of the socket lands in a random orientation. Derive roll from the adjacent dome face plane so the lumber's wide face aligns predictably with the structure.

**13. Expose chord-factor / strut-ratio readouts in the UI.** Show the canonical geodesic data (number of unique strut lengths, their ratios) so experienced dome builders can sanity-check against published tables and trust the tool immediately.

**14. ✅ Add a Euler-characteristic invariant check (V − E + F = 2).** Cheap, catches whole classes of topology bugs in `genSphere`/`truncDome`/`dualizeSphere` (item 90). A dome that violates Euler is malformed by definition.

**15. ✅ Model the kerf correctly in length math.** Saw kerf is a fixed width per cut (~1–3 mm), not the per-length percentage currently used in `optimizeStickCount` (`material.ts:58`). This skews short vs. long struts. Treat kerf as a constant subtracted per cut.

**16. Add a "measure twice" confidence band.** For each reported length, show the tolerance stack-up (print tolerance + socket clearance + your stated cut accuracy) as a ± band, so builders know which struts are forgiving and which are critical. Turns blind numbers into informed decisions.

---

## §2 — The Hub Geometry & Print-Quality Engine

*The hubs are the crown jewels. Make them bulletproof and even more gorgeous.*

**17. 🎯 Detect dropped/pinched struts after metaball `levelSet`.** The metaball SDF (`metaball-hub.ts:166`) is not a true distance field; the author's own comment (`:125`) warns `levelSet` can "pinch a strut off into a second component." Nothing catches it — `validateStlGeometry` only checks open edges, so a hub *missing an arm* exports perfectly watertight. Add a `Manifold.decompose().length === 1` check (already used in tests!) post-levelSet, then refine-and-retry or fall back to the node-union path. This is a ship-to-printer correctness hole.

**18. Measure *real* mesh wall thickness instead of estimating it.** `fit-checks.ts:31` and `printability.ts:99` derive min-wall from `wall × (meetAngle/90)` — pure parameter math, never touching the actual mesh. But `smoothOut` and tight strut meets genuinely thin walls (especially the `tipWall = wall*0.45` arms). Add a sampled ray/SDF thickness probe near each socket and feed it into the existing warning.

**19. 🎯 Make "hybrid" actually hybrid (or rename it).** `effectiveHubStyle` (`smooth-curves.ts:18`) never returns `'hybrid'`, has a dead `blend > 0.5` branch shadowed by `> 0.92`, and turns the documented "0–1 blend" into a discrete switch. Today "hybrid" = "metaball + 5 % smoothing." Either implement a real morph between organic and metaball solids, or be honest and rename the control.

**20. Validate normals/winding and report degenerate triangles.** `stl-validation.ts` checks only open edges — a fully inside-out mesh passes, and zero-area triangles are silently skipped (`:45`). Add a signed-volume sign check (cheap) and a degenerate-tri count, especially since the legacy fallback and merged foot/decoration paths bypass Manifold's guarantees.

**21. Make the printed hub physically sound at its weak points.** Two linked fixes. First, route the preview print-foot through the real Manifold union (`unionPrintBase`, `timber-print-base.ts:38`) instead of `mergeGeometries(..., false)` (`hub-foot.ts:84`), which today renders interpenetrating triangle soup in the dome preview rather than a watertight join. Second, add a controllable fillet where each strut arm meets the node — the highest-stress point and the #1 real-world snap-off location — to dramatically improve layer-adhesion strength.

**22. Offer a hollow/shelled hub mode with internal ribs.** For large hubs, a solid core wastes filament and warps. Add a shell-with-gyroid-or-rib-infill option distinct from `boreThrough`, so big timber hubs print fast, light, and flat.

**23. Add a "split hub" mode for hubs bigger than the build plate.** High-valence base hubs on a big dome can exceed 220 mm. Auto-split into dovetailed/bolted halves with registration features, so any dome is printable on any printer. Pairs with the existing plate-pack logic (`printability.ts:147`).

**24. Centralize the magic numbers into a tunables module.** The `× 2.5` socket multiplier (`socket-fit.ts:47`), `baseSharpAngle` 66/52, `screwDia ?? 4.2`, rib factors, foot ratios — all scattered, all undocumented. One commented `tunables.ts` makes the engine legible and safe to adjust.

**25. ✅ Bound the `n!` strut-permutation alignment.** `matchDirPermutation` (`hub-orient.ts:44`) brute-forces all `n!` permutations per vertex via `bestAlignment`, and any >3° residual triggers a full CSG rebuild (`hub-prototype.ts:159`). On high-frequency domes with many near-symmetric vertices this dominates runtime. Use the existing greedy matcher or the Hungarian algorithm, and memoize per `(type, vertex)`.

**26. Cache the intermediate `Manifold` solid, not just the `BufferGeometry`.** Preview→export currently rebuilds all CSG from scratch at `detail ≥ 64`. Caching the solid lets export reuse preview work and slashes batch-export time.

**27. Add a true teardrop/capsule strut-tip option.** Arms are currently linear-taper cones (`node-hub-manifold.ts:176`). A real teardrop or hemispherical-capped tip prints with zero support and seats tubes more gently. Small geometry change, nicer prints.

---

## §3 — Materials: From Straws to 2×4s (Hit the Whole Spectrum)

*The stated mission names "straws to pipes to 1×2s and 2×4s." Today the catalog can't reach either extreme. Fix the range.*

**28. ✅ 🎯 Add the tiny end: drinking straws, bamboo skewers, dowels.** The catalog's smallest entry is a 6 mm *metal* rod (`catalog.ts:183`). Straws (~6–8 mm OD, paper & plastic), bamboo skewers (~3–4 mm), and wooden dowels (¼", ⅜", ½", 6/8/10/12 mm) are *named in the mission* and entirely absent. Add a `dowel`/`hollow-tube` category. Straw-scale domes are the #1 way people fall in love with geodesics.

**29. ✅ 🎯 Fill the lumber gaps: 2×3, 2×8, 2×10, 1×6, 1×8.** The catalog stops at 2×6 (`catalog.ts:84`). And there's still no **2×4 preset** despite `lumber-2x4` existing — the literal headline material has no starting point.

**30. ✅ Extend pipe ranges: 1½" & 2" PVC, larger EMT, Schedule 80.** PVC stops at 1¼", EMT at 1" — too small for any human-scale dome. Add the structural sizes and a wall-schedule distinction (Sch40 vs Sch80 changes both fit and strength).

**31. ✅ Add whole missing families: fiberglass/pultruded rod, EMT vs rigid conduit, copper, aluminum tube/T-slot, carbon fiber, rebar, cardboard tubes.** Fiberglass rod (tent-pole material) is a *classic* dome strut and isn't even representable. These open up tensioned, lightweight, and architectural builds.

**32. ✅ 🎯 Store real material *properties*, not just cross-sections.** `MaterialProfile` (`catalog.ts:6`) holds only dimensions. Add `wallThicknessMm` (so OD→ID→weight is knowable — Sch40 vs Sch80 are indistinguishable today), `densityKgM3`, `elasticModulusGPa`, and `costPerM`. This is the foundation for weight, strength, and span guidance.

**33. ✅ Distinguish tube wall thickness from connector wall thickness.** Critical subtlety: the catalog's `defaultWall` is the *printed connector's* socket wall, not the *stock tube's* wall. They're different physical things and conflating them blocks any weight/strength calc. Name them separately.

**34. Make the material system data-driven / pluggable.** `MaterialCategory` is a hardcoded union (`catalog.ts:3`) with an exhaustive label map, so every new family touches the type, the labels, and every consumer. Move to a registry so adding "copper Type L" is one data entry, not a code change. Then let users add custom stock.

**35. Add fractional-inch and trade-name display for imperial.** Imperial users currently see machine decimals — `0.750 in`, `OD 1.050 in`, `13.1 ft` (`units-ui.ts:22`) — never "¾"", "2×4", or "8′ 6″". The `nominal` trade name is already stored; show it, plus nearest fraction and feet-inches composites. Huge credibility win with the maker audience.

**36. ✅ Warn when a strut is longer than the stock — and model splice couplers.** `optimizeStickCount` silently does `Math.min(need, stockLenM)` (`material.ts:67`), so an oversized strut produces a plausible-but-impossible count. Detect it, warn, and offer a coupler/splice count (real domes splice constantly).

**37. ✅ Per-material cost and stock length.** Today one global `stockPrice`/`stockLength` covers straws and 2×6s alike (`material.ts:124`). Move price + stock length onto the profile (or allow "$/m"), and report leftover offcut.

**38. Add a material *comparison* view.** "Here's your dome in ¾" PVC vs 1" EMT vs 2×4: cost, weight, longest strut, stiffness, build time." This is exactly the "figure out how to construct this with a range of materials" deliverable — make it a first-class screen, not a guess.

**39. Refine the filament estimate.** `SHELL_FRACTION` is a fixed 0.2 regardless of hub size or wall count (`material.ts:111`), and supports/brim/purge are ignored. Make it depend on `wall`/`nozzle`/perimeters for honest gram and dollar numbers.

**40. Add a "what do I have?" material picker as the entry point.** Most people don't start from a dome spec — they start from "I have a bag of straws" or "a stack of 2×4s." Lead with the material; derive a sensible dome from it.

---

## §4 — The Build Layer: Cut Lists, BOMs & Assembly

*This is the biggest missing half of the product. The app stops at "here are your files." A real builder needs "here's how to turn these into a dome."*

**41. 🎯 Generate a real Assembly Guide.** Today the only assembly doc is a 5-line README inside the ZIP (`export.ts:84`). Produce a proper guide (HTML/PDF) that states, per dome: struts by length *with the explicit definition of how length is measured*, hub counts by type and *where each sits* (base ring vs. body — already known via `dome.isBase`/`isDoor`), and a ring-by-ring assembly order. This is the bridge from "files" to "dome."

**42. ✅ 🎯 Fill in the strut→hub adjacency that's already stubbed.** `strutTableCsv` defines `hub_a,hub_b` columns and emits them **empty** (`math.ts:318`). Every edge knows its two endpoints; every vertex maps to a hub type. Filling these turns "cut these lengths" into "cut these lengths, each joins hub H3 to H5" — pure data you already have.

**43. ✅ 🎯 Emit a per-stick cut sheet.** `optimizeStickCount` already computes first-fit-decreasing bin assignments — then *throws them away*, returning only the count (`material.ts:52`). Surface the layout: "Stick 3: cut S1, S1, S4, leftover 210 mm." This is the difference between a number and a usable plan.

**44. ✅ Produce a true purchasing list in trade units.** The BOM lists struts in meters with a free-text OD (`export.ts:507`). A shopper needs "buy 14 × 8 ft sticks of ¾" PVC, 1 × ½" set screws (qty 96), 2 tubes PVC cement." Roll up total linear length, nominal sizes, and round up to purchasable stock.

**45. ✅ Count the fasteners and consumables.** The connectors use screws (`screwHoles`, `screwDia`) but the BOM lists zero screws, zero glue, zero couplers. Compute and include them — a build stalls fast when you're three screws short.

**46. Number and label every hub and strut for assembly.** Emboss `H3-A` style IDs on hubs (the emboss path exists — `hub-decorations.ts`) and print matching strut tags. Cross-reference them in the assembly guide and the hub-map SVG. Geodesic domes are a sea of near-identical parts; labels are everything.

**47. Generate per-hub "socket maps."** For each hub, a little diagram: which socket points where, which strut length goes in it, what angle. Eliminates the "which arm is which?" confusion that wrecks first builds.

**48. Add an interactive 3D assembly sequencer.** Step through the build in the 3D view — ring 0, then ring 1, highlighting which struts and hubs go in next. Doubles as the on-screen version of the printed guide (and see item 83).

**49. Output the cover/skin panel geometry.** A dome isn't done until it's covered. Generate the triangular face panels (flat-pattern with seam allowance) for polycarbonate, plywood, canvas, or shrink-wrap, including the panel cut angles. This needs item 5's angle math.

**50. Estimate total build time and crew.** "≈ 18 hub-hours to print, ≈ 40 struts to cut, ≈ 4 person-hours to assemble, 2 people recommended." Sets expectations and makes the project feel real and plannable.

**51. ✅ Include the vertex-coordinate table in the bundle.** `vertexCoordsCsv` exists (`export.ts:533`) but isn't in the ZIP. It's the ground-truth adjacency map for anyone scripting or double-checking the build — ship it.

**52. Add a foundation/ground-plan export.** A top-down SVG of where the base hubs land, with spacing dimensions, so people can lay out anchors and a foundation ring before a single strut goes up.

---

## §5 — Structural Soundness & Real-World Safety

*People will stand inside these. The tool should help them not get hurt — and not be timid where it's safe.*

**53. ✅ 🎯 Add a span/strength check per material.** With item 32's properties in place, warn when the longest strut exceeds a material's safe unsupported span (a drinking straw can't be a 1.5 m strut). `longestStrutM` is already computed (`material.ts:123`) — just unused for validation. This is the single most safety-relevant addition.

**54. ✅ Estimate total structure weight.** Sum strut mass (from density × length) + hub mass (already have volume). "This dome weighs 34 kg" tells you whether you can lift it, what anchors you need, and whether the base material will hold.

**55. Snow- and wind-load sanity checks.** Given a diameter, coverage, and locale-typical loads, flag whether the chosen material/frequency is plausibly adequate or wildly under-built. Even a rough "green/yellow/red" beats silence.

**56. Base anchoring guidance and hardware.** Domes are kites until anchored. Add base-hub variants with stake holes, foundation-ring brackets, or ballast-point geometry, and include anchors in the BOM. Tie to `dome.isBase`.

**57. Hub weatherproofing options.** The classic geodesic failure is *leaks at the hubs*. Offer gasket grooves, drip lips, and sealed vs. drained socket modes (the `baseVent` drainage idea generalizes). A dome that doesn't leak is a dome people keep.

**58. Material-specific durability warnings.** PVC embrittles in UV within a few seasons; EMT rusts where galvanizing is cut; untreated wood rots at ground contact. Surface these as contextual notes per chosen material so nobody's surprised in year two.

**59. Riser/knee-wall support.** A pure dome has miserable headroom at the edges. Add an optional cylindrical riser wall under the base ring (extra height, vertical walls) — one of the most-requested real-world dome mods, and it changes the base-hub geometry the tool already generates.

**60. Door and window structural framing.** The door feature (`truncDome` door wedge) just *removes* struts — it doesn't reinforce the opening. Add reinforced jamb hubs and a header so the opening doesn't weaken the shell.

**61. A "buildability score."** Roll the checks into one honest headline: span OK, plate-fits OK, watertight OK, weight reasonable, leak-risk managed. A single confidence read that says "yes, you can build this" — or exactly what to change.

---

## §6 — UX, Onboarding & Delight

*The engine is deep; the on-ramp is a cliff. Make the first five minutes magical.*

**62. 🎯 Add a purpose-first "Start a Build" wizard.** There is *zero* onboarding today — a newcomer faces "V-Level," "Goldberg dual," and "Manifold smooth-union" cold. Ask three questions: **what for?** (greenhouse / play dome / shelter / art), **how big?**, **what material?** (2×4 / PVC / EMT / straws). Map answers onto the existing `applyPreset`/`applyMaterialStock`. This alone could 10× the number of people who succeed.

**63. ✅ 🎯 Fix the broken Print Guide link and surface help inline.** `index.html:84` links to `docs/PRINT-GUIDE.md` — a relative path Vite doesn't serve, so it **404s in production**. That excellent guide (tolerance tuning, screw sizes, assembly tips) is currently unreachable. Bundle it as an in-app panel and add a persistent "?" affordance.

**64. ✅ Add a strut-length color legend.** The dome renders a beautiful length-coded rainbow (`main-scene.ts:79`) with **no legend anywhere**. Add a min↔max ramp overlay, and let clicking a cut-list row highlight those struts on the model. Turns decoration into a map.

**65. One-click "Apply" for the suggested print orientation.** The inspector computes a better print-up vector and shows it as `Try [x, y, z]` text the user must *hand-transcribe* into three fields (`app.ts:310`). Make it a button. Add orientation presets: "largest socket down," "upright," "auto."

**66. Tame inspector complexity with Basic/Advanced.** ~25 overlapping shaping sliders (Blend Radius, Junction Meet, Connection Length, Strut Size, Mesh Smooth, Taper, Drip, Noise…) overwhelm. Lead with the ✨ "feel" presets, hide the topology knobs behind "Advanced," and add one labeled diagram of node vs. sleeve vs. connection-length.

**67. ✅ Make destructive actions safe.** "Reset to Defaults" does an unconfirmed `location.reload()` (`bindings.ts:579`) — one misclick nukes an in-progress design. Add a confirm step, and replace the blocking `prompt()` for preset names (`app.ts:209`) with an inline field.

**68. Add undo/redo.** With dozens of live-rebuilding sliders, the only recovery is a full reset. A simple settings-history stack would make experimentation fearless.

**69. Add hover affordances on clickable vertices.** Clicking a vertex opens the inspector — the primary discovery path — but it's only hinted in tiny text and there's no hover highlight or cursor change. Make clickability obvious.

**70. ✅ Remove or implement the orphaned `auto-open-inspector` control.** It's read, written, and bound in code (`app.ts:163`, `bindings.ts:314`) but **has no markup in `index.html`** — permanently dead. Either wire the checkbox or delete the dead path.

**71. Accessibility pass.** Associate toggle labels with inputs via `for`/`id` (clicking the text should toggle); trap and restore focus in the inspector dialog (it sets `aria-modal` but doesn't enforce it); add non-color cues + the legend for valence/length (color-only fails color-blind users); add `aria-live` to validation badges and stats.

**72. Real-time vs. heavy-compute feedback.** V7–V8 domes and batch exports can be slow with only a spinner. Add progress with counts ("hub 7 of 14") and a cancel button. Consider a Web Worker so the UI never freezes.

---

## §7 — Print & Fabrication Pipeline

*From "watertight STL" to "this slid into my slicer and printed perfectly the first time."*

**73. Export per-hub recommended slicer profiles.** The PRINT-GUIDE has great per-material settings (walls, infill, supports). Emit them as a sidecar (or a Cura/PrusaSlicer/Orca profile snippet) per hub, so the user doesn't re-enter them by hand.

**74. Add 3MF with embedded color/material and per-object settings.** The 3MF path exists (`export.ts:370`) — extend it with per-object print settings and labels so a whole plate carries its own instructions into the slicer.

**75. Smarter auto-orientation with overhang minimization.** `choosePrintUp` (`hub-foot.ts:25`) is a heuristic with magic weights. Evaluate several candidate orientations against the actual overhang heatmap and pick the one with least support area — and show the user the trade-off.

**76. Tree-support and brim recommendations per hub.** Some hubs genuinely need support; the tool should say *which* and *where*, not leave it to chance. The `treeSupportBase` flag is a start — make it advisory and automatic.

**77. Multi-part and modular printing.** Beyond split hubs (item 23), allow printing a hub as node + snap-on sleeves so one node design serves multiple strut counts and giant hubs become trivial.

**78. Print-farm batch optimizer.** Given plate size and printer count, pack all unique hubs across the fewest plates/print-jobs and estimate wall-clock time. The plate-pack logic (`printability.ts:147`) is the seed — make it a real scheduler.

**79. STL/3MF round-trip verification on export.** Re-parse the exported bytes and assert triangle count and watertightness match the in-memory mesh (`exportHubStl` is currently never byte-tested — item 92). Catch corrupt exports before the user wastes a 6-hour print.

**80. A "scale model first" mode.** One click to shrink the whole dome to a desktop-printable model (e.g. 1:10) with friction-fit straw-scale sockets, so people prototype the *whole structure* in an evening before committing to full-size material. This is delight *and* de-risking.

---

## §8 — Visualization & Simulation

*Make it feel alive. Domes are inherently beautiful — lean in.*

**81. Exploded / X-ray assembly view.** Pull every hub and strut apart along its normals with a slider, so the structure's logic is instantly legible. Pairs with the sequencer (item 48).

**82. 🎯 AR "view at real scale."** Let someone point a phone at their backyard and see the dome at full size before cutting anything. WebXR makes this feasible and it's the single most shareable, jaw-drop feature you could add.

**83. Assembly time-lapse animation.** Watch the dome build itself ring by ring. Gorgeous for sharing, genuinely useful as a build preview.

**84. Sun-path / daylight simulation.** For greenhouse and living-space domes, simulate sun angles through the day/seasons so people can orient the door and plan glazing. Deeply practical for the greenhouse preset crowd.

**85. Physics/deflection preview.** With material properties (item 32), do a lightweight FEA-ish color map of where the structure flexes under load. Even approximate, it's both educational and trust-building.

**86. Ground-shadow and footprint overlay.** Show the dome's real footprint and shadow on a to-scale ground plane (the current grid is abstract world units). Helps siting and permits.

---

## §9 — Testing, CI & Correctness Guards

*The code is unusually disciplined (strict TS, zero `any`, real manifold-topology tests). The gap is numerical ground truth and a leaky gate.*

**87. ✅ 🎯 Gate PRs on typecheck.** `tsc --noEmit` only runs in the *deploy* job (post-merge, main only). **A PR with type errors passes CI today** because Vitest transpiles without type-checking. Add `npm run build` to the `test` job (`.github/workflows/ci.yml`). One line, biggest CI fix.

**88. Add ESLint + Prettier and enforce them.** CONTRIBUTING promises "no `any`" but nothing enforces it. Add the linters with `no-floating-promises` (there are un-awaited `void app.buildDome()` calls) and a CI step.

**89. ✅ 🎯 Add chord-factor ground-truth tests.** Assert V1 icosphere = 1 strut × 30; assert V2 strut-length ratio ≈ 0.348/0.403; pin golden `length.toFixed(4)` values. This is what actually *proves* item 1's fix is correct and keeps it correct.

**90. ✅ Add Euler-characteristic and hub-angle assertions.** `V − E + F === 2` on `genSphere` output; 6-valent ≈60°, 5-valent ≈63.43° in `classHubs`. Cheap, high-value invariants (and item 14).

**91. ✅ Prove `validateStlGeometry` actually detects breakage.** Both existing tests are trivial (valid tetra, empty). Feed it a box-with-one-face-removed and assert it reports the open edge — otherwise the detector itself could be broken and silent.

**92. ✅ Test the real STL/3MF/CSV bytes.** `exportHubStl` (`export.ts:164`) is never directly tested — only the in-memory validator. Round-trip the exported blob → same triangle count, valid header. Smoke-test `bomCsv`, `vertexCoordsCsv`, `designJson`.

**93. Stabilize and de-flake the visual tests.** Loose `maxDiffPixelRatio` (0.08/0.12) hides real drift, while macOS-captured baselines diff against Linux CI renders (false positives masked by `retries: 2`). Generate per-platform baselines or pin a containerized Chromium; move visual tests off the blocking gate.

---

## §10 — Architecture & Extensibility

*Keep it a joy to build on as it grows.*

**94. Decompose the `app.ts` god-file (760 LOC, 54 methods).** Extract the ~10 export methods into an `ExportController` and the inspector logic into its own module. This shrinks the least-tested, largest file and makes export orchestration unit-testable.

**95. Consolidate duplicated geometry helpers.** Signed-tetra volume is implemented three times; `toNonIndexed` + seat-on-bed + foot logic recurs across five files; `prepGeo` exists but isn't used universally. One `mesh-utils.ts` cuts dozens of lines and bug surface.

**96. ✅ Cover (or retire) the legacy fallback pipeline.** `createLegacyHubFromDirs` is a whole second geometry system that runs only when Manifold fails — i.e. it's **never exercised** by tests (setup always inits Manifold) and could be silently broken right now. Add one test that forces it, or remove it if WASM is now reliably available.

---

## §11 — Moonshots & Pure Joy 🚀

*Because you said make it wonderful, and a little magic earns a lot of love.*

**97. Name your dome and generate a shareable "build poster."** A one-page printable poster: a beauty render, the spec, the cut list summary, a QR code to the share URL. People will pin these to workshop walls and post them online — free marketing and pure delight.

**98. QR codes embossed on hubs linking to their assembly step.** Print a hub, scan it, and your phone shows exactly where it goes and what plugs into it. The emboss machinery already exists — point it at a URL.

**99. A community gallery with one-click "remix."** `public/gallery/` exists but is empty. Let people publish a dome (it's all in a share URL already) with build photos, and let others fork it. Turn solo tinkering into a movement.

**100. Generative "dream dome" mode.** A button that throws together a delightful, structurally-valid dome — surprising frequency, topology, material, and organic hub style — as a daily creative spark. The Goldberg/metaball/coral machinery is already there; let it play. Sometimes the best designs come from "ooh, what's *that*?"

---

## 🗺️ Suggested Roadmap — If You Only Do Ten Things

The whole list is a buffet, but here's the critical path to "accurate *and* wonderful," in order:

| # | Item | Why it's first |
|---|------|----------------|
| 1 | **#1 — True cut length** | Fixes the actual complaint. Nothing else matters if the numbers lie. |
| 2 | **#3 — Single socket-geometry source of truth** | The plumbing that makes #1, #4, and #5 correct and drift-proof. |
| 3 | **#89 + #9 — Chord-factor ground-truth tests** | Proves #1 is right and locks it in forever. |
| 4 | **#5 — Strut end-cut angles** | Unlocks timber butt-joints and panel skins — the "build from 2×4s" half. |
| 5 | **#28 + #29 — Straws + 2×4 materials/presets** | Makes the headline mission literally true. |
| 6 | **#41 + #43 — Assembly guide + cut sheet** | Bridges "files" → "dome." The missing product half. |
| 7 | **#62 — Purpose-first wizard** | Turns the on-ramp cliff into a ramp; multiplies everyone who succeeds. |
| 8 | **#17 — Detect pinched metaball struts** | Closes a silent ship-to-printer correctness hole. |
| 9 | **#53 — Span/strength safety check** | People stand inside these. |
| 10 | **#87 — Typecheck gate in CI** | One line; stops the foundation from re-cracking. |

Do those ten and the tool goes from "impressive hub generator with a strut bug" to "the thing I'd actually build my dome with." The other ninety make it the thing people *love*.

---

*Now go make something wonderful. The hard part — a watertight, organic, four-style CSG hub engine — is already done and it's genuinely beautiful. The rest is just telling the truth about lengths and helping people build. You've got this. 🌐*
