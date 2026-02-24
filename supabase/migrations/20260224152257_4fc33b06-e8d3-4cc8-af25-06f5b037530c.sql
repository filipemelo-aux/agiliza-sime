
-- ═══════════════════════════════════════════════════════════════
-- Security: Rate Limiting + Audit Trail
-- ═══════════════════════════════════════════════════════════════

-- 1. Rate limit tracking table (in-DB for distributed workers)
CREATE TABLE IF NOT EXISTS public.rate_limit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint per key+window for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_key_window
  ON public.rate_limit_entries (key, window_start);

-- Auto-cleanup old entries (older than 1 hour)
CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup
  ON public.rate_limit_entries (window_start);

-- 2. Rate limit check function (atomic increment + check)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key TEXT,
  _window_seconds INT DEFAULT 60,
  _max_requests INT DEFAULT 30
)
RETURNS TABLE(allowed BOOLEAN, current_count INT, remaining INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _window_start TIMESTAMPTZ;
  _current INT;
BEGIN
  -- Calculate window start (truncated to window_seconds intervals)
  _window_start := date_trunc('second', now()) 
    - (EXTRACT(EPOCH FROM now())::INT % _window_seconds) * INTERVAL '1 second';
  
  -- Atomic upsert: increment or insert
  INSERT INTO rate_limit_entries (key, window_start, request_count)
  VALUES (_key, _window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limit_entries.request_count + 1
  RETURNING rate_limit_entries.request_count INTO _current;
  
  -- Return result
  RETURN QUERY SELECT
    _current <= _max_requests,
    _current,
    GREATEST(0, _max_requests - _current),
    _window_start + (_window_seconds * INTERVAL '1 second');
END;
$$;

-- 3. Cleanup function for old rate limit entries
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_entries()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted INT;
BEGIN
  DELETE FROM rate_limit_entries
  WHERE window_start < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- 4. Security audit log for blocked/suspicious requests
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source_ip TEXT,
  user_id uuid,
  function_name TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_created
  ON public.security_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_event_type
  ON public.security_audit_log (event_type);

-- RLS: only service role can access these tables
ALTER TABLE public.rate_limit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service_role can access (edge functions use service role)
