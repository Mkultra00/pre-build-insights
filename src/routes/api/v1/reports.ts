import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
} from "@/lib/report-schema";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const BodySchema = z.object({
  address: z.string().min(4).max(240),
  radius_m: z.number().int().min(MIN_RADIUS_M).max(MAX_RADIUS_M).optional(),
  force_refresh: z.boolean().optional(),
});

function fail(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: CORS,
  });
}

export const Route = createFileRoute("/api/v1/reports")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = BodySchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          return fail("INVALID_REQUEST", "address is required", 400);
        }
        const { address, radius_m, force_refresh } = parsed.data;
        const radius = radius_m ?? DEFAULT_RADIUS_M;

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { geocode } = await import("@/lib/adapters.server");
        const { addressHash, makeSlug } = await import("@/lib/pipeline.server");

        const geo = await geocode(address);
        if (!geo) {
          return fail(
            "ADDRESS_NOT_FOUND",
            "That address could not be located.",
            404,
          );
        }

        const hash = await addressHash(geo.lat, geo.lon, radius);
        const origin = new URL(request.url).origin;

        if (!force_refresh) {
          const cutoff = new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const { data: existing } = await supabaseAdmin
            .from("reports")
            .select("id,slug")
            .eq("address_hash", hash)
            .eq("status", "complete")
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existing) {
            return new Response(
              JSON.stringify({
                id: existing.id,
                slug: existing.slug,
                status: "complete",
                reused: true,
                urls: {
                  html: `${origin}/r/${existing.slug}`,
                  json: `${origin}/r/${existing.slug}.json`,
                },
              }),
              { status: 200, headers: CORS },
            );
          }
        }

        const slug = makeSlug();
        const { data: created, error } = await supabaseAdmin
          .from("reports")
          .insert({
            slug,
            address_raw: address,
            address_norm: geo.address_norm,
            address_hash: hash,
            bbl: geo.bbl,
            neighborhood: geo.neighborhood,
            borough: geo.borough,
            lat: geo.lat,
            lon: geo.lon,
            radius_m: radius,
            status: "pending",
            stage: "queued",
          })
          .select("id,slug")
          .single();

        if (error || !created) {
          console.error("create report failed", error);
          return fail("INTERNAL", "Could not create the report.", 500);
        }

        return new Response(
          JSON.stringify({
            id: created.id,
            slug: created.slug,
            status: "pending",
            reused: false,
            run_url: `${origin}/api/public/pipeline/run`,
            urls: {
              html: `${origin}/r/${created.slug}`,
              json: `${origin}/r/${created.slug}.json`,
              status: `${origin}/api/v1/reports/${created.id}`,
            },
          }),
          { status: 202, headers: CORS },
        );
      },
    },
  },
});
