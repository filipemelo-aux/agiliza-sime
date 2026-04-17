/**
 * RH Colaboradores Service
 * Camada derivada (view model) que une duas fontes existentes — profiles (categoria
 * 'colaborador') e vehicles (frota própria) — sem criar nova tabela e sem duplicar dados.
 */
import { supabase } from "@/integrations/supabase/client";

export type ColaboradorRH = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cargo: string | null;
  departamento: string | null;
  data_admissao: string | null;
  salario: number | null;
  tipo: "colaborador" | "motorista_frota_propria";
  ativo: boolean;
  vehicle_plates?: string[];
};

export async function fetchColaboradoresRH(): Promise<ColaboradorRH[]> {
  const [colabRes, vehRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, cargo, departamento, data_admissao, salario")
      .eq("category", "colaborador")
      .order("full_name"),
    supabase
      .from("vehicles")
      .select("plate, driver_id, is_active, fleet_type")
      .eq("fleet_type", "propria")
      .not("driver_id", "is", null),
  ]);

  const colaboradoresList: ColaboradorRH[] = ((colabRes.data as any[]) || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    cargo: p.cargo,
    departamento: p.departamento,
    data_admissao: p.data_admissao,
    salario: p.salario,
    tipo: "colaborador",
    ativo: true,
  }));

  const driverVehicles = new Map<string, { plates: string[]; anyActive: boolean }>();
  ((vehRes.data as any[]) || []).forEach((v) => {
    const entry = driverVehicles.get(v.driver_id) || { plates: [], anyActive: false };
    entry.plates.push(v.plate);
    if (v.is_active) entry.anyActive = true;
    driverVehicles.set(v.driver_id, entry);
  });

  let motoristasList: ColaboradorRH[] = [];
  const driverIds = Array.from(driverVehicles.keys());
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, cargo, departamento, data_admissao, salario")
      .in("id", driverIds);
    motoristasList = ((drivers as any[]) || [])
      .filter((d) => !colaboradoresList.some((c) => c.id === d.id))
      .map((d) => {
        const info = driverVehicles.get(d.id)!;
        return {
          id: d.id,
          full_name: d.full_name,
          email: d.email,
          phone: d.phone,
          cargo: d.cargo || "Motorista",
          departamento: d.departamento || "Frota Própria",
          data_admissao: d.data_admissao,
          salario: d.salario,
          tipo: "motorista_frota_propria" as const,
          ativo: info.anyActive,
          vehicle_plates: info.plates,
        };
      });
  }

  return [...colaboradoresList, ...motoristasList].sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );
}

export type ChartAccount = { id: string; codigo: string; nome: string; tipo: string };

export async function fetchChartAccounts(): Promise<ChartAccount[]> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id, codigo, nome, tipo")
    .eq("ativo", true)
    .order("codigo");
  return (data as any) || [];
}
