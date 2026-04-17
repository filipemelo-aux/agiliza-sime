/**
 * RH Colaboradores Service
 *
 * Fonte única: tabela `profiles` filtrada por `is_colaborador_rh = true`.
 *
 * Importante: o RH NÃO depende mais do módulo de Frota. A antiga regra
 * "motorista vinculado a veículo de Frota Própria = colaborador" foi removida.
 * Para que uma pessoa apareça aqui, ela precisa ter o flag explícito
 * `is_colaborador_rh` ativo no cadastro (independente da categoria).
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
  /** Categoria original do cadastro (motorista, colaborador, etc.) — apenas informativo. */
  tipo: "colaborador" | "motorista" | "outro";
  ativo: boolean;
};

export async function fetchColaboradoresRH(): Promise<ColaboradorRH[]> {
  // [DEBUG RH] Carrega TODOS os profiles para diagnosticar inclusões/exclusões
  const { data: allProfiles, error: allErr } = await supabase
    .from("profiles")
    .select("id, full_name, category, is_colaborador_rh")
    .order("full_name");

  if (allErr) {
    console.error("[DEBUG RH] Erro ao carregar profiles:", allErr);
  } else {
    console.groupCollapsed(
      `[DEBUG RH] Diagnóstico de ${allProfiles?.length ?? 0} pessoa(s) cadastrada(s)`
    );
    console.table(
      (allProfiles ?? []).map((p: any) => {
        const isRH = p.is_colaborador_rh === true;
        const isMotorista = p.category === "motorista";
        return {
          id: p.id,
          nome: p.full_name,
          categoria: p.category ?? "—",
          isMotorista,
          isColaboradorRH: isRH,
          incluido: isRH ? "✅ SIM" : "❌ NÃO",
          motivo: isRH
            ? "is_colaborador_rh = true (regra global)"
            : "is_colaborador_rh = false/null — marque o checkbox no cadastro",
        };
      })
    );
    const motoristasRH = (allProfiles ?? []).filter(
      (p: any) => p.category === "motorista" && p.is_colaborador_rh === true
    );
    const motoristasNaoRH = (allProfiles ?? []).filter(
      (p: any) => p.category === "motorista" && p.is_colaborador_rh !== true
    );
    console.log(
      `[DEBUG RH] Motoristas com is_colaborador_rh = true: ${motoristasRH.length}`
    );
    console.log(
      `[DEBUG RH] Motoristas SEM is_colaborador_rh: ${motoristasNaoRH.length}`,
      motoristasNaoRH.map((m: any) => m.full_name)
    );
    console.groupEnd();
  }

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, cargo, departamento, data_admissao, salario, category"
    )
    .eq("is_colaborador_rh", true)
    .order("full_name");

  console.log(
    `[DEBUG RH] Resultado final da query (is_colaborador_rh=true): ${data?.length ?? 0} registro(s)`
  );

  return ((data as any[]) || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    cargo: p.cargo,
    departamento: p.departamento,
    data_admissao: p.data_admissao,
    salario: p.salario,
    tipo:
      p.category === "colaborador"
        ? "colaborador"
        : p.category === "motorista"
          ? "motorista"
          : "outro",
    ativo: true,
  }));
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
