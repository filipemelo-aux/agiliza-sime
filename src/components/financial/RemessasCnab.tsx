import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/PageTitle";
import { formatCurrency } from "@/lib/masks";
import { baixarRemessa } from "@/lib/boleto/remessaService";
import { toast } from "@/lib/notice";

type Remessa = { id: string; nsa: number; nome_arquivo: string; qtd_titulos: number; valor_total: number; fatura_numeros: number[]; created_at: string };

/** Arquivo das remessas CNAB geradas a partir das faturas; permite baixar de novo o mesmo .rem. */
export function RemessasCnab() {
  const [rows, setRows] = useState<Remessa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("remessas_cnab").select("id, nsa, nome_arquivo, qtd_titulos, valor_total, fatura_numeros, created_at")
      .order("created_at", { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data as Remessa[]) ?? []);
        setLoading(false);
      });
  }, []);

  const baixar = async (r: Remessa) => {
    setBusy(r.id);
    const { data, error } = await supabase.from("remessas_cnab").select("conteudo").eq("id", r.id).single();
    setBusy(null);
    if (error || !data) return toast.error(error?.message || "Remessa não encontrada.");
    baixarRemessa(r.nome_arquivo, data.conteudo);
  };

  return (
    <div className="space-y-3">
      <PageTitle>Remessas de Boletos</PageTitle>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Remessa</th>
              <th className="px-3 py-2 text-left">Arquivo</th>
              <th className="px-3 py-2 text-left">Faturas</th>
              <th className="px-3 py-2 text-right">Boletos</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhuma remessa gerada ainda.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">{r.nsa}</td>
                <td className="px-3 py-2 font-mono">{r.nome_arquivo}</td>
                <td className="px-3 py-2">{r.fatura_numeros.join(", ")}</td>
                <td className="px-3 py-2 text-right">{r.qtd_titulos}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(Number(r.valor_total))}</td>
                <td className="px-3 py-1 text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Baixar arquivo" disabled={busy === r.id} onClick={() => baixar(r)}>
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
