# Palimpsest — feedback and build plan

## Feedback on the TDD

**The biggest assumption is outdated.** The TDD is built around "Lovable generates a client-rendered SPA, so a scraper sees an empty shell," and works around that with a Cloudflare Worker router plus separate render-html / render-json Edge Functions on a custom domain. This stack is TanStack Start: server-rendered by default, with real server routes. That whole layer disappears.

- `/r/:slug` can be the single URL: fully server-rendered HTML, correct status codes, JSON-LD, stable `id` / `data-*` attributes. No `/s/` mirror, no Worker, no duplicate renderer to keep in sync.
- `/r/:slug.json` and `/api/v1/*` become server routes in the same app, same domain.
- Dropping the second renderer removes the TDD's own top risk: HTML and JSON drifting apart.

**Other points worth changing:**

1. **Two report surfaces, one truth.** Store the report as a single validated JSON document; HTML renders from it. That makes the "selector stability" acceptance test trivial and keeps the scrape contract honest.
2. **Pipeline timing.** Long fan-out (geocode → adapters → research → verify → narrate) doesn't fit a single request. Use a queued task table with a status endpoint and polling, exactly as drafted — but note the report page must return `200` with `status: "pending"` and all eight sections present-but-empty, so a scraper never gets a half-page.
3. **LLM and search providers.** OpenRouter + Tavily aren't needed here. The built-in AI gateway covers extraction and narration; Firecrawl is the available connector for search/scrape/extract and does the same verification job. Fewer keys, no per-provider billing. (If you want Tavily specifically, it's a manual API key.)
4. **Scope for v1 is still too wide.** Eleven adapters, PDF export, MapLibre, voice, sitemap, API keys, hCaptcha. Cut to: NYC, four adapters, no PDF, no voice, no auth on read.
5. **Legal posture is right** — no safety score, no demographics, no victim names, precision badges, "no source, no sentence." Keep all of it, and put the disclaimer in the JSON too, not just the page.
6. **Unverified pieces to check at build:** SAMHSA locator endpoint, NYC GeoSearch, NYPD Socrata dataset IDs, the Shadowlands and mass-killing datasets (these two need a one-time ingest, they have no live API).

## Recommended v1

A server-rendered report site, scrapable by plain HTTP fetch, no JavaScript required.

**Routes**
- `/` — address entry, two pre-warmed demo addresses.
- `/r/$slug` — server-rendered report. Eight sections, always present.
- `/r/$slug.json` — the same report as JSON, same data, published schema.
- `/api/v1/reports` (POST create/reuse), `/api/v1/reports/$id` (GET status).
- `/schema.json`, `/robots.txt`, `/llms.txt` — so the consuming app can discover the contract.

**Scrape contract**
- Stable `data-*` attributes on `<main>` (report id, lat, lon, radius, city) and on every section, fact and citation.
- `<link rel="alternate" type="application/json">` to the JSON twin.
- JSON-LD `Place` + `ItemList` in the head.
- Meta tags for report id, status, generated-at, schema version.
- Contract test: parse fixture HTML using only ids and `data-*`, assert field-for-field equality with the JSON.

**Pipeline (queued, resumable)**
geocode → structured adapters (NYPD complaints, SAMHSA facilities, Wikipedia geosearch, haunted-places index) → web research → fact extraction → geo-verify (805 m) → source-verify → narrate → publish.

Every fact row: claim, date, place, source URL, `geo_precision` (ADDRESS / IN_RADIUS / NEARBY / NEIGHBORHOOD / UNVERIFIED), confidence, status. Only `verified` facts render. `UNVERIFIED` never renders.

**Data**
Lovable Cloud (Postgres). PostGIS where available; otherwise haversine distance in SQL — the radius math is simple enough not to need it. Tables: `reports`, `facts`, `sources`, `pipeline_tasks`, `source_cache`, plus static `haunted_places`, `mass_killings`, `landmarks`.

**Out of v1:** PDF, MapLibre, voice, user accounts, API keys, multi-city, sitemap.

## Build order

1. Design system + address entry page + report shell rendering an empty-but-valid report.
2. Cloud: schema, grants, RLS (public read of complete reports only).
3. Geocode + report creation + status polling + reuse by address hash.
4. JSON twin, JSON-LD, schema endpoint, contract test.
5. Adapters: NYPD complaints, SAMHSA, Wikipedia geosearch.
6. Web research + extract + geo-verify + source-verify.
7. Narrator with citation validation.
8. Static dataset ingest (haunted places, mass killings), remaining sections.

Steps 1–4 give a scrapable site immediately, with real structure and no content. Everything after that fills it in.
