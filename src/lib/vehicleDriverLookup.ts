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
    // driver_id normalmente aponta para profiles.user_id, mas cadastros manuais
    // (sem conta de acesso) podem estar vinculados por profiles.id.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, full_name")
      .or(`user_id.eq.${vehicle.driver_id},id.eq.${vehicle.driver_id}`)
      .limit(1);
    const profile = profiles?.[0];
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

/**
 * Busca o veículo vinculado ao motorista.
 * Aceita tanto profiles.user_id quanto profiles.id, pois cadastros manuais
 * de motorista podem não possuir conta de acesso (user_id nulo).
 */
export async function lookupVehicleByDriver(
  userId?: string | null,
  profileId?: string | null
): Promise<VehicleByDriver | null> {
  const ids = [userId, profileId].filter(Boolean) as string[];
  if (ids.length === 0) return null;

  const { data } = await supabase
    .from("vehicles")
    .select("plate, antt_number, is_active, vehicle_type")
    .in("driver_id", ids);

  if (!data || data.length === 0) return null;

  // Prioriza veículo ativo e tração (evita reboques/implementos).
  const tracao = ["truck", "bitruck", "carreta", "carreta_ls", "rodotrem", "bitrem", "treminhao"];
  const sorted = [...data].sort((a, b) => {
    const score = (v: typeof a) =>
      (v.is_active ? 2 : 0) + (tracao.includes(v.vehicle_type as string) ? 1 : 0);
    return score(b) - score(a);
  });

  return { plate: sorted[0].plate, rntrc: sorted[0].antt_number || null };
}

