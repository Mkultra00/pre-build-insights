import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/v1/reports/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("reports")
          .select("id,slug,status,stage,progress,partial,error")
          .eq("id", params.id)
          .maybeSingle();

        if (!data) {
          return new Response(
            JSON.stringify({
              error: { code: "NOT_FOUND", message: "No such report." },
            }),
            { status: 404, headers: CORS },
          );
        }

        const origin = new URL(request.url).origin;
        return new Response(
          JSON.stringify({
            ...data,
            urls: {
              html: `${origin}/r/${data.slug}`,
              json: `${origin}/r/${data.slug}.json`,
            },
          }),
          { status: 200, headers: CORS },
        );
      },
    },
  },
});
