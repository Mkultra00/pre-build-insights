import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateText, parseJsonObject } from "./ai.server";
import {
  geocode,
  nypdComplaints,
  treatmentFacilities,
  wikipediaGeo,
  type CandidateFact,
} from "./adapters.server";
import { RENDERABLE_PRECISION } from "./geo";
import { SECTIONS, type SectionId } from "./report-schema";

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

type Paragraph = { text: string; fact_refs: string[] };

/**
 * Read paragraphs out of a model reply. Citations in the prose are the source
 * of truth, so a reply that omits the fact_refs array still survives.
 */
function readParagraphs(raw: string): Paragraph[] {
  const parsed = parseJsonObject<{ paragraphs?: Paragraph[] }>(raw);
  let list = Array.isArray(parsed?.paragraphs) ? parsed.paragraphs : [];

  // A reply cut off mid-stream still holds complete paragraphs; salvage them.
  if (list.length === 0) {
    list = [...raw.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
      text: JSON.parse(`"${m[1]}"`) as string,
      fact_refs: [],
    }));
  }

  return list
    .map((p) => {
      const text = typeof p?.text === "string" ? p.text.trim() : "";
      const inline = [...text.matchAll(/\[(f-\d{4})\]/g)].map((m) => m[1]!);
      const declared = Array.isArray(p?.fact_refs)
        ? p.fact_refs.filter((r): r is string => typeof r === "string")
        : [];
      return { text, fact_refs: [...new Set([...inline, ...declared])] };
    })
    .filter((p) => p.text.length > 0 && p.fact_refs.length > 0);
}

export function makeSlug(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

/** 10 m grid snap + radius, so neighbouring addresses reuse one report. */
export async function addressHash(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<string> {
  const snapped = `${lat.toFixed(4)}|${lon.toFixed(4)}|${radiusM}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(snapped),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function setStage(
  reportId: string,
  stage: string,
  progress: number,
  extra: Record<string, unknown> = {},
) {
  await supabaseAdmin
    .from("reports")
    .update({ stage, progress, status: "running", ...extra })
    .eq("id", reportId);
  await supabaseAdmin.from("pipeline_tasks").insert({
    report_id: reportId,
    stage,
    status: "done",
    finished_at: new Date().toISOString(),
  });
}

type NarratedSection = { paragraphs: { text: string; fact_refs: string[] }[] };

/**
 * Runs the whole report: geocode -> adapters -> geo-verify -> narrate -> publish.
 * Every stage writes progress, so a scraper polling the report always sees a
 * valid document, just an emptier one.
 */
export async function runPipeline(reportId: string): Promise<void> {
  try {
    const { data: report } = await supabaseAdmin
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();
    if (!report) return;

    const radiusM = report.radius_m;
    let lat = report.lat;
    let lon = report.lon;

    /* 1. geocode */
    if (lat === null || lon === null) {
      await setStage(reportId, "geocode", 5);
      const geo = await geocode(report.address_raw);
      if (!geo) {
        await supabaseAdmin
          .from("reports")
          .update({
            status: "failed",
            stage: "geocode",
            progress: 100,
            error: "ADDRESS_NOT_FOUND",
          })
          .eq("id", reportId);
        return;
      }
      lat = geo.lat;
      lon = geo.lon;
      await supabaseAdmin
        .from("reports")
        .update({
          lat,
          lon,
          address_norm: geo.address_norm,
          bbl: geo.bbl,
          neighborhood: geo.neighborhood,
          borough: geo.borough,
          address_hash: await addressHash(lat, lon, radiusM),
        })
        .eq("id", reportId);
    }

    /* 2. structured adapters, in parallel, each allowed to fail */
    await setStage(reportId, "adapters", 25);
    const results = await Promise.allSettled([
      wikipediaGeo(lat, lon, radiusM),
      nypdComplaints(lat, lon, radiusM),
      treatmentFacilities(lat, lon, radiusM),
    ]);
    const candidates: CandidateFact[] = [];
    let partial = false;
    for (const r of results) {
      if (r.status === "fulfilled") candidates.push(...r.value);
      else partial = true;
    }

    /* 3. geo-verify: drop anything we could not place inside the world */
    await setStage(reportId, "geo_verify", 45);
    const verified = candidates.filter((c) =>
      RENDERABLE_PRECISION.includes(c.geo_precision),
    );

    /* 4. persist facts */
    const rows = verified.map((c, i) => ({
      report_id: reportId,
      ref: `f-${String(i + 1).padStart(4, "0")}`,
      section: c.section,
      category: c.category,
      claim: c.claim,
      event_date: c.event_date,
      place_name: c.place_name,
      lat: c.lat,
      lon: c.lon,
      distance_m: c.distance_m,
      geo_precision: c.geo_precision,
      confidence: c.confidence,
      is_folklore: c.is_folklore,
      origin: c.origin,
      status: "verified",
      source_name: c.source_name,
      source_url: c.source_url,
      payload: (c.payload ?? {}) as Record<string, never>,
    }));
    await supabaseAdmin.from("facts").delete().eq("report_id", reportId);
    if (rows.length > 0) await supabaseAdmin.from("facts").insert(rows);

    /* 5. narrate — only from facts, every sentence cited */
    await setStage(reportId, "narrate", 70);
    const sections: Record<string, { text: string; fact_refs: string[] }[]> = {};
    const narratable: SectionId[] = [
      "summary",
      "origins",
      "timeline",
      "treatment",
      "vice",
      "dark_history",
      "folklore",
    ];

    for (const sectionId of narratable) {
      const pool =
        sectionId === "summary"
          ? rows
          : rows.filter((r) => r.section === sectionId);
      if (pool.length === 0) continue;

      const title = SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId;
      const factList = pool
        .slice(0, 40)
        .map(
          (r) =>
            `${r.ref} | ${r.geo_precision} | ${r.place_name ?? "—"} | ${r.claim}`,
        )
        .join("\n");

      try {
        const narrate = async () =>
          generateText(
          [
            `Write the "${title}" section of a neighbourhood history report using ONLY the facts provided.`,
            "Every sentence must end with one or more citations in the form [f-0001].",
            "Tone: vivid, precise, respectful. No speculation. No statements about current residents. No victim names.",
            "Describe treatment facilities as services, never as hazards. Folklore is framed as reported lore.",
            "Enforcement counts describe policing activity, not underlying behaviour — say so when you use them.",
            'Output JSON only: {"paragraphs":[{"text":"...","fact_refs":["f-0001"]}]}',
            "Two short paragraphs maximum.",
          ].join(" "),
          `Address: ${report.address_norm ?? report.address_raw}\nRadius: ${radiusM} m\n\nFacts:\n${factList}`,
        );

        // One retry: a malformed JSON reply must not silently blank a section.
        let paragraphs = readParagraphs(await narrate());
        if (paragraphs.length === 0) paragraphs = readParagraphs(await narrate());
        if (paragraphs.length > 0) {
          sections[sectionId] = paragraphs;
        } else {
          partial = true;
          console.error(`narrate ${sectionId} produced no paragraphs`);
        }
      } catch (error) {
        console.error(`narrate ${sectionId} failed`, error);
        partial = true;
      }
    }

    /* 6. publish */
    await supabaseAdmin
      .from("reports")
      .update({
        sections,
        status: "complete",
        stage: "complete",
        progress: 100,
        partial,
        generated_at: new Date().toISOString(),
      })
      .eq("id", reportId);
  } catch (error) {
    console.error("pipeline failed", error);
    await supabaseAdmin
      .from("reports")
      .update({
        status: "failed",
        progress: 100,
        error: "INTERNAL",
      })
      .eq("id", reportId);
  }
}
