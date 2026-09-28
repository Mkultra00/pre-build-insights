import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildReportJSON,
  type DbFact,
  type DbReport,
  type ReportJSON,
} from "./report-schema";

/** Loads a published report document by slug. Null when there is no such slug. */
export async function loadReportBySlug(
  slug: string,
): Promise<ReportJSON | null> {
  const { data: report } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!report) return null;

  const { data: facts } = await supabaseAdmin
    .from("facts")
    .select(
      "ref,section,category,claim,event_date,place_name,lat,lon,distance_m,geo_precision,confidence,is_folklore,origin,source_name,source_url,retrieved_at",
    )
    .eq("report_id", report.id)
    .eq("status", "verified")
    .order("ref");

  return buildReportJSON(
    report as unknown as DbReport,
    (facts ?? []) as unknown as DbFact[],
  );
}
