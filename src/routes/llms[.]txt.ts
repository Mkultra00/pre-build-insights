import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = `# Palimpsest

Address-radius neighbourhood history and colour reports for New York City.
One street address in, one cited, geo-verified report out, covering a 0.5-mile radius.

## Machine access

- Create a report: POST ${origin}/api/v1/reports
  body: {"address": "350 W 42nd St, New York, NY 10036", "radius_m": 805}
  returns: {"id", "slug", "status", "urls": {"html", "json", "status"}, "run_url"}
- Build a queued report: POST ${origin}/api/public/pipeline/run  body: {"id": "<report id>"}
- Poll status: GET ${origin}/api/v1/reports/{id}
- Report as HTML (server-rendered, no JavaScript needed): ${origin}/r/{slug}
- Report as JSON (same data): ${origin}/r/{slug}/json
- JSON Schema: ${origin}/schema.json

## Scrape contract

HTML and JSON are rendered from one document, so they cannot disagree.
Target ids and data-* attributes, never class names.

- <main id="report"> carries data-report-id, data-status, data-progress, data-lat, data-lon,
  data-radius-m, data-city, data-bbl, data-schema-version, data-generated-at.
- Each <section> carries data-section (summary, origins, timeline, treatment, vice,
  dark_history, folklore, sources), data-empty, data-fact-count.
- Each fact <li> carries data-fact-ref, data-precision, data-distance-m, data-category,
  data-folklore, data-confidence.
- Narrative paragraphs carry data-paragraph and data-fact-refs.
- <link rel="alternate" type="application/json"> points at the JSON twin.
- schema.org Place + ItemList is embedded as JSON-LD.

## Guarantees and limits

- Every rendered claim has a source URL and a location-precision label:
  ADDRESS, IN_RADIUS, NEARBY or NEIGHBORHOOD. Unverifiable claims are never rendered.
- A report returns HTTP 200 with all eight sections present from the moment it is created;
  unfinished sections carry data-empty="true".
- No safety score, no neighbourhood rating, no demographic data, no victim names.
- New York City only.
`;
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
