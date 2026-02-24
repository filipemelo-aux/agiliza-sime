
-- ═══════════════════════════════════════════════════════════════
-- Distributed Queue: Atomic Job Claiming with SKIP LOCKED
-- Enables multiple stateless worker instances without conflicts
-- ═══════════════════════════════════════════════════════════════

-- 1. Add instance tracking columns
ALTER TABLE public.fiscal_queue
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 2. Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_claimable
  ON public.fiscal_queue (status, next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fiscal_queue_locked
  ON public.fiscal_queue (status, locked_at)
  WHERE status = 'processing';

-- 3. Atomic claim function using FOR UPDATE SKIP LOCKED
-- Multiple instances can call this concurrently without conflicts
CREATE OR REPLACE FUNCTION public.claim_queue_jobs(
  _instance_id TEXT,
  _batch_size INT DEFAULT 5
)
RETURNS SETOF public.fiscal_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM fiscal_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at ASC
    LIMIT _batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE fiscal_queue q
  SET
    status = 'processing',
    started_at = now(),
    attempts = attempts + 1,
    locked_by = _instance_id,
    locked_at = now()
  FROM claimed c
  WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

-- 4. Reset stale locks (for crashed instances)
CREATE OR REPLACE FUNCTION public.reset_stale_queue_locks(
  _timeout_seconds INT DEFAULT 120
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reset_count INT;
BEGIN
  WITH stale AS (
    SELECT id, attempts, max_attempts
    FROM fiscal_queue
    WHERE status = 'processing'
      AND locked_at < now() - (_timeout_seconds * INTERVAL '1 second')
    FOR UPDATE SKIP LOCKED
  )
  UPDATE fiscal_queue q
  SET
    status = CASE
      WHEN s.attempts >= s.max_attempts THEN 'timeout'
      ELSE 'pending'
    END,
    locked_by = NULL,
    locked_at = NULL,
    error_message = 'Timeout: lock expirado (instância possivelmente crashou)',
    next_retry_at = CASE
      WHEN s.attempts < s.max_attempts
        THEN now() + (LEAST(30 * POWER(2, s.attempts), 600) * INTERVAL '1 second')
      ELSE NULL
    END
  FROM stale s
  WHERE q.id = s.id;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;
