# Palimpsest roadmap

Done
- Design system, entry page `/`, SSR report page `/r/$slug` with all eight sections always present.
- Database: reports, facts, pipeline_tasks, source_cache (public read of reports and verified facts).
- Machine surface: `/r/$slug/json`, `/schema.json`, `/llms.txt`, `/robots.txt`, JSON-LD, stable `data-*` contract, contract test.
- API: `POST /api/v1/reports`, `GET /api/v1/reports/{id}`, `POST /api/public/pipeline/run` (idempotent).
- Adapters live: NYC GeoSearch geocode, Wikipedia geosearch, NYPD complaints, treatment-facility locator.
- Narrator with citation-safe paragraph recovery on truncated replies.

Open
- Origins section has no source yet (needs historical-map / NYPL or Wikipedia-article research pass).
- Treatment adapter returns nothing for tested addresses — verify the findtreatment.gov endpoint and its parameters.
- Dark history: mass-killing and historical-crime datasets need a one-time static ingest.
- Folklore: Shadowlands haunted-places index needs a one-time static ingest.
- Open web research pass (Firecrawl) not wired; Firecrawl connector not yet linked.
- Pre-warm the two demo addresses so the entry page returns instantly.

- [x] Dark history: occult mentions in radius with addresses (needs Firecrawl link)
- [ ] GitHub repo on mkultr00 (user connects via + menu > GitHub)
