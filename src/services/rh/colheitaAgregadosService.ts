/**
 * Cálculo de Agregados de Colheita por Motorista
 *
 * Reaproveita EXATAMENTE a lógica utilizada na tela
 * "Relatórios → Colheita → Aba Agregados" (`HarvestDetail.tsx`):
 *
 *   - dias = getFilteredDays(assignment, filterStart, filterEnd)
 *   - dailyValue = assignment.daily_value || job.payment_value/30 || job.monthly_value/30
 *   - totalBruto = dias * dailyValue
 *
 * Para fins de comissão de motorista, o "valor base" é o `totalBruto` por
 * assignment (mesmo conceito do "Bruto" no relatório de Agregados).
 *
 * IMPORTANTE: aqui NÃO replicamos descontos do agregado nem do empresa —
 * a comissão é calculada sobre a base bruta (dias × diária), exatamente como
 * a coluna "Bruto" do relatório.
 */
import { supabase } from "@/integrations/supabase/client";

export type AgregadoColheitaRow = {
  /** id do harvest_assignment (referência usada na comissão) */
  assignmentId: string;
  harvestJobId: string;
  farmName: string;
  /** profiles.user_id (auth) */
  userId: string;
  /** profiles.id (interno) */
  profileId: string | null;
  driverName: string;
  vehiclePlate: string | null;
  startDate: string;
  endDate: string | null;
  diasTrabalhados: number;
  valorDiaria: number;
  valorTotal: number;
  jaComissionado: boolean;
};

function getLocalDateISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60 * 1000).toISOString().slice(0, 10);
}

/** Mesma lógica de `getFilteredDays` em HarvestDetail.tsx */
function getFilteredDays(
  startDateISO: string,
  endDateISO: string | null,
  filterStart: string | null,
  filterEnd: string | null
): number {
  const assignStart = new Date(startDateISO + "T00:00:00");
  const effectiveStart = filterStart
    ? new Date(Math.max(assignStart.getTime(), new Date(filterStart + "T00:00:00").getTime()))
    : assignStart;
  const today = new Date(getLocalDateISO() + "T00:00:00");
  const filterEndD = filterEnd ? new Date(filterEnd + "T00:00:00") : null;
  const assignEnd = endDateISO ? new Date(endDateISO + "T00:00:00") : null;
  let effectiveEnd: Date;
  if (filterEndD && assignEnd) {
    effectiveEnd = new Date(Math.min(filterEndD.getTime(), assignEnd.getTime()));
  } else if (filterEndD) {
    effectiveEnd = filterEndD;
  } else if (assignEnd) {
    effectiveEnd = assignEnd;
  } else {
    effectiveEnd = today;
  }
  if (effectiveEnd < effectiveStart) return 0;
  return Math.max(
    1,
    Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
}

/**
 * Carrega agregados de colheita para um motorista (profiles.id),
 * aplicando período opcional [filterStart, filterEnd] da mesma forma
 * que a aba "Agregados" do relatório.
 */
export async function fetchAgregadosColheitaPorMotorista(
  colaboradorProfileId: string,
  filterStart: string | null,
  filterEnd: string | null
): Promise<AgregadoColheitaRow[]> {
  // 1. Resolve user_id (auth) a partir de profiles.id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_id, full_name")
    .eq("id", colaboradorProfileId)
    .maybeSingle();

  if (!profile?.user_id) return [];

  // 2. Carrega assignments do motorista
  const { data: assigns } = await supabase
    .from("harvest_assignments")
    .select("id, harvest_job_id, user_id, vehicle_id, start_date, end_date, daily_value")
    .eq("user_id", profile.user_id)
    .order("start_date", { ascending: false });

  if (!assigns || assigns.length === 0) return [];

  // 3. Carrega jobs (para fallback de daily) e nomes
  const jobIds = Array.from(new Set(assigns.map((a: any) => a.harvest_job_id)));
  const { data: jobs } = await supabase
    .from("harvest_jobs")
    .select("id, farm_name, payment_value, monthly_value")
    .in("id", jobIds);
  const jobMap = new Map<string, any>((jobs || []).map((j: any) => [j.id, j]));

  // 4. Carrega placas dos veículos
  const vehicleIds = assigns.map((a: any) => a.vehicle_id).filter(Boolean) as string[];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, plate").in("id", vehicleIds)
    : { data: [] as any[] };
  const vehMap = new Map<string, string>((vehicles || []).map((v: any) => [v.id, v.plate]));

  // 5. Verifica quais assignments já foram comissionados
  const assignIds = assigns.map((a: any) => a.id);
  const { data: jaComissionados } = assignIds.length
    ? await (supabase.from("comissoes" as any) as any)
        .select("referencia_id")
        .eq("origem", "colheita")
        .in("referencia_id", assignIds)
    : { data: [] as any[] };
  const blocked = new Set<string>((jaComissionados || []).map((r: any) => r.referencia_id));

  // 6. Calcula linhas
  const rows: AgregadoColheitaRow[] = assigns.map((a: any) => {
    const job = jobMap.get(a.harvest_job_id);
    const fallbackDaily = job ? (job.payment_value || job.monthly_value || 0) / 30 : 0;
    const dailyValue = Number(a.daily_value) || fallbackDaily;
    const dias = getFilteredDays(a.start_date, a.end_date, filterStart, filterEnd);
    const total = dias * dailyValue;
    return {
      assignmentId: a.id,
      harvestJobId: a.harvest_job_id,
      farmName: job?.farm_name || "—",
      userId: profile.user_id!,
      profileId: profile.id,
      driverName: profile.full_name || "—",
      vehiclePlate: a.vehicle_id ? vehMap.get(a.vehicle_id) || null : null,
      startDate: a.start_date,
      endDate: a.end_date,
      diasTrabalhados: dias,
      valorDiaria: dailyValue,
      valorTotal: total,
      jaComissionado: blocked.has(a.id),
    };
  });

  // Mostra somente linhas que têm dias dentro do período
  return rows.filter((r) => r.diasTrabalhados > 0);
}
