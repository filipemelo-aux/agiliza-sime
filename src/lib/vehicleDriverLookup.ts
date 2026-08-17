import { supabase } from "@/integrations/supabase/client";
import { unmaskPlate } from "@/lib/masks";

export interface DriverByPlate {
  motorista_id: string | null;
  motorista_nome: string | null;
  rntrc: string | null;
  plate: string;
}

/**
 * Busca no cadastro o veículo pela placa e retorna o motorista vinculado.
 * vehicles.driver_id referencia profiles.user_id (auth id).
 */
export async function lookupDriverByPlate(rawPlate: string): Promise<DriverByPlate | null> {
  const plate = unmaskPlate(rawPlate || "").toUpperCase();
  if (plate.length !== 7) return null;

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate, driver_id, antt_number")
    .eq("plate", plate)
    .maybeSingle();

  if (!vehicle) return null;

  let motorista_id: string | null = null;
  let motorista_nome: string | null = null;

  if (vehicle.driver_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("user_id", vehicle.driver_id)
      .maybeSingle();
    if (profile) {
      motorista_id = profile.id;
      motorista_nome = profile.full_name;
    }
  }

  return {
    motorista_id,
    motorista_nome,
    rntrc: vehicle.antt_number || null,
    plate: vehicle.plate,
  };
}

export interface VehicleByDriver {
  plate: string;
  rntrc: string | null;
}

/** Busca o veículo ativo vinculado ao motorista (profiles.user_id). */
export async function lookupVehicleByDriver(userId?: string | null): Promise<VehicleByDriver | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("vehicles")
    .select("plate, antt_number")
    .eq("driver_id", userId)
    .eq("is_active", true)
    .limit(1);
  if (!data || data.length === 0) return null;
  return { plate: data[0].plate, rntrc: data[0].antt_number || null };
}
