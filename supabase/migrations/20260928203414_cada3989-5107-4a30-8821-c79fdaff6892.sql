
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  address_raw TEXT NOT NULL,
  address_norm TEXT,
  address_hash TEXT NOT NULL,
  bbl TEXT,
  neighborhood TEXT,
  borough TEXT,
  city TEXT NOT NULL DEFAULT 'nyc',
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  radius_m INTEGER NOT NULL DEFAULT 805,
  status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  partial BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_address_hash_idx ON public.reports (address_hash, created_at DESC);

CREATE TABLE public.facts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  section TEXT NOT NULL,
  category TEXT,
  claim TEXT NOT NULL,
  event_date TEXT,
  place_name TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  distance_m DOUBLE PRECISION,
  geo_precision TEXT NOT NULL DEFAULT 'UNVERIFIED',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_folklore BOOLEAN NOT NULL DEFAULT false,
  origin TEXT NOT NULL DEFAULT 'structured',
  status TEXT NOT NULL DEFAULT 'candidate',
  source_name TEXT,
  source_url TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, ref)
);
CREATE INDEX facts_report_idx ON public.facts (report_id, section);

CREATE TABLE public.pipeline_tasks (
  id BIGSERIAL PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  log JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX pipeline_tasks_report_idx ON public.pipeline_tasks (report_id, id);

CREATE TABLE public.source_cache (
  key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

GRANT SELECT ON public.reports TO anon, authenticated;
GRANT ALL ON public.reports TO service_role;
GRANT SELECT ON public.facts TO anon, authenticated;
GRANT ALL ON public.facts TO service_role;
GRANT ALL ON public.pipeline_tasks TO service_role;
GRANT ALL ON public.source_cache TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pipeline_tasks_id_seq TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reports" ON public.reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read verified facts" ON public.facts FOR SELECT TO anon, authenticated USING (status = 'verified');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
