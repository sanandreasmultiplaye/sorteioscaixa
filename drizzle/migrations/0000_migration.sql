CREATE TABLE public.push_subscriptions (
  endpoint text PRIMARY KEY,
  lotteries text[] NOT NULL DEFAULT '{}',
  reminders boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_inbox (
  id bigserial PRIMARY KEY,
  endpoint text NOT NULL REFERENCES public.push_subscriptions(endpoint) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_inbox_endpoint_idx ON public.push_inbox(endpoint);
GRANT ALL ON public.push_inbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.push_inbox_id_seq TO service_role;
ALTER TABLE public.push_inbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lottery_state (
  id text PRIMARY KEY,
  last_concurso integer,
  last_reminder date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lottery_state TO service_role;
ALTER TABLE public.lottery_state ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;