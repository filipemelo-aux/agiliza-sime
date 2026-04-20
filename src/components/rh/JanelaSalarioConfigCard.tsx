/**
 * JanelaSalarioConfigCard
 * UI administrativa para os parâmetros de inferência de competência salarial
 * armazenados em `public.rh_config`:
 *   • salary_window_tolerance_days  → tolerância (dias) após o fim da quinzena
 *   • quinzena_1_range              → { start_day, end_day } da 1ª quinzena
 *
 * Permite ajustar o comportamento de `fn_infer_salario_competencia` SEM
 * alterar código. Apenas administradores conseguem gravar (RLS).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, CalendarRange, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

type RHConfigRow = { key: string; value: any; description: string | null };

const KEYS = {
  tol: "salary_window_tolerance_days",
  q1: "quinzena_1_range",
} as const;

export function JanelaSalarioConfigCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tolerancia, setTolerancia] = useState<number>(10);
  const [q1Start, setQ1Start] = useState<number>(1);
  const [q1End, setQ1End] = useState<number>(15);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from("rh_config" as any) as any)
        .select("key,value,description")
        .in("key", [KEYS.tol, KEYS.q1]);
      if (error) throw error;
      const rows = (data || []) as RHConfigRow[];
      const tolRow = rows.find((r) => r.key === KEYS.tol);
      const q1Row = rows.find((r) => r.key === KEYS.q1);
      if (tolRow) setTolerancia(Number(tolRow.value) || 10);
      if (q1Row && typeof q1Row.value === "object" && q1Row.value) {
        setQ1Start(Number(q1Row.value.start_day) || 1);
        setQ1End(Number(q1Row.value.end_day) || 15);
      }
    } catch (e: any) {
      toast.error("Erro ao carregar configurações: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const validate = (): string | null => {
    if (tolerancia < 0 || tolerancia > 31) return "Tolerância deve estar entre 0 e 31 dias.";
    if (q1Start < 1 || q1Start > 28) return "Início da 1ª quinzena deve estar entre 1 e 28.";
    if (q1End < 1 || q1End > 28) return "Fim da 1ª quinzena deve estar entre 1 e 28.";
    if (q1End < q1Start) return "Fim da 1ª quinzena deve ser maior ou igual ao início.";
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload = [
        {
          key: KEYS.tol,
          value: tolerancia as any,
          description: "Tolerância (dias) após o fim do período para aceitar despesas como pertencentes àquela quinzena",
        },
        {
          key: KEYS.q1,
          value: { start_day: q1Start, end_day: q1End } as any,
          description: "Faixa de dias considerada 1ª quinzena (usada para inferir competência salarial)",
        },
      ];
      const { error } = await (supabase.from("rh_config" as any) as any)
        .upsert(payload, { onConflict: "key" });
      if (error) throw error;
      toast.success("Configurações salvas — novas inferências usarão estes parâmetros.");
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // Exemplo dinâmico para o admin entender o efeito
  const exemploDia = q1End + Math.min(5, tolerancia);
  const exemploDia2 = q1End + tolerancia + 2;

  return (
    <Card>
      <CardContent className="p-4 space-y-4 max-w-2xl">
        <div className="flex items-start gap-2">
          <CalendarRange className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Janela de competência salarial</h3>
            <p className="text-[11px] text-muted-foreground">
              Define como o sistema infere a <strong>competência</strong> de uma despesa de salário a partir da
              data de emissão. Ajuste sem alterar código — afeta apenas novos lançamentos.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">1ª quinzena · início</Label>
                <Input
                  type="number" min={1} max={28}
                  value={q1Start}
                  onChange={(e) => setQ1Start(parseInt(e.target.value) || 1)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">1ª quinzena · fim</Label>
                <Input
                  type="number" min={1} max={28}
                  value={q1End}
                  onChange={(e) => setQ1End(parseInt(e.target.value) || 15)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tolerância (dias)</Label>
                <Input
                  type="number" min={0} max={31}
                  value={tolerancia}
                  onChange={(e) => setTolerancia(parseInt(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">Como o sistema decide a competência:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>
                      Emissão entre <strong>dia {q1Start}</strong> e <strong>dia {q1End + tolerancia}</strong>
                      {" "}→ competência = <strong>2ª quinzena do mês anterior</strong>
                    </li>
                    <li>
                      Emissão entre <strong>dia {q1End + 1}</strong> e fim do mês
                      {" "}→ competência = <strong>1ª quinzena do mês corrente</strong>
                    </li>
                  </ul>
                  <p className="text-[10px] text-sky-700/80 pt-1">
                    Exemplo: emissão dia <strong>{exemploDia}</strong> → quinzena anterior · emissão dia{" "}
                    <strong>{exemploDia2}</strong> → 1ª quinzena corrente.
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar janela de competência
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
