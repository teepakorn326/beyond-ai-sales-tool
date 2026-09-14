-- Visa document checker: PostgreSQL schema. Idempotent; re-run freely.
--
-- Applied by `make db-migrate` (web/scripts/migrate.mjs) against DATABASE_URL,
-- and mounted into initdb for the local compose profile.
--
-- Two invariants the application code also enforces are enforced here as a
-- last line of defence:
--   1. documents.extracted_json is written once and never updated (trigger).
--   2. No student names, dates of birth or document numbers appear in
--      case_profiles: `profile` is built from an allowlist (web/app/lib/profile.ts)
--      and `identity_hash` is a salted SHA-256, never the values.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS cases (
  case_id           text PRIMARY KEY CHECK (case_id ~ '^[A-Za-z0-9-]{1,40}$'),
  country           text NOT NULL DEFAULT 'AU' CHECK (country IN ('AU', 'NZ')),
  course_end_date   date,
  submission_target date,
  program_id        text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  intake            text CHECK (intake IS NULL OR intake ~ '^\d{4}-\d{2}$'),
  assignee          text,
  acknowledged      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploads (
  id             uuid PRIMARY KEY,
  case_id        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  suggested_type text NOT NULL
                 CHECK (suggested_type IN ('passport', 'transcript', 'degree_certificate', 'english_test', 'other')),
  status         text NOT NULL CHECK (status IN ('held', 'extracted', 'dismissed')),
  held_reason    text,
  document_id    uuid
);
CREATE INDEX IF NOT EXISTS uploads_case_idx ON uploads (case_id, created_at);

-- Page bytes live in S3 under an opaque key; only the key is stored here.
CREATE TABLE IF NOT EXISTS upload_pages (
  upload_id      uuid NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
  page_no        int  NOT NULL,
  filename       text NOT NULL,
  content_type   text NOT NULL,
  classification jsonb NOT NULL,
  object_key     text NOT NULL,
  size_bytes     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (upload_id, page_no)
);

CREATE TABLE IF NOT EXISTS documents (
  id             uuid PRIMARY KEY,
  case_id        text NOT NULL,
  doc_type       text NOT NULL
                 CHECK (doc_type IN ('passport', 'transcript', 'degree_certificate', 'english_test')),
  filename       text NOT NULL,
  content_type   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  upload_id      uuid REFERENCES uploads (id),
  page_count     int  NOT NULL DEFAULT 1,
  classification jsonb,
  superseded_by  uuid,
  extracted_json jsonb NOT NULL,           -- written once; see trigger below
  confirmations  jsonb NOT NULL DEFAULT '{}'::jsonb,
  requests       jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_json jsonb,                    -- the only thing downstream reads
  image_key      text,                     -- manual single-page route only
  CHECK (upload_id IS NOT NULL OR image_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS documents_case_idx ON documents (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_live_idx ON documents (created_at DESC) WHERE superseded_by IS NULL;

CREATE OR REPLACE FUNCTION documents_extracted_json_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.extracted_json IS DISTINCT FROM OLD.extracted_json THEN
    RAISE EXCEPTION 'extracted_json is immutable; confirmations are written to confirmed_json only'
      USING ERRCODE = 'VDC01';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS documents_extracted_json_immutable ON documents;
CREATE TRIGGER documents_extracted_json_immutable
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_extracted_json_immutable();

-- PII-free case profile for similar-case search, plus a salted identity hash
-- for exact duplicate-student detection. 1024 dimensions: Cohere Embed
-- Multilingual v3 and Titan Text Embeddings v2 both produce that width.
CREATE TABLE IF NOT EXISTS case_profiles (
  case_id         text PRIMARY KEY,
  profile         text NOT NULL,
  identity_hash   text,
  embedding       vector(1024),
  embedding_model text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_profiles_identity_idx ON case_profiles (identity_hash)
  WHERE identity_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS case_profiles_embedding_idx ON case_profiles
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS policies (
  id              text PRIMARY KEY,
  country         text NOT NULL CHECK (country IN ('AU', 'NZ')),
  topic           text NOT NULL,
  title           text NOT NULL,
  version         text NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  keywords        text[] NOT NULL DEFAULT '{}',
  text            text NOT NULL,
  synthetic       boolean NOT NULL DEFAULT true,
  embedding       vector(1024),
  embedding_model text,
  content_hash    text
);
CREATE INDEX IF NOT EXISTS policies_window_idx ON policies (country, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS policies_embedding_idx ON policies USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS programs (
  id                  text PRIMARY KEY,
  institution         text NOT NULL,
  country             text NOT NULL,
  level               text NOT NULL,
  field               text NOT NULL,
  intakes             text[] NOT NULL DEFAULT '{}',
  duration_months     int NOT NULL,
  english_overall_min numeric(3,1) NOT NULL,
  english_band_min    numeric(3,1) NOT NULL,
  synthetic           boolean NOT NULL DEFAULT true,
  city                text NOT NULL DEFAULT '',
  tuition_aud_per_year int,
  min_gpa             numeric(3,2),
  entry_requirement   text NOT NULL DEFAULT '',
  description         text NOT NULL DEFAULT '',
  embedding           vector(1024),
  embedding_model     text,
  content_hash        text
);
-- Columns added after the first release; no-ops on a fresh database.
ALTER TABLE programs ADD COLUMN IF NOT EXISTS city                 text NOT NULL DEFAULT '';
ALTER TABLE programs ADD COLUMN IF NOT EXISTS tuition_aud_per_year int;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS min_gpa              numeric(3,2);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS entry_requirement    text NOT NULL DEFAULT '';
ALTER TABLE programs ADD COLUMN IF NOT EXISTS description          text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS programs_embedding_idx ON programs USING hnsw (embedding vector_cosine_ops);
