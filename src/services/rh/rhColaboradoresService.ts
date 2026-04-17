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
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, cargo, departamento, data_admissao, salario, category"
    )
    .eq("is_colaborador_rh", true)
    .order("full_name");

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
