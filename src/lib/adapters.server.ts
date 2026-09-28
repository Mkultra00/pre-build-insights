import { haversineM, precisionFor } from "./geo";
import type { GeoPrecision, SectionId } from "./report-schema";

export interface GeocodeResult {
  lat: number;
  lon: number;
  address_norm: string;
  bbl: string | null;
  neighborhood: string | null;
  borough: string | null;
}

export interface CandidateFact {
  section: SectionId;
  category: string;
  claim: string;
  event_date: string | null;
  place_name: string | null;
  lat: number | null;
  lon: number | null;
  distance_m: number | null;
  geo_precision: GeoPrecision;
  confidence: number;
  is_folklore: boolean;
  origin: "structured" | "web";
  source_name: string;
  source_url: string | null;
  payload?: Record<string, unknown>;
}

const UA = { "User-Agent": "Palimpsest/1.0 (neighborhood history reports)" };

async function getJson<T>(url: string, timeoutMs = 15000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- geocoding */

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const nyc = await getJson<{
    features?: {
      geometry: { coordinates: [number, number] };
      properties: Record<string, unknown>;
    }[];
  }>(
    `https://geosearch.planninglabs.nyc/v2/search?size=1&text=${encodeURIComponent(address)}`,
  );

  const feature = nyc?.features?.[0];
  if (feature) {
    const [lon, lat] = feature.geometry.coordinates;
    const p = feature.properties;
    return {
      lat,
      lon,
      address_norm: String(p["label"] ?? address),
      bbl: p["pad_bbl"] ? String(p["pad_bbl"]) : null,
      neighborhood: p["neighbourhood"] ? String(p["neighbourhood"]) : null,
      borough: p["borough"] ? String(p["borough"]) : null,
    };
  }

  const census = await getJson<{
    result?: {
      addressMatches?: {
        coordinates: { x: number; y: number };
        matchedAddress: string;
      }[];
    };
  }>(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(
      address,
    )}&benchmark=Public_AR_Current&format=json`,
  );

  const match = census?.result?.addressMatches?.[0];
  if (!match) return null;
  return {
    lat: match.coordinates.y,
    lon: match.coordinates.x,
    address_norm: match.matchedAddress,
    bbl: null,
    neighborhood: null,
    borough: null,
  };
}

/* ------------------------------------------------- Wikipedia geosearch (A) */

export async function wikipediaGeo(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<CandidateFact[]> {
  const data = await getJson<{
    query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number; dist: number }[] };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=${Math.min(
      radiusM,
      10000,
    )}&gslimit=40&format=json&origin=*`,
  );

  const hits = data?.query?.geosearch ?? [];
  if (hits.length === 0) return [];

  const titles = hits.map((h) => h.title);
  const extracts = await getJson<{
    query?: { pages?: Record<string, { title: string; extract?: string }> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&origin=*&titles=${encodeURIComponent(
      titles.join("|"),
    )}`,
  );
  const byTitle = new Map<string, string>();
  for (const page of Object.values(extracts?.query?.pages ?? {})) {
    if (page.extract) byTitle.set(page.title, page.extract);
  }

  return hits.map((h) => {
    const distance = haversineM(lat, lon, h.lat, h.lon);
    const summary = (byTitle.get(h.title) ?? "").split(/(?<=\.)\s/).slice(0, 2).join(" ");
    return {
      section: "timeline" as SectionId,
      category: "place",
      claim: summary || `${h.title} stands within this radius.`,
      event_date: null,
      place_name: h.title,
      lat: h.lat,
      lon: h.lon,
      distance_m: distance,
      geo_precision: precisionFor(distance, radiusM),
      confidence: 0.8,
      is_folklore: false,
      origin: "structured" as const,
      source_name: "Wikipedia",
      source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
    };
  });
}

/* ------------------------------------- Neighbourhood history (Wikipedia) */

/**
 * Reads the "History" section of the neighbourhood's Wikipedia page and turns
 * its sentences into Origins facts. Precision is NEIGHBOURHOOD by design —
 * these claims belong to the area, not a point — so they only narrate Origins.
 */
export async function neighborhoodHistory(
  neighborhood: string | null,
  borough: string | null,
  lat: number,
  lon: number,
): Promise<CandidateFact[]> {
  if (!neighborhood) return [];

  const candidates = [
    borough ? `${neighborhood}, ${borough}` : neighborhood,
    neighborhood,
    `History of ${neighborhood}`,
  ];

  let pageTitle: string | null = null;
  let historySection: string | null = null;

  for (const title of candidates) {
    const sections = await getJson<{
      parse?: { sections?: { index: string; line: string }[] };
    }>(
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
        title,
      )}&prop=sections&format=json&origin=*&redirects=1`,
    );
    const list = sections?.parse?.sections ?? [];
    const hit = list.find((s) => /^(history|early history)$/i.test(s.line.trim()));
    if (hit) {
      pageTitle = title;
      historySection = hit.index;
      break;
    }
  }
  if (!pageTitle || !historySection) return [];

  const content = await getJson<{
    parse?: { text?: { "*": string } };
  }>(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      pageTitle,
    )}&prop=text&section=${historySection}&format=json&origin=*&redirects=1`,
  );
  const html = content?.parse?.text?.["*"] ?? "";
  if (!html) return [];

  const text = html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 60 && s.length < 400)
    .slice(0, 14);
  if (sentences.length === 0) return [];

  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
  return sentences.map((s) => ({
    section: "origins" as SectionId,
    category: "neighborhood_history",
    claim: s,
    event_date: null,
    place_name: neighborhood,
    lat,
    lon,
    distance_m: 0,
    geo_precision: "NEIGHBORHOOD" as GeoPrecision,
    confidence: 0.75,
    is_folklore: false,
    origin: "structured" as const,
    source_name: "Wikipedia",
    source_url: url,
  }));
}

/* ------------------------------------------ NYPD complaints (Socrata) (A) */

const DRUG_CODES = ["DANGEROUS DRUGS", "CANNABIS RELATED OFFENSES"];
const VICE_CODES = ["PROSTITUTION & RELATED OFFENSES", "SEX CRIMES"];

export async function nypdComplaints(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<CandidateFact[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 5);
  const sinceIso = `${since.getFullYear()}-01-01T00:00:00`;

  const where = `within_circle(lat_lon, ${lat}, ${lon}, ${radiusM}) AND cmplnt_fr_dt > '${sinceIso}'`;
  const url =
    `https://data.cityofnewyork.us/resource/5uac-w243.json` +
    `?$select=ofns_desc,date_extract_y(cmplnt_fr_dt) AS yr,count(1) AS n` +
    `&$where=${encodeURIComponent(where)}` +
    `&$group=ofns_desc,yr&$limit=2000`;

  const rows = await getJson<{ ofns_desc: string | null; yr: string; n: string }[]>(url, 25000);
  if (!rows || rows.length === 0) return [];

  const buckets = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const desc = (row.ofns_desc ?? "").toUpperCase();
    let bucket: string | null = null;
    if (DRUG_CODES.some((c) => desc.includes(c.split(" ")[0]!))) bucket = "drugs";
    else if (desc.includes("PROSTITUTION")) bucket = "prostitution";
    if (!bucket) continue;
    const years = buckets.get(bucket) ?? new Map<string, number>();
    years.set(row.yr, (years.get(row.yr) ?? 0) + Number(row.n));
    buckets.set(bucket, years);
  }

  const label: Record<string, string> = {
    drugs: "drug-related complaints",
    prostitution: "prostitution-related complaints",
  };

  const facts: CandidateFact[] = [];
  for (const [bucket, years] of buckets) {
    const sorted = [...years.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const total = sorted.reduce((sum, [, n]) => sum + n, 0);
    const span = `${sorted[0]?.[0]}–${sorted[sorted.length - 1]?.[0]}`;
    facts.push({
      section: "vice",
      category: bucket,
      claim: `NYPD recorded ${total.toLocaleString()} ${label[bucket]} within ${radiusM} m of this address across ${span} (by year: ${sorted
        .map(([y, n]) => `${y}: ${n}`)
        .join(", ")}). Complaint counts describe reporting and enforcement activity, not underlying behaviour.`,
      event_date: span,
      place_name: "0.5-mile radius",
      lat,
      lon,
      distance_m: 0,
      geo_precision: "IN_RADIUS",
      confidence: 0.95,
      is_folklore: false,
      origin: "structured",
      source_name: "NYPD Complaint Data (NYC Open Data)",
      source_url: "https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Historic/qgea-i56i",
      payload: { by_year: Object.fromEntries(sorted) },
    });
  }
  return facts;
}

/* ------------------------------------------------- Treatment services (A) */

export async function treatmentFacilities(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<CandidateFact[]> {
  const miles = Math.max(1, Math.ceil(radiusM / 1609));
  const data = await getJson<{ rows?: Record<string, unknown>[] }>(
    `https://findtreatment.gov/locator/exportsAsJson/v2?sType=SA&sAddr=${lat}%2C${lon}&pageSize=40&page=1&sCodes=&limitType=2&limitValue=${miles}`,
    20000,
  );

  const rows = data?.rows ?? [];
  const facts: CandidateFact[] = [];
  for (const row of rows) {
    const fLat = Number(row["latitude"]);
    const fLon = Number(row["longitude"]);
    if (!Number.isFinite(fLat) || !Number.isFinite(fLon)) continue;
    const distance = haversineM(lat, lon, fLat, fLon);
    if (distance > radiusM * 1.5) continue;
    const name = String(row["name1"] ?? "Treatment facility");
    const street = String(row["street1"] ?? "");
    const services = String(row["services"] ?? "");
    const isOtp = /methadone|OTP|opioid treatment program/i.test(services);
    facts.push({
      section: "treatment",
      category: isOtp ? "opioid_treatment_program" : "substance_use_treatment",
      claim: `${name}${street ? `, ${street}` : ""} provides ${
        isOtp ? "opioid treatment program services, including methadone," : "substance-use treatment services"
      } ${Math.round(distance)} m from this address.`,
      event_date: null,
      place_name: name,
      lat: fLat,
      lon: fLon,
      distance_m: distance,
      geo_precision: precisionFor(distance, radiusM),
      confidence: 0.9,
      is_folklore: false,
      origin: "structured",
      source_name: "SAMHSA FindTreatment.gov",
      source_url: "https://findtreatment.gov/",
    });
  }
  return facts;
}
