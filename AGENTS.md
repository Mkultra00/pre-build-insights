<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Palimpsest structure

- `src/lib/report-schema.ts` is the single source of truth: HTML and JSON both render from `buildReportJSON`, so the scrape surfaces cannot drift.
- Scrapers target ids and `data-*` attributes only; class names are free to change. `src/lib/scrape-contract.test.ts` guards this.
- Heavy research runs in `POST /api/public/pipeline/run`, never inside report creation, so a report URL is valid and pollable from the moment it exists.
- Only facts with a renderable geo precision are stored and shown; `UNVERIFIED` is dropped in the pipeline, not at render time.
