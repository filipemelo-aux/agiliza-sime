import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type QueueStatus = "pending" | "processing" | "completed" | "failed" | "timeout";

interface QueueJob {
  id: string;
  job_type: string;
  entity_id: string;
  status: QueueStatus;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  result: any;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface FiscalRealtimeOptions {
  /** Called when the queue job status changes */
  onQueueUpdate?: (job: QueueJob) => void;
  /** Called when the underlying entity (cte/mdfe) status changes */
  onEntityUpdate?: (payload: { table: string; id: string; status: string; data: any }) => void;
  /** Called when processing finishes (completed, failed, or timeout) */
  onFinished?: (job: QueueJob) => void;
}

/**
 * Hook to subscribe to fiscal queue + entity changes via Realtime.
 *
 * Usage:
 * ```tsx
 * const { subscribe, unsubscribe, currentJob } = useFiscalRealtime({
 *   onFinished: (job) => {
 *     if (job.status === 'completed') toast.success('Documento autorizado!');
 *     else toast.error(job.error_message);
 *   },
 * });
 *
 * // After calling emitirCteViaService:
 * subscribe({ jobId: result.data.queue_job_id, entityId: cteId, entityTable: 'ctes' });
 * ```
 */
export function useFiscalRealtime(options: FiscalRealtimeOptions = {}) {
  const [currentJob, setCurrentJob] = useState<QueueJob | null>(null);
  const [isListening, setIsListening] = useState(false);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cleanup = useCallback(() => {
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];
    setIsListening(false);
  }, []);

  const subscribe = useCallback(
    ({
      jobId,
      entityId,
      entityTable,
    }: {
      jobId: string;
      entityId: string;
      entityTable: "ctes" | "mdfe";
    }) => {
      // Clean previous subscriptions
      cleanup();

      // 1. Subscribe to queue job changes
      const queueChannel = supabase
        .channel(`fiscal-queue-${jobId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "fiscal_queue",
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            const job = payload.new as QueueJob;
            setCurrentJob(job);
            optionsRef.current.onQueueUpdate?.(job);

            if (job.status === "completed" || job.status === "failed" || job.status === "timeout") {
              optionsRef.current.onFinished?.(job);
              // Auto-cleanup after terminal state
              setTimeout(cleanup, 1000);
            }
          }
        )
        .subscribe();

      // 2. Subscribe to entity (cte/mdfe) changes
      const entityChannel = supabase
        .channel(`fiscal-entity-${entityId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: entityTable,
            filter: `id=eq.${entityId}`,
          },
          (payload) => {
            optionsRef.current.onEntityUpdate?.({
              table: entityTable,
              id: entityId,
              status: (payload.new as any).status,
              data: payload.new,
            });
          }
        )
        .subscribe();

      channelsRef.current = [queueChannel, entityChannel];
      setIsListening(true);
    },
    [cleanup]
  );

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    subscribe,
    unsubscribe: cleanup,
    currentJob,
    isListening,
  };
}
