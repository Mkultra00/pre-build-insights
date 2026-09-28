import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const BodySchema = z.object({ id: z.string().uuid() });

/**
 * Builds a queued report. Public because scrapers and the browser both need to
 * start work; it only ever advances a report that already exists, and it
 * refuses to re-run one that is finished or already running.
 */
export const Route = createFileRoute("/api/public/pipeline/run")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: { code: "INVALID_REQUEST" } }),
            { status: 400, headers: CORS },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: report } = await supabaseAdmin
          .from("reports")
          .select("id,status,updated_at")
          .eq("id", parsed.data.id)
          .maybeSingle();

        if (!report) {
          return new Response(
            JSON.stringify({ error: { code: "NOT_FOUND" } }),
            { status: 404, headers: CORS },
          );
        }

        const stale =
          Date.now() - new Date(report.updated_at as string).getTime() >
          5 * 60 * 1000;
        if (report.status === "complete" || (report.status === "running" && !stale)) {
          return new Response(
            JSON.stringify({ id: report.id, status: report.status, started: false }),
            { status: 200, headers: CORS },
          );
        }

        const { runPipeline } = await import("@/lib/pipeline.server");
        await runPipeline(report.id);

        const { data: after } = await supabaseAdmin
          .from("reports")
          .select("id,slug,status,progress,error")
          .eq("id", report.id)
          .maybeSingle();

        return new Response(JSON.stringify({ ...after, started: true }), {
          status: 200,
          headers: CORS,
        });
      },
    },
  },
});
