import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/masks";
import { toast } from "@/lib/notice";

type Account = {
  name: string | null;
  prepaid: boolean;
  balance: number | null;
  balance_threshold: number | null;
  current_bill: number | null;
  current_usage: number | null;
  min_bill: number | null;
};

type AccountResponse = {
  configured: boolean;
  active: boolean;
  message?: string;
  checked_at?: string;
  account?: Account | null;
};

const money = (value: number | null | undefined) => value === null || value === undefined ? "—" : formatCurrency(value);

export function InfoSimplesPanel() {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: response, error } = await supabase.functions.invoke("superadmin-tenants", {
      body: { action: "infosimples_account" },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível consultar os créditos do InfoSimples.");
      return;
    }
    setData(response as AccountResponse);
  }, []);

  useEffect(() => { load(); }, [load]);

  const account = data?.account;
  const lowBalance = !!account?.prepaid && account.balance !== null && account.balance_threshold !== null && Number(account.balance) <= Number(account.balance_threshold);

  return (
    <section className="mb-5 rounded-lg border bg-card" aria-labelledby="infosimples-creditos-title">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <WalletCards className="h-5 w-5" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h2 id="infosimples-creditos-title" className="text-sm font-semibold">Créditos InfoSimples</h2>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Conta global</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Saldo e consumo das consultas de documentos e multas da frota.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={loading} onClick={load}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Atualizar
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9" asChild>
            <a href="https://infosimples.com/" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-4 w-4" /> Abrir InfoSimples
            </a>
          </Button>
        </div>
      </div>

      <div className="p-4">
        {loading && !data ? (
          <div className="flex h-16 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consultando a conta…</div>
        ) : !data?.configured ? (
          <p className="text-xs text-muted-foreground">A conexão global do InfoSimples não está configurada.</p>
        ) : !data.active || !account ? (
          <p className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{data.message || "Não foi possível obter os dados da conta."}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`rounded-md border p-3 ${lowBalance ? "border-warning/50 bg-warning/5" : "bg-muted/20"}`}>
                <p className="text-[11px] text-muted-foreground">Saldo disponível</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${lowBalance ? "text-warning" : "text-success"}`}>{money(account.balance)}</p>
                {lowBalance && <p className="mt-1 text-[11px] text-warning">Saldo no limite de alerta</p>}
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">Consumo no mês atual</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{money(account.current_usage)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">Fatura em aberto</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{money(account.current_bill)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">Alerta de saldo baixo</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{money(account.balance_threshold)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Titular: <strong className="font-medium text-foreground">{account.name || "—"}</strong></span>
              <span>Modalidade: <strong className="font-medium text-foreground">{account.prepaid ? "Pré-paga" : "Pós-paga"}</strong></span>
              {account.min_bill !== null && <span>Franquia mínima mensal: <strong className="font-medium text-foreground">{money(account.min_bill)}</strong></span>}
              {data.checked_at && <span className="ml-auto">Atualizado em {new Date(data.checked_at).toLocaleString("pt-BR")}</span>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
