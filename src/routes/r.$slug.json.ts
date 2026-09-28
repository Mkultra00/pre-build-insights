import { createFileRoute } from "@tanstack/react-router";

/** The JSON twin. Same data as /r/$slug, rendered from the same builder. */
export const Route = createFileRoute("/r/$slug/json")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { loadReportBySlug } = await import("@/lib/reports.server");
        const raw = (params as Record<string, string>)["slug.json"] ?? "";
        const slug = raw.replace(/\.json$/, "");
        const report = await loadReportBySlug(slug);
        const headers = {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60",
        };
        if (!report) {
          return new Response(
            JSON.stringify({ error: { code: "NOT_FOUND" } }),
            { status: 404, headers },
          );
        }
        return new Response(JSON.stringify(report, null, 2), {
          status: 200,
          headers,
        });
      },
    },
  },
});
