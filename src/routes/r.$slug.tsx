import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { getReport } from "@/lib/reports.functions";
import {
  DISCLAIMER,
  SECTIONS,
  type FactJSON,
  type ReportJSON,
} from "@/lib/report-schema";

export const Route = createFileRoute("/r/$slug")({
  loader: async ({ params }) => getReport({ data: { slug: params.slug } }),
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Report not found — Palimpsest" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const address = loaderData.location.address_norm ?? loaderData.input.address;
    const title = `${address} — neighbourhood history within ${loaderData.input.radius_m} m | Palimpsest`;
    const description = `Cited, geo-verified history and local colour within ${loaderData.input.radius_m} metres of ${address}: origins, events, services, vice, dark history and folklore.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "palimpsest:report-id", content: loaderData.id },
        { name: "palimpsest:status", content: loaderData.status },
        { name: "palimpsest:schema-version", content: loaderData.schema_version },
        {
          name: "palimpsest:generated-at",
          content: loaderData.generated_at ?? "",
        },
      ],
      links: [
        {
          rel: "alternate",
          type: "application/json",
          href: `/r/${params.slug}/json`,
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd(loaderData)),
        },
      ],
    };
  },
  component: ReportPage,
  notFoundComponent: () => <Missing />,
  errorComponent: () => <Missing />,
});

function jsonLd(report: ReportJSON) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: report.location.address_norm ?? report.input.address,
    geo:
      report.location.lat && report.location.lon
        ? {
            "@type": "GeoCoordinates",
            latitude: report.location.lat,
            longitude: report.location.lon,
          }
        : undefined,
    subjectOf: {
      "@type": "ItemList",
      numberOfItems: report.facts.length,
      itemListElement: report.facts.slice(0, 100).map((f, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "CreativeWork",
          name: f.place_name ?? f.category ?? "Fact",
          description: f.claim,
          url: f.source.url ?? undefined,
        },
      })),
    },
  };
}

function Missing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-4xl">No report at this address code</h1>
      <p className="mt-3 text-muted-foreground">
        Report links are unguessable and can be withdrawn. Start a new one.
      </p>
      <Link to="/" className="mt-6 eyebrow underline">
        New report
      </Link>
    </main>
  );
}

function PrecisionBadge({ value }: { value: string }) {
  return (
    <span className="badge-base" data-precision={value}>
      {value.replace("_", " ")}
    </span>
  );
}

function FactItem({ fact }: { fact: FactJSON }) {
  return (
    <li
      className="border-t border-rule py-3"
      data-fact-ref={fact.ref}
      data-precision={fact.geo_precision}
      data-distance-m={fact.distance_m ?? ""}
      data-category={fact.category ?? ""}
      data-folklore={String(fact.is_folklore)}
      data-confidence={fact.confidence}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PrecisionBadge value={fact.geo_precision} />
        {fact.is_folklore && <span className="badge-base">lore</span>}
        {fact.distance_m !== null && (
          <span className="font-mono text-[0.625rem] text-muted-foreground">
            {fact.distance_m} m
          </span>
        )}
        {fact.place_name && (
          <span className="font-mono text-[0.625rem] text-muted-foreground">
            {fact.place_name}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed" data-fact-claim="">
        {fact.claim}
      </p>
      {fact.source.url && (
        <a
          className="eyebrow mt-1 inline-block underline decoration-rule underline-offset-2"
          href={fact.source.url}
          rel="nofollow noopener"
          data-fact-source=""
        >
          {fact.source.name ?? fact.source.url}
        </a>
      )}
    </li>
  );
}

function ReportPage() {
  const report = Route.useLoaderData();
  const router = useRouter();
  const kicked = useRef(false);

  // A queued report needs a worker. Start it once, then poll until it settles.
  useEffect(() => {
    if (!report || report.status === "complete" || report.status === "failed") return;
    let cancelled = false;

    const tick = async () => {
      if (!kicked.current) {
        kicked.current = true;
        void fetch("/api/public/pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: report.id }),
        }).catch(() => undefined);
      }
      const res = await fetch(`/api/v1/reports/${report.id}`).catch(() => null);
      const body = (await res?.json().catch(() => null)) as
        | { status?: string }
        | null;
      if (cancelled) return;
      if (body?.status === "complete" || body?.status === "failed") {
        void router.invalidate();
      } else {
        setTimeout(tick, 3000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [report, router]);

  if (!report) return <Missing />;

  const address = report.location.address_norm ?? report.input.address;
  const bySection = (id: string) => report.facts.filter((f) => f.section === id);

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-lg tracking-tight">
            PALIMPSEST
          </Link>
          <a
            href={`/r/${report.slug}/json`}
            className="eyebrow underline decoration-rule underline-offset-4"
            data-json-twin=""
          >
            JSON
          </a>
        </div>
      </header>

      <main
        id="report"
        className="mx-auto max-w-3xl px-6 py-10"
        data-report-id={report.id}
        data-slug={report.slug}
        data-schema-version={report.schema_version}
        data-status={report.status}
        data-progress={report.progress}
        data-partial={String(report.partial)}
        data-lat={report.location.lat ?? ""}
        data-lon={report.location.lon ?? ""}
        data-radius-m={report.input.radius_m}
        data-city={report.location.city}
        data-bbl={report.location.bbl ?? ""}
        data-generated-at={report.generated_at ?? ""}
      >
        <p className="eyebrow">
          {report.location.neighborhood ?? report.location.borough ?? "New York City"}
          {" · "}
          {report.input.radius_m} m radius
        </p>
        <h1 className="mt-2 text-4xl leading-tight" data-report-address="">
          {address}
        </h1>

        {report.status !== "complete" && (
          <div
            className="paper-panel mt-6 px-4 py-3"
            data-report-progress={report.progress}
          >
            <p className="eyebrow">
              {report.status === "failed"
                ? `Failed — ${report.error ?? "unknown error"}`
                : `Building — ${report.stage ?? "queued"} · ${report.progress}%`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.status === "failed"
                ? "Nothing was published for this address."
                : "Sections below fill in as each source is verified. This page is already valid to scrape."}
            </p>
          </div>
        )}

        {SECTIONS.map(({ id, title, blurb }) => {
          const paragraphs = report.sections.find((s) => s.id === id)?.paragraphs ?? [];
          const facts = id === "sources" ? report.facts : bySection(id);
          const empty = paragraphs.length === 0 && facts.length === 0;
          return (
            <section
              key={id}
              id={id}
              data-section={id}
              data-empty={String(empty)}
              data-fact-count={facts.length}
              className="mt-10"
            >
              <h2 className="text-2xl">{title}</h2>
              <p className="eyebrow mt-1">{blurb}</p>

              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="mt-4 leading-relaxed"
                  data-paragraph=""
                  data-fact-refs={p.fact_refs.join(" ")}
                >
                  {p.text}
                </p>
              ))}

              {empty && (
                <p className="mt-4 text-sm text-muted-foreground" data-section-empty="">
                  Nothing verified inside this radius yet.
                </p>
              )}

              {facts.length > 0 && (
                <ul className="mt-5" data-fact-list={id}>
                  {facts.map((f) => (
                    <FactItem key={`${id}-${f.ref}`} fact={f} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        <footer
          className="mt-14 border-t border-rule pt-5 text-xs leading-relaxed text-muted-foreground"
          data-disclaimer=""
        >
          {DISCLAIMER}
        </footer>
      </main>
    </div>
  );
}
