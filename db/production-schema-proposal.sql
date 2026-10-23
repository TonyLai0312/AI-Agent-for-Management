-- Starter migration for the NEXT increment; not used by browser-local demo.
BEGIN;
CREATE TABLE app_user (
 id uuid PRIMARY KEY, subject text UNIQUE NOT NULL,
 role text NOT NULL CHECK(role IN ('GM','BDR')), email text NOT NULL
);
CREATE TABLE campaign (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app_user(id), name text NOT NULL
);
CREATE TABLE profile_version (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaign(id),
 version integer NOT NULL CHECK(version>0), criteria jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,version)
);
CREATE TABLE company (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaign(id),
 canonical_key text NOT NULL, name text NOT NULL, details jsonb NOT NULL,
 qualification text NOT NULL CHECK(qualification IN ('eligible','needs_verification','excluded')),
 UNIQUE(campaign_id,canonical_key)
);
CREATE TABLE contact (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES company(id),
 name text, role_title text, source_url text, checked_at timestamptz,
 verified boolean NOT NULL DEFAULT false,
 CHECK(NOT verified OR (name IS NOT NULL AND role_title IS NOT NULL AND source_url IS NOT NULL AND checked_at IS NOT NULL))
);
CREATE TABLE evidence (
 id uuid PRIMARY KEY, company_id uuid REFERENCES company(id),
 source_locator text NOT NULL, source_passage text NOT NULL, entity_scope text NOT NULL,
 checked_at timestamptz NOT NULL, approved_claim text,
 approved_by uuid REFERENCES app_user(id), approved_at timestamptz,
 CHECK((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE outreach (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaign(id),
 contact_id uuid NOT NULL REFERENCES contact(id), bdr_id uuid NOT NULL REFERENCES app_user(id),
 profile_id uuid NOT NULL REFERENCES profile_version(id), calendar_snapshot jsonb NOT NULL,
 approved_context jsonb NOT NULL, draft text NOT NULL, draft_approved_at timestamptz,
 sent_at timestamptz, due_at timestamptz, updated_at timestamptz,
 status text NOT NULL CHECK(status IN ('awaiting','accepted','checked/pending','declined','wrong contact')),
 CHECK((sent_at IS NULL AND due_at IS NULL) OR (sent_at IS NOT NULL AND due_at IS NOT NULL AND draft_approved_at IS NOT NULL AND due_at>sent_at))
);
CREATE TABLE alert_outbox (
 id uuid PRIMARY KEY, outreach_id uuid NOT NULL UNIQUE REFERENCES outreach(id),
 idempotency_key text NOT NULL UNIQUE, state text NOT NULL CHECK(state IN ('queued','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, provider_delivery_id text,
 last_error text, delivered_at timestamptz, resolved_at timestamptz
);
CREATE TABLE event (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaign(id),
 outreach_id uuid REFERENCES outreach(id), actor_id uuid REFERENCES app_user(id),
 kind text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outreach_due ON outreach(due_at) WHERE sent_at IS NOT NULL AND updated_at IS NULL;
COMMIT;
