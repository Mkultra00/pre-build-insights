import { createFileRoute } from "@tanstack/react-router";
import { SCHEMA_VERSION, SECTIONS } from "@/lib/report-schema";

/** Published contract for the consuming app. */
export const Route = createFileRoute("/schema.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify(
            {
              $schema: "https://json-schema.org/draft/2020-12/schema",
              title: "Palimpsest report",
              schema_version: SCHEMA_VERSION,
              type: "object",
              required: [
                "schema_version",
                "id",
                "slug",
                "status",
                "input",
                "location",
                "sections",
                "facts",
                "disclaimer",
              ],
              properties: {
                schema_version: { type: "string" },
                id: { type: "string", format: "uuid" },
                slug: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "running", "complete", "failed"],
                },
                stage: { type: ["string", "null"] },
                progress: { type: "integer", minimum: 0, maximum: 100 },
                partial: { type: "boolean" },
                generated_at: { type: ["string", "null"], format: "date-time" },
                input: {
                  type: "object",
                  required: ["address", "radius_m"],
                  properties: {
                    address: { type: "string" },
                    radius_m: { type: "integer", minimum: 400, maximum: 1609 },
                  },
                },
                location: {
                  type: "object",
                  properties: {
                    address_norm: { type: ["string", "null"] },
                    lat: { type: ["number", "null"] },
                    lon: { type: ["number", "null"] },
                    bbl: { type: ["string", "null"] },
                    neighborhood: { type: ["string", "null"] },
                    borough: { type: ["string", "null"] },
                    city: { type: "string" },
                  },
                },
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "title", "paragraphs", "fact_refs", "empty"],
                    properties: {
                      id: { type: "string", enum: SECTIONS.map((s) => s.id) },
                      title: { type: "string" },
                      paragraphs: {
                        type: "array",
                        items: {
                          type: "object",
                          required: ["text", "fact_refs"],
                          properties: {
                            text: { type: "string" },
                            fact_refs: { type: "array", items: { type: "string" } },
                          },
                        },
                      },
                      fact_refs: { type: "array", items: { type: "string" } },
                      empty: { type: "boolean" },
                    },
                  },
                },
                facts: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["ref", "section", "claim", "geo_precision", "source"],
                    properties: {
                      ref: { type: "string" },
                      section: { type: "string" },
                      category: { type: ["string", "null"] },
                      claim: { type: "string" },
                      date: { type: ["string", "null"] },
                      place_name: { type: ["string", "null"] },
                      lat: { type: ["number", "null"] },
                      lon: { type: ["number", "null"] },
                      distance_m: { type: ["integer", "null"] },
                      geo_precision: {
                        type: "string",
                        enum: ["ADDRESS", "IN_RADIUS", "NEARBY", "NEIGHBORHOOD"],
                      },
                      confidence: { type: "number" },
                      is_folklore: { type: "boolean" },
                      origin: { type: "string" },
                      source: {
                        type: "object",
                        properties: {
                          name: { type: ["string", "null"] },
                          url: { type: ["string", "null"] },
                          retrieved_at: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
                disclaimer: { type: "string" },
                error: { type: ["string", "null"] },
              },
            },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/schema+json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          },
        ),
    },
  },
});
