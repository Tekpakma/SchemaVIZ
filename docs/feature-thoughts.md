# Feature Thoughts: Smart Auto-Select for Deeper Routes

Status: parked for later. This document captures the evaluation, implementation plan, and the record-grounded scoring extension. Pick up from "Rollout" when ready to start.

---

## Context

Today, when a user adds a `TraversalEdge` between two models in the builder, the route between them is either:
- **Derived** from the template's parent/child step structure (`createRecipeFromTemplate` in `frontend/src/features/builder/templateRecipe.ts:343`), or
- **Manually picked** via `ModelPickerDialog` when the user wants a multi-hop path.

There is no smart auto-select for deeper routes. The existing backend ranker `_rank_paths_by_preferences` (`backend/django_schema_viz/utils/schema_discovery.py:837`) sorts by `(preferred_models match, intermediate novelty, path length)` — useful but weak. The frontend persists chosen routes as `TraversalEdge.routeSteps` inside `layoutSettings.edges`, so there is *some* signal for future learning, but it's polluted (see Phase 0).

## Evaluation of the original proposal

The original proposal had five parts: deterministic scoring → high-confidence gate → learn from confirmations → bounded learning → "Conservative Smart Auto v1".

**Where it was right**
- Confidence ratio, not absolute score: `score(best) / score(second_best) > τ` is the only gate that doesn't railroad users on near-ties.
- Probe coverage as input: the strongest signal available. Should be first-class, not a tiebreaker.
- Persisted routes as learning signal: correct in principle, but the persistence model needs fixing first.

**Where I pushed back**
1. **Hard-coded name blocklist (Tag/Label/Type/...) is fragile.** Locale-dependent, app-specific, and miscategorises legitimate domain models. Replace with **graph topology**: a model whose in-degree FKs come from N unrelated apps and whose rows are referenced disproportionately is generic — provable from `_meta`, no name list needed. Use name heuristics only as a tiebreaker.
2. **`auto: true` on `TraversalEdge` conflates three states.** Today it's true for derived edges and stays true after acceptance, so the learning signal can't distinguish *accepted-suggestion* from *unchanged-default* from *manually-chosen*. Fix before any learning work.
3. **"Per-user/per-template-family counts" is the wrong layer.** Aggregate at `(tenant, modelA, modelB) → routeSignature` with a bounded ±15% adjustment. Cap so it never overrides hard rules.
4. **Auto-pick UX needs reasons, not just a label.** Surface 2–3 driving factors inline ("via verbose_name match • shortest • probe: 47 rows"). Makes the system debuggable and the user able to disagree intelligently.

---

## Implementation Plan: Conservative Smart Auto Route v1

### Phase 0 — Disambiguate the persistence signal (prerequisite)

Without this, "learn from confirmations" learns from noise. Ship before any scoring work.

**Files:** `frontend/src/features/builder/types.ts`, `frontend/src/features/builder/templateRecipe.ts`

1. Extend `TraversalEdge`:
   ```ts
   source: 'derived' | 'auto-confident' | 'suggested-accepted' | 'manual'
   confidence?: number          // 0..1, present when source = 'auto-confident' | 'suggested-accepted'
   scoreComponents?: RouteScoreComponents  // for debug + reasons UI
   ```
   Keep `auto: boolean` for back-compat; derive from `source !== 'manual'`.
2. Update `deserializeEdges` (templateRecipe.ts:254) to read `source` defaulting to `'derived'` when missing — old templates flow through unchanged.
3. Update `createRecipeFromTemplate` (templateRecipe.ts:343) to stamp `source: 'derived'` on edges built from `parentId`/`relationship`.
4. Migration: none — `layoutSettings.edges` is JSON; absent field reads as `'derived'`.

**Tests:** extend `templateRecipe.test.ts` round-trip cases for each `source` value.

### Phase 1 — Backend scorer with components

Refactor `_rank_paths_by_preferences` (`backend/django_schema_viz/utils/schema_discovery.py:837`) into a real scorer.

**New dataclass** alongside `RouteStep`:
```python
@dataclass(frozen=True)
class RouteScoreComponents:
    length: int                  # hop count
    hub_penalty: float           # topology-derived
    through_table_penalty: float # M2M-only bridges
    verbose_name_boost: float    # FK verbose_name token match start↔end
    probe_rows: int | None       # Phase 3, None until then
    learned_adjustment: float    # Phase 4, 0.0 until then
    # Phase 3.5 additions:
    coverage: float | None
    selectivity: float | None
    diversity: float | None
    stability: float | None
```

**New method** `_score_path(path, start, end, schema_ctx) -> (score: float, components)`:
- `length`: `-0.5 * hops`
- `hub_penalty`: per intermediate model, `-log(1 + in_degree_distinct_apps)` — cached per schema_hash.
- `through_table_penalty`: `-1.0` per intermediate that is an M2M `through=` with no other inbound non-M2M FKs.
- `verbose_name_boost`: `+0.3` if any hop's field `verbose_name` shares ≥1 non-stopword token with end model's `verbose_name`.

**Replace** the existing ordering with `sorted(paths, key=-score)`. Keep `preferred_models` as an additive `+0.4 * matched_count` so existing callers are unaffected.

**New endpoint** `GET /api/schema/routes-rank?from=<modelId>&to=<modelId>&top=5`:
- Returns `{ routes: [{ route: [RouteStep], score, components, confidenceRatio }] }`
- `confidenceRatio = score[0] / score[1]` (or `Infinity` when only one path)
- Reuses existing path-finder; only the ranker and serialiser are new.

**Tests:** unit tests for each component in isolation against a fixture schema.

### Phase 2 — Frontend auto-pick gate + reasons UI

**Files:** `frontend/src/features/builder/steps/TraversalStep.tsx`, `ModelPickerDialog.tsx`, new `frontend/src/features/builder/routeAutoSelect.ts`

1. New hook `useRouteSuggestions(fromModelId, toModelId)` calling `routes-rank`. React-Query keyed on `(schemaHash, from, to)`.
2. Pure helper `decideAutoSelect(suggestions, τ = 1.4)`:
   - `confidenceRatio >= τ` and `score[0] > 0` → `{ kind: 'auto-confident', route: suggestions[0] }`
   - Else → `{ kind: 'suggested', candidates: suggestions.slice(0, 3) }`
3. When user adds an edge between two models:
   - `auto-confident` → stamp `source: 'auto-confident'`, `confidence: ratioNormalised`, populate `routeSteps` and `scoreComponents`. Small "Auto • why?" affordance.
   - `suggested` → open `ModelPickerDialog` pre-populated with top-3, each row showing 2-3 reason chips. On accept, stamp `source: 'suggested-accepted'`.
   - Manual edit → `source: 'manual'`.
4. Pure function `formatReasons(components) -> string[]` — easy to unit-test.

**Tests:** `routeAutoSelect.test.ts` covering each decision branch + `formatReasons` table-driven cases.

### Phase 3 — Probe layer (cheap)

**Backend:**
- Helper `probe_path_row_count(path, sample_limit=100) -> int` — single `EXISTS`-bounded or chained `.values('pk')[:1]` per step. Cap total wall-time per probe at ~50ms.
- Cache by `(tenant_id, schema_hash, path_signature)` with short TTL (~5 min).
- Populate `RouteScoreComponents.probe_rows`, add `+0.6 * log10(1 + probe_rows)` term.

Flag-gate behind `SCHEMA_VIZ_ROUTE_PROBE_ENABLED`. Default off in tests, on in dev.

**Tests:** integration test against fixture models — assert empty-bridge path scores below equivalent-length non-empty path.

### Phase 3.5 — Record-grounded scoring (the "Google stores" extension)

Instead of "does this path return rows", ask **"sampled across real start records, how good is this path?"**. Each candidate path is a "product"; rank by stock + quality + behavioural signal.

**Signals (from a single sample of N≈20 start records):**

| Signal | Google analogue | Formula |
|---|---|---|
| **Coverage** | in-stock rate | `% of sample records where path returns ≥1 row` |
| **Selectivity** | not-too-broad, not-too-narrow | `-\|log10(median_rows_per_start) - target\|` (target≈1 for detail, ≈log10(20) for list) |
| **Diversity** | distinct-result quality | `distinct(end_pk) / total(end_pk)` across the sample |
| **Stability** | consistent quality | `1 - stdev(rows_per_start) / mean` — punishes one-record flukes |
| **Behavioural** | CTR | Phase 4 accept/reject ratio, bounded |

Combine as a weighted sum *after* the structural score, with weights tunable per-tenant.

**Cost control — this is the hard part.** Naive is N × K queries. Mitigations:
1. **Sample once, score many**: pick N start records first, then per candidate path one `Model.objects.filter(pk__in=sample).annotate(_route_count=...)` — one query per path, not per record.
2. **Sequential pruning**: compute coverage first (cheapest). Drop paths with `coverage < 0.2` before computing the rest.
3. **Sample stratification**: random sample is wrong — bias toward records the user is likely to view. Pull from `Drawing.records_referenced` or recent generation runs; fall back to random.
4. **Hard budget**: 200ms total wall-time per `routes-rank` call. If exhausted, return what you have with `components.probe_partial: true`.
5. **Cache aggressively**: `(tenant, schema_hash, path_signature, sample_hash) → components`. sample_hash invalidates when the "interesting records" set shifts.

**Slot:**
- Phase 3 stays as the cheap fallback (single COUNT, always on).
- Phase 3.5 is opt-in per-tenant via `SCHEMA_VIZ_ROUTE_PROBE_MODE = 'count' | 'record'`. Default `'count'`; flip to `'record'` for design-partner tenants first.
- `formatReasons` gets new chips ("8/10 records hit", "median 3 rows"). No frontend logic change beyond rendering.

### Phase 4 — Bounded learning

Only after Phase 0–3.5 ship cleanly.

**Backend:** new model `RouteFeedback(tenant_id, from_model_id, to_model_id, path_signature, accepts, rejects)`. Increment on:
- `accepts++` when `source = 'auto-confident' | 'suggested-accepted'` arrives in a saved template
- `rejects++` when an edge between the same `(from, to)` was previously suggested but persisted with a different `path_signature` or `source = 'manual'`

Detection lives in `recipeToGenerationTemplateWriteRequest` save path on the backend — diff incoming edges against previous version's edges.

**Scorer integration:** `learned_adjustment = clamp(0.15 * (accepts - rejects) / max(1, accepts + rejects), -0.15, +0.15)`.

**Tests:** unit-test the clamp; integration-test the diff logic.

**Honest caveat on the behavioural signal.** Google's CTR signal works because they have billions of queries. A schema with 10 active users picking routes produces statistical noise for months. Record-grounded scoring (3.5) is valuable *immediately* — the data exists day one. Behavioural scoring (4) only becomes reliable later. Don't reverse this order.

---

## Rollout

1. **Phase 0** immediately — pure types/persistence, no behaviour change.
2. **Phase 1 + 2** together behind frontend feature flag `smartRouteAutoSelectV1`. Internal dogfood first.
3. **Phase 3** once probe wall-time is measured on a real tenant schema.
4. **Phase 3.5** for design-partner tenants once Phase 3 is stable.
5. **Phase 4** only after ≥2 weeks of accept/reject data in the new `source` field.

## Out of scope (explicit non-goals)

- ML model / opaque scoring — components stay human-readable.
- Cross-tenant learning.
- Name-based blocklist (`Tag`, `Label`, etc.) — replaced by topology.
- Auto-rerouting existing edges when probe data changes — only fires on edge creation.

## Risk register

| Risk | Mitigation |
|---|---|
| Probe wall-time spikes on wide schemas | Hard 50ms cap (Phase 3) / 200ms cap (Phase 3.5); setting flag; cache |
| `confidenceRatio` threshold τ wrong | Log decisions for a week before tightening |
| Hub-penalty miscategorises legit dense models | Components surfaced in UI; user override is one click in `ModelPickerDialog` |
| Old templates' `auto: true` edges look "confident" | Phase 0 reads them as `source: 'derived'` — they never claim confidence |
| Record-grounded sample is biased | Stratify from real usage; document the bias; allow user to "rescore with my current record" |

## Key file references

- `frontend/src/features/builder/types.ts` — `TraversalEdge`, `TraversalRouteStep`
- `frontend/src/features/builder/templateRecipe.ts` — edge serialisation (`deserializeEdges` L254, `createRecipeFromTemplate` L308, `getFallbackRouteStep` L506)
- `frontend/src/features/builder/steps/TraversalStep.tsx` — UI entry point
- `backend/django_schema_viz/utils/schema_discovery.py` — `RouteStep` L296, `_rank_paths_by_preferences` L837
