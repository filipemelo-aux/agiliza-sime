import { supabase } from "@/integrations/supabase/client";

export interface PendingOrder {
  applicationId: string;
  freightId: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
}

/**
 * Checks if the user has any approved freight applications
 * with a loading order sent but no loading proof uploaded yet.
 */
export async function checkPendingLoadingOrder(userId: string): Promise<PendingOrder | null> {
  try {
    // Find approved applications with loading_order_url but no loading_proof_url
    const { data: pendingApps, error } = await supabase
      .from("freight_applications")
      .select(`
        id,
        freight_id,
        freights (
          origin_city,
          origin_state,
          destination_city,
          destination_state
        )
      `)
      .eq("user_id", userId)
      .eq("status", "approved")
      .not("loading_order_url", "is", null)
      .is("loading_proof_url", null)
      .order("loading_order_sent_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error checking pending loading order:", error);
      return null;
    }

    if (pendingApps && pendingApps.length > 0) {
      const app = pendingApps[0];
      const freight = app.freights as any;
      
      if (freight) {
        return {
          applicationId: app.id,
          freightId: app.freight_id,
          originCity: freight.origin_city,
          originState: freight.origin_state,
          destinationCity: freight.destination_city,
          destinationState: freight.destination_state,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error in checkPendingLoadingOrder:", error);
    return null;
  }
}
