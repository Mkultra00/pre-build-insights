import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

const TITLE = "Palimpsest — what happened within half a mile of any NYC address";
const DESCRIPTION =
  "Enter a New York City street address and get a cited, geo-verified report on the half mile around it: origins, events, treatment services, vice, dark history and folklore.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const DEMOS = [
  "350 W 42nd St, New York, NY 10036",
  "65 Mott St, New York, NY 10013",
];

function Index() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: value.trim() }),
      });
      const body = (await res.json()) as {
        slug?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !body.slug) {
        setError(
          body.error?.message ??
            "That address could not be located. New York City only, for now.",
        );
        setBusy(false);
        return;
      }
      void navigate({ to: "/r/$slug", params: { slug: body.slug } });
    } catch {
      setError("Something went wrong starting the report.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="eyebrow">Seraph Systems · New York City</p>
      <h1 className="mt-3 text-5xl leading-[1.05] sm:text-6xl">
        Every block is
        <br />
        written over.
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
        Give Palimpsest one street address. It reads the half mile around it —
        origins, dated events, treatment and harm-reduction services, street-level
        vice then and now, dark history, and the local lore — and returns a report
        where every claim carries a source and a distance.
      </p>

      <form
        className="mt-9"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(address);
        }}
      >
        <label className="eyebrow" htmlFor="address">
          Street address
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="350 W 42nd St, New York, NY 10036"
            className="paper-panel w-full px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-5 py-2.5 font-mono text-xs uppercase tracking-[0.18em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Reading" : "Read the block"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 font-mono text-xs text-destructive">{error}</p>
      )}

      <div className="mt-8">
        <p className="eyebrow">Try one</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEMOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setAddress(d);
                void submit(d);
              }}
              className="badge-base hover:border-foreground"
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-14 border-t border-rule pt-5">
        <p className="eyebrow">Built to be read by machines</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Reports are server-rendered at a stable URL with a matching JSON twin,
          stable data attributes, and an embedded schema.org record — no
          JavaScript required to scrape them. See{" "}
          <a className="underline decoration-rule underline-offset-2" href="/llms.txt">
            /llms.txt
          </a>{" "}
          and{" "}
          <a className="underline decoration-rule underline-offset-2" href="/schema.json">
            /schema.json
          </a>
          .
        </p>
      </div>
    </main>
  );
}
