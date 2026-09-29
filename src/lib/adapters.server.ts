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

const NON_NY_STATE = /,?\s\b(nj|new jersey|ct|connecticut|pa|pennsylvania)\b/i;
const STREET_STOP = new Set(["st", "street", "ave", "avenue", "rd", "road", "ct", "court", "pl", "place", "blvd", "w", "e", "n", "s", "west", "east", "north", "south", "ny", "nyc", "new", "york"]);

/** NYC GeoSearch fuzzy-matches anything to some NYC address; reject matches that don't share the street name. */
function nycMatchIsTrustworthy(input: string, p: Record<string, unknown>): boolean {
  if (NON_NY_STATE.test(input)) return false;
  const conf = Number(p["confidence"] ?? 0);
  if (conf && conf < 0.8) return false;
  const label = String(p["label"] ?? "").toLowerCase();
  const street = input.split(",")[0]!.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
  const words = street.split(/\s+/).filter((w) => w && !/^\d+$/.test(w) && !STREET_STOP.has(w));
  const labelNorm = label.replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
  return words.every((w) => labelNorm.includes(w));
}

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
  if (feature && nycMatchIsTrustworthy(address, feature.properties)) {
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

/* ------------------------------------------- Occult & dark history (web, B) */

interface OccultHit {
  claim: string;
  place_name?: string | null;
  address?: string | null;
  event_date?: string | null;
  source_url: string;
  is_folklore?: boolean;
}

export async function occultHistory(
  neighborhood: string | null,
  borough: string | null,
  lat: number,
  lon: number,
  radiusM: number,
): Promise<CandidateFact[]> {
  const key = process.env['FIRECRAWL_API_KEY'];
  if (!key || !neighborhood) return [];
  const area = `${neighborhood}${borough ? `, ${borough}` : ""}, New York City`;
  const queries = [
    `"${neighborhood}" occult OR esoteric OR spiritualist OR witchcraft history`,
    `"${neighborhood}" haunted OR ghost OR cult history`,
    `occult history of ${borough ?? "Manhattan"} New York addresses spiritualists mediums theosophists lodges`,
    `historic occult bookshops magic shops botanicas ${borough ?? "Manhattan"} New York address`,
  ];

  const results: { url: string; title?: string; description?: string; markdown?: string }[][] = [];
  for (const q of queries) results.push(await (async () => {
      try {
        const res = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 6, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
        });
        if (!res.ok) {
          console.error(`firecrawl search ${res.status}: ${await res.text()}`);
          return [];
        }
        const j = (await res.json()) as { data?: { web?: unknown[] } | unknown[] };
        const list = Array.isArray(j.data) ? j.data : (j.data?.web ?? []);
        return list as { url: string; title?: string; description?: string; markdown?: string }[];
      } catch {
        return [];
      }
    })());

  const seen = new Set<string>();
  const docs = results.flat().filter((d) => d?.url && !seen.has(d.url) && seen.add(d.url)).slice(0, 16);
  if (docs.length === 0) return [];

  const corpus = docs
    .map((d, i) => `### [${i}] ${d.title ?? ""}\nURL: ${d.url}\n${(d.markdown ?? d.description ?? "").slice(0, 3500)}`)
    .join("\n\n");

  const { generateText, parseJsonObject } = await import("./ai.server");
  const text = await generateText(
    `You extract occult-related historical facts (spiritualism, seances, mediums, theosophy, freemasonic/esoteric lodges, occult bookshops, witchcraft, cults, ritual crimes, ghost lore) anywhere in New York City (distance is checked later, so prefer items with a street address; prioritise ${area}). Use ONLY the provided documents. Every item must be stated in a document; copy its URL exactly. Include a street address when the document gives one (house number + street), else null. No victim names, no claims about current residents. Mark ghost stories / legends is_folklore=true. Output JSON: {"items":[{"claim":"one sentence","place_name":"...","address":"123 Example St, New York, NY"|null,"event_date":"1890s"|null,"source_url":"...","is_folklore":false}]} with at most 20 items.`,
    corpus,
  );
  const parsed = parseJsonObject(text) as { items?: OccultHit[] } | null;
  const items = (parsed?.items ?? []).filter((it) => it?.claim && docs.some((d) => d.url === it.source_url));

  const facts: CandidateFact[] = [];
  for (const it of items) {
    let fLat: number | null = null;
    let fLon: number | null = null;
    let dist: number | null = null;
    let precision: GeoPrecision = "NEIGHBORHOOD";
    const nb = neighborhood.toLowerCase();
    const mentionsArea = `${it.claim} ${it.place_name ?? ""}`.toLowerCase().includes(nb);
    if (it.address) {
      const g = await geocode(it.address);
      if (g) {
        dist = Math.round(haversineM(lat, lon, g.lat, g.lon));
        const p = precisionFor(dist, radiusM);
        if (p === "UNVERIFIED") continue; // placed, but outside the area
        fLat = g.lat;
        fLon = g.lon;
        precision = p;
      } else if (!mentionsArea) continue;
    } else if (!mentionsArea) continue; // citywide claim with no address: not about this area
    facts.push({
      section: it.is_folklore ? "folklore" : "dark_history",
      category: "occult",
      claim: it.address ? `${it.claim} (Address: ${it.address}.)` : it.claim,
      event_date: it.event_date ?? null,
      place_name: it.place_name ?? it.address ?? null,
      lat: fLat,
      lon: fLon,
      distance_m: dist,
      geo_precision: precision,
      confidence: it.address ? 0.7 : 0.55,
      is_folklore: !!it.is_folklore,
      origin: "web",
      source_name: new URL(it.source_url).hostname.replace(/^www\./, ""),
      source_url: it.source_url,
      payload: { address: it.address ?? null },
    });
  }
  return facts;
}
