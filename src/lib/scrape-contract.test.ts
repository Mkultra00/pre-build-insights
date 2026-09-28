import { describe, expect, it } from "vitest";
import { buildReportJSON, SECTIONS, type DbFact, type DbReport } from "./report-schema";

/**
 * The scrape contract: a consumer reading only ids and data-* attributes out of
 * the HTML must recover exactly what the JSON twin says. Class names are free
 * to change; these attributes are not.
 */

const report: DbReport = {
  id: "11111111-2222-3333-4444-555555555555",
  slug: "abcd1234",
  schema_version: "1.0",
  address_raw: "350 W 42nd St, New York, NY 10036",
  address_norm: "350 WEST 42 STREET, New York, NY, USA",
  bbl: "1010130001",
  neighborhood: "Hell's Kitchen",
  borough: "Manhattan",
  city: "nyc",
  lat: 40.7578,
  lon: -73.9921,
  radius_m: 805,
  status: "complete",
  stage: "complete",
  progress: 100,
  partial: false,
  error: null,
  sections: {
    timeline: [
      { text: "The station opened in 1875 [f-0001].", fact_refs: ["f-0001"] },
    ],
  },
  generated_at: "2026-09-28T20:00:00.000Z",
};

const facts: DbFact[] = [
  {
    ref: "f-0001",
    section: "timeline",
    category: "place",
    claim: "The 42nd Street station opened on November 6, 1875.",
    event_date: "1875-11-06",
    place_name: "42nd Street station",
    lat: 40.7576,
    lon: -73.9932,
    distance_m: 95,
    geo_precision: "IN_RADIUS",
    confidence: 0.8,
    is_folklore: false,
    origin: "structured",
    source_name: "Wikipedia",
    source_url: "https://en.wikipedia.org/wiki/42nd_Street_station",
    retrieved_at: "2026-09-28T19:59:00.000Z",
  },
];

/** Minimal stand-in for the page markup, built from the same JSON document. */
function renderFixtureHtml(): string {
  const json = buildReportJSON(report, facts);
  const sections = SECTIONS.map(({ id }) => {
    const paragraphs = json.sections.find((s) => s.id === id)?.paragraphs ?? [];
    const sectionFacts =
      id === "sources" ? json.facts : json.facts.filter((f) => f.section === id);
    const empty = paragraphs.length === 0 && sectionFacts.length === 0;
    return `<section id="${id}" data-section="${id}" data-empty="${empty}" data-fact-count="${sectionFacts.length}">
      ${paragraphs
        .map(
          (p) =>
            `<p data-paragraph="" data-fact-refs="${p.fact_refs.join(" ")}">${p.text}</p>`,
        )
        .join("")}
      ${sectionFacts
        .map(
          (f) =>
            `<li data-fact-ref="${f.ref}" data-precision="${f.geo_precision}" data-distance-m="${f.distance_m ?? ""}"><span data-fact-claim="">${f.claim}</span></li>`,
        )
        .join("")}
    </section>`;
  }).join("");

  return `<main id="report" data-report-id="${json.id}" data-slug="${json.slug}" data-status="${json.status}" data-schema-version="${json.schema_version}" data-lat="${json.location.lat}" data-lon="${json.location.lon}" data-radius-m="${json.input.radius_m}">${sections}</main>`;
}

const attr = (html: string, name: string) =>
  html.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

describe("scrape contract", () => {
  const html = renderFixtureHtml();
  const json = buildReportJSON(report, facts);

  it("exposes report identity on #report", () => {
    expect(html).toContain('id="report"');
    expect(attr(html, "data-report-id")).toBe(json.id);
    expect(attr(html, "data-slug")).toBe(json.slug);
    expect(attr(html, "data-status")).toBe(json.status);
    expect(attr(html, "data-schema-version")).toBe(json.schema_version);
    expect(Number(attr(html, "data-radius-m"))).toBe(json.input.radius_m);
    expect(Number(attr(html, "data-lat"))).toBe(json.location.lat);
  });

  it("renders every section, present even when empty", () => {
    for (const { id } of SECTIONS) {
      expect(html).toContain(`data-section="${id}"`);
    }
    expect(json.sections).toHaveLength(SECTIONS.length);
  });

  it("marks empty sections so a consumer can tell blank from missing", () => {
    const origins = html.match(/<section id="origins"[\s\S]*?<\/section>/)![0];
    expect(attr(origins, "data-empty")).toBe("true");
    expect(attr(origins, "data-fact-count")).toBe("0");
  });

  it("matches the JSON twin fact-for-fact", () => {
    for (const fact of json.facts) {
      const li = html.match(
        new RegExp(`<li data-fact-ref="${fact.ref}"[\\s\\S]*?</li>`),
      )![0];
      expect(attr(li, "data-precision")).toBe(fact.geo_precision);
      expect(attr(li, "data-distance-m")).toBe(String(fact.distance_m));
      expect(li).toContain(fact.claim);
    }
  });

  it("keeps paragraph citations aligned with fact refs", () => {
    const p = html.match(/<p data-paragraph=""[\s\S]*?<\/p>/)![0];
    const refs = attr(p, "data-fact-refs")!.split(" ");
    for (const ref of refs) {
      expect(json.facts.some((f) => f.ref === ref)).toBe(true);
    }
  });

  it("never renders an unverifiable claim", () => {
    for (const fact of json.facts) {
      expect(["ADDRESS", "IN_RADIUS", "NEARBY", "NEIGHBORHOOD"]).toContain(
        fact.geo_precision,
      );
    }
  });
});
