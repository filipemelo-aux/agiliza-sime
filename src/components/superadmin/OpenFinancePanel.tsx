import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notice";

type OF = {
  configured: boolean; active?: boolean; message?: string; error_code?: string | null; billing_url?: string | null;
  connections: { item_id: string; status: string | null; institution: string | null; updated_at: string | null; consent_expires_at: string | null; error: string | null }[];
  accounts: { id: string; name: string | null; type: string | null; number: string | null; agency: string | null; bank: string | null; owner: string | null }[];
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

export function OpenFinancePanel() {
  const [data, setData] = useState<OF | null>(null);
  const [busy, setBusy] = useState<"load" | "sync" | null>(null);

  const run = useCallback(async (action: "open_finance_status" | "open_finance_sync") => {
    setBusy(action === "open_finance_sync" ? "sync" : "load");
    const { data: r, error } = await supabase.functions.invoke("superadmin-tenants", { body: { action } });
    setBusy(null);
    if (error) { toast.error("Não foi possível consultar o Open Finance."); return; }
    setData(r as OF);
    if (action === "open_finance_sync" && (r as OF)?.active) toast.success("Atualização solicitada ao banco.");
  }, []);

  useEffect(() => { run("open_finance_status"); }, [run]);

  const badge = !data ? null : !data.configured
    ? <span className="rounded bg-muted px-2 py-0.5">Não configurado</span>
    : data.active
      ? <span className="rounded bg-success/15 text-success px-2 py-0.5">Ativo</span>
      : <span className="rounded bg-destructive/15 text-destructive px-2 py-0.5">{data.error_code === "subscription_past_due" ? "Assinatura suspensa" : "Indisponível"}</span>;

  return (
    <div className="md:col-span-6 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Situação:</span>{busy === "load" && !data ? <Loader2 className="h-4 w-4 animate-spin" /> : badge}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" className="h-9 text-xs" disabled={!!busy} onClick={() => run("open_finance_status")}>
            {busy === "load" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Consultar
          </Button>
          <Button type="button" variant="outline" className="h-9 text-xs" disabled={!!busy || !data?.active} onClick={() => run("open_finance_sync")}>
            {busy === "sync" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Forçar atualização
          </Button>
          <Button type="button" className="h-9 text-xs" asChild>
            <a href={data?.billing_url || "https://app.mcp.ai/billing?tab=payment"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Renovar / pagamento</a>
          </Button>
          <Button type="button" variant="outline" className="h-9 text-xs" asChild>
            <a href="https://app.mcp.ai" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Reconectar banco</a>
          </Button>
        </div>
      </div>
      {data?.message && !data.active && <p className="rounded border border-destructive/40 bg-destructive/5 p-2">{data.message}</p>}
      {data?.active && (
        <>
          <table className="w-full border text-left">
            <thead className="bg-muted/50"><tr><th className="p-1.5">Banco</th><th className="p-1.5">Agência</th><th className="p-1.5">Conta</th><th className="p-1.5">Tipo</th><th className="p-1.5">Titular</th></tr></thead>
            <tbody>
              {data.accounts.length === 0 && <tr><td colSpan={5} className="p-1.5 text-muted-foreground">Nenhuma conta vinculada.</td></tr>}
              {data.accounts.map((a) => (
                <tr key={a.id} className="border-t"><td className="p-1.5">{a.bank || a.name || "—"}</td><td className="p-1.5">{a.agency || "—"}</td><td className="p-1.5">{a.number || "—"}</td><td className="p-1.5">{a.type || "—"}</td><td className="p-1.5">{a.owner || "—"}</td></tr>
              ))}
            </tbody>
          </table>
          {data.connections.map((c) => (
            <p key={c.item_id} className="text-muted-foreground">
              Conexão {c.institution || c.item_id}: {c.status || "—"} · última atualização {fmt(c.updated_at)}{c.consent_expires_at ? ` · consentimento válido até ${fmt(c.consent_expires_at)}` : ""}{c.error ? ` · ${c.error}` : ""}
            </p>
          ))}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">O consentimento bancário do Open Finance expira periodicamente; quando vencer, use “Reconectar banco” para autorizar novamente.</p>
    </div>
  );
}
