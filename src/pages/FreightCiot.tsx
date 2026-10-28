import { useState } from "react";
import { PageTitle } from "@/components/PageTitle";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Route as RouteIcon, CheckCircle2, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/masks";

type ProviderId = "ciotonline" | "webmania";

const PROVIDERS: Record<ProviderId, {
  nome: string; site: string; docs: string; mensalidade: number | null; porEmissao: number | null;
  detalhes: string[]; observacao: string;
}> = {
  ciotonline: {
    nome: "CIOT Online",
    site: "https://ciotonline.com.br/precos",
    docs: "https://ciotonline.com.br/docs/saldo",
    mensalidade: 109.9,
    porEmissao: 1.29,
    detalhes: [
      "Licenciamento fixo de R$ 109,90 a cada 30 dias, sem fidelidade",
      "Créditos pré-pagos: pacote de 10 emissões por R$ 12,90 (R$ 1,29 por CIOT)",
      "Consultas na ANTT ilimitadas — não consomem crédito",
      "Créditos valem 30 dias; nova compra renova todo o saldo",
      "API REST com token (Bearer), mesmo preço do painel",
    ],
    observacao: "Valores publicados no site oficial (conferido em 28/10/2026).",
  },
  webmania: {
    nome: "Webmania",
    site: "https://webmaniabr.com/nota-fiscal-eletronica/",
    docs: "https://webmania.com.br/docs/rest-api-ciot/",
    mensalidade: 199.9,
    porEmissao: 0.99,
    detalhes: [
      "Plano PME: R$ 199,90/mês com 500 documentos e 1 CNPJ",
      "Excedente de R$ 0,99 por documento acima da franquia",
      "CIOT emitido no mesmo emissor de NF-e/CT-e/MDF-e",
      "Planos mensais estão sendo substituídos por contratação anual",
      "API REST com credenciais por empresa",
    ],
    observacao: "A Webmania não publica uma tabela própria para CIOT; valor do plano PME obtido em comparativo público (jul/2026). Confirmar com o comercial.",
  },
};

export default function FreightCiot() {
  const [selected, setSelected] = useState<ProviderId>("ciotonline");
  const [volume, setVolume] = useState("30");
  const qtd = Math.max(0, parseInt(volume) || 0);

  const custo = (id: ProviderId) => {
    const p = PROVIDERS[id];
    if (id === "ciotonline") return (p.mensalidade || 0) + Math.ceil(qtd / 10) * 12.9;
    return (p.mensalidade || 0) + Math.max(0, qtd - 500) * (p.porEmissao || 0);
  };

  return (
    <AdminLayout>
      <div className="px-4 py-3 md:px-6 space-y-4">
        <PageTitle>CIOT — Configuração do provedor</PageTitle>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2"><RouteIcon className="h-4 w-4" /> Simulação mensal</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-xs">
            <span>CIOTs emitidos por mês</span>
            <Input type="number" min={0} value={volume} onChange={(e) => setVolume(e.target.value)} className="h-9 w-28" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
            const p = PROVIDERS[id];
            const active = selected === id;
            return (
              <Card key={id} className={active ? "border-primary" : ""}>
                <CardHeader className="py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">{p.nome}</CardTitle>
                  {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div><div className="text-muted-foreground">Mensalidade</div><div className="font-semibold">{formatCurrency(p.mensalidade || 0)}</div></div>
                    <div><div className="text-muted-foreground">{id === "ciotonline" ? "Por CIOT (crédito)" : "Excedente"}</div><div className="font-semibold">{formatCurrency(p.porEmissao || 0)}</div></div>
                    <div><div className="text-muted-foreground">Custo estimado</div><div className="font-semibold">{formatCurrency(custo(id))}</div></div>
                  </div>
                  <ul className="list-disc pl-4 space-y-1">{p.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>
                  <p className="text-muted-foreground">{p.observacao}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant={active ? "default" : "outline"} onClick={() => setSelected(id)}>{active ? "Selecionado" : "Selecionar"}</Button>
                    <Button size="sm" variant="ghost" asChild><a href={p.site} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Preços</a></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">A conexão com o provedor (token de acesso) será ativada após a escolha definitiva.</p>
      </div>
    </AdminLayout>
  );
}
