import { createServerFn } from "@tanstack/react-start";
import type { ReportJSON } from "./report-schema";

/** Public: fetch a report document by slug for SSR. */
export const getReport = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({
    slug: String(data.slug).slice(0, 64),
  }))
  .handler(async ({ data }): Promise<ReportJSON | null> => {
    const { loadReportBySlug } = await import("./reports.server");
    return loadReportBySlug(data.slug);
  });
