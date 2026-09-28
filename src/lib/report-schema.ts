/**
 * The scrape contract. Both the HTML page and the JSON twin are rendered from
 * this shape, so they can never drift. Bump SCHEMA_VERSION on any breaking change.
 */

export const SCHEMA_VERSION = "1.0";
export const DEFAULT_RADIUS_M = 805;
export const MIN_RADIUS_M = 400;
export const MAX_RADIUS_M = 1609;

export type GeoPrecision =
  | "ADDRESS"
  | "IN_RADIUS"
  | "NEARBY"
  | "NEIGHBORHOOD"
  | "UNVERIFIED";

export type ReportStatus = "pending" | "running" | "complete" | "failed";

export type SectionId =
  | "summary"
  | "origins"
  | "timeline"
  | "treatment"
  | "vice"
  | "dark_history"
  | "folklore"
  | "sources";

export const SECTIONS: { id: SectionId; title: string; blurb: string }[] = [
  { id: "summary", title: "Snapshot", blurb: "What this half mile is." },
  { id: "origins", title: "Origins", blurb: "How the ground became blocks." },
  { id: "timeline", title: "Timeline", blurb: "Dated events inside the circle." },
  {
    id: "treatment",
    title: "Treatment & harm reduction",
    blurb: "Services operating nearby.",
  },
  { id: "vice", title: "Street-level vice", blurb: "Then and now." },
  { id: "dark_history", title: "Dark history", blurb: "Notable crimes and disasters." },
  { id: "folklore", title: "Folklore & the uncanny", blurb: "Reported lore, labeled as lore." },
  { id: "sources", title: "Sources & confidence", blurb: "Every claim, every link." },
];

export interface FactJSON {
  ref: string;
  section: SectionId;
  category: string | null;
  claim: string;
  date: string | null;
  place_name: string | null;
  lat: number | null;
  lon: number | null;
  distance_m: number | null;
  geo_precision: GeoPrecision;
  confidence: number;
  is_folklore: boolean;
  origin: string;
  source: { name: string | null; url: string | null; retrieved_at: string };
}

export interface SectionJSON {
  id: SectionId;
  title: string;
  paragraphs: { text: string; fact_refs: string[] }[];
  fact_refs: string[];
  empty: boolean;
}

export interface ReportJSON {
  schema_version: string;
  id: string;
  slug: string;
  status: ReportStatus;
  stage: string | null;
  progress: number;
  partial: boolean;
  generated_at: string | null;
  input: { address: string; radius_m: number };
  location: {
    address_norm: string | null;
    lat: number | null;
    lon: number | null;
    bbl: string | null;
    neighborhood: string | null;
    borough: string | null;
    city: string;
  };
  sections: SectionJSON[];
  facts: FactJSON[];
  disclaimer: string;
  error: string | null;
}

export const DISCLAIMER =
  "Palimpsest reports historical and public-record context for an area, not an assessment of any property, person, or present-day risk. No safety score, rating, or demographic data is produced. Treatment facilities are listed as services. Folklore is reported as lore, not fact. Enforcement records describe policing activity, not underlying behaviour.";

export type DbReport = {
  id: string;
  slug: string;
  schema_version: string;
  address_raw: string;
  address_norm: string | null;
  bbl: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string;
  lat: number | null;
  lon: number | null;
  radius_m: number;
  status: string;
  stage: string | null;
  progress: number;
  partial: boolean;
  error: string | null;
  sections: Record<string, { text: string; fact_refs: string[] }[]>;
  generated_at: string | null;
};

export type DbFact = {
  ref: string;
  section: string;
  category: string | null;
  claim: string;
  event_date: string | null;
  place_name: string | null;
  lat: number | null;
  lon: number | null;
  distance_m: number | null;
  geo_precision: string;
  confidence: number;
  is_folklore: boolean;
  origin: string;
  source_name: string | null;
  source_url: string | null;
  retrieved_at: string;
};

/** Single source of truth: DB rows -> the published JSON document. */
export function buildReportJSON(report: DbReport, facts: DbFact[]): ReportJSON {
  const factJSON: FactJSON[] = facts.map((f) => ({
    ref: f.ref,
    section: f.section as SectionId,
    category: f.category,
    claim: f.claim,
    date: f.event_date,
    place_name: f.place_name,
    lat: f.lat,
    lon: f.lon,
    distance_m: f.distance_m === null ? null : Math.round(f.distance_m),
    geo_precision: f.geo_precision as GeoPrecision,
    confidence: f.confidence,
    is_folklore: f.is_folklore,
    origin: f.origin,
    source: {
      name: f.source_name,
      url: f.source_url,
      retrieved_at: f.retrieved_at,
    },
  }));

  const sections: SectionJSON[] = SECTIONS.map(({ id, title }) => {
    const paragraphs = report.sections?.[id] ?? [];
    const refs = factJSON.filter((f) => f.section === id).map((f) => f.ref);
    return {
      id,
      title,
      paragraphs,
      fact_refs: refs,
      empty: paragraphs.length === 0 && refs.length === 0,
    };
  });

  return {
    schema_version: report.schema_version || SCHEMA_VERSION,
    id: report.id,
    slug: report.slug,
    status: report.status as ReportStatus,
    stage: report.stage,
    progress: report.progress,
    partial: report.partial,
    generated_at: report.generated_at,
    input: { address: report.address_raw, radius_m: report.radius_m },
    location: {
      address_norm: report.address_norm,
      lat: report.lat,
      lon: report.lon,
      bbl: report.bbl,
      neighborhood: report.neighborhood,
      borough: report.borough,
      city: report.city,
    },
    sections,
    facts: factJSON,
    disclaimer: DISCLAIMER,
    error: report.error,
  };
}
