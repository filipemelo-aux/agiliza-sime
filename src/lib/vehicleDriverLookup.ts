import { supabase } from "@/integrations/supabase/client";
import { unmaskPlate } from "@/lib/masks";

export interface DriverByPlate {
  vehicle_id: string;
  owner_id: string | null;
  owner_nome: string | null;
  owner_documento: string | null;
  vehicle_type: string | null;
  trailers: string[];
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
    .select("id, plate, driver_id, antt_number, owner_id, vehicle_type, trailer_plate_1, trailer_plate_2")
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

  const owner = await loadOwner(vehicle.owner_id);
  return {
    vehicle_id: vehicle.id,
    owner_id: owner?.id ?? null,
    owner_nome: owner?.nome || null,
    owner_documento: owner?.documento || null,
    vehicle_type: vehicle.vehicle_type || null,
    trailers: [vehicle.trailer_plate_1, vehicle.trailer_plate_2].filter(Boolean) as string[],
    motorista_id,
    motorista_nome,
    rntrc: vehicle.antt_number || null,
    plate: vehicle.plate,
  };
}

export interface VehicleByDriver {
  vehicle_id: string;
  plate: string;
  rntrc: string | null;
  owner_id: string | null;
  owner_nome: string | null;
  owner_documento: string | null;
  vehicle_type: string | null;
  trailers: string[];
}

/**
 * vehicles.owner_id pode guardar profiles.user_id (auth) ou profiles.id.
 * Retorna sempre o profiles.id. Se o proprietário for uma empresa emitente
 * (frota própria da Sime), is_emitter=true: o CT-e mostra a própria empresa
 * como proprietária, mas ela não é gravada como contratada (FK).
 */
async function loadOwner(ownerId?: string | null): Promise<{ id: string | null; nome: string; documento: string; is_emitter: boolean } | null> {
  if (!ownerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, razao_social, cnpj")
    .or(`id.eq.${ownerId},user_id.eq.${ownerId}`)
    .limit(1);
  const p: any = data?.[0];
  if (!p) return { id: null, nome: "", documento: "", is_emitter: false };
  const { data: est } = await supabase.from("fiscal_establishments").select("id").eq("profile_id", p.id).limit(1);
  const is_emitter = !!(est && est.length > 0);
  return { id: is_emitter ? null : p.id, nome: p.razao_social || p.full_name || "", documento: p.cnpj || "", is_emitter };
}

/** Converte um id que pode ser profiles.user_id em profiles.id (FK válida). */
export async function resolveProfileId(id?: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("id").or(`id.eq.${id},user_id.eq.${id}`).limit(1);
  return (data as any)?.[0]?.id ?? null;
}

/** Eixos carregados aproximados pelo tipo do veículo (conjunto completo). */
export function eixosPorTipo(t?: string | null): number | null {
  const m: Record<string, number> = { truck: 3, bitruck: 4, carreta: 5, carreta_ls: 6, bitrem: 7, rodotrem: 9, treminhao: 9, utilitario: 2 };
  return t ? m[t] ?? null : null;
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
    .select("id, plate, antt_number, is_active, vehicle_type, owner_id, trailer_plate_1, trailer_plate_2")
    .in("driver_id", ids);

  if (!data || data.length === 0) return null;

  // Prioriza veículo ativo e tração (evita reboques/implementos).
  const tracao = ["truck", "bitruck", "carreta", "carreta_ls", "rodotrem", "bitrem", "treminhao"];
  const sorted = [...data].sort((a, b) => {
    const score = (v: typeof a) =>
      (v.is_active ? 2 : 0) + (tracao.includes(v.vehicle_type as string) ? 1 : 0);
    return score(b) - score(a);
  });

  const v: any = sorted[0];
  const owner = await loadOwner(v.owner_id);
  return {
    vehicle_id: v.id, plate: v.plate, rntrc: v.antt_number || null,
    owner_id: owner?.id ?? null, owner_nome: owner?.nome || null, owner_documento: owner?.documento || null,
    vehicle_type: v.vehicle_type || null,
    trailers: [v.trailer_plate_1, v.trailer_plate_2].filter(Boolean),
  };
}

