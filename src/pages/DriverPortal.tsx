import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/notice";
import { Wallet, FileText, Truck, Fuel, LogOut, ArrowLeft, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { maskCurrency, unmaskCurrency, formatCurrency } from "@/lib/masks";
import { cpfDigits, driverEmailFromCpf, maskCpf, isValidCpf } from "@/lib/driverPortal";
import { tenantLogoFrom } from "@/lib/tenantLogo";
import { getLocalDateISO } from "@/lib/date";
import agilizaLogo from "@/assets/brand/agiliza-tms-logo.png";

type Empresa = { nome: string; logo_url: string | null; cnpj: string };

type Ctx = {
  nome: string;
  naturezas: string[];
  vehicle: { id: string; plate: string } | null;
  empresa: Empresa | null;
  recentes: { id: string; status: string; descricao: string; valor_total: number; data_emissao: string; veiculo_placa: string | null; portal_status: string }[];
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("driver-portal", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function compressImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}

const STATUS: Record<string, string> = { em_analise: "Em análise", aprovado: "Aprovado", rejeitado: "Recusado" };

export default function DriverPortal() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [view, setView] = useState<"home" | "reembolso">("home");

  const loadCtx = async () => {
    try { setCtx(await call({ action: "context" })); }
    catch (e: any) { toast.error("Acesso não liberado", e.message); await supabase.auth.signOut(); setSignedIn(false); }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    supabase.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (signedIn) loadCtx(); else setCtx(null); }, [signedIn]);

  if (!ready) return null;
  if (!signedIn) return <Login />;
  if (!ctx) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="shrink-0 rounded-lg bg-card px-2 py-1">
            <img src={tenantLogoFrom(ctx.empresa?.logo_url) || agilizaLogo} alt={ctx.empresa?.nome || "Agiliza TMS"} className="h-11 max-w-28 w-auto object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs opacity-80">Portal do Motorista</p>
            <p className="font-semibold text-lg leading-tight truncate">{ctx.nome}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" aria-label="Sair" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <main className="max-w-md mx-auto p-4">
        {view === "home" ? (
          <Home ctx={ctx} onReembolso={() => setView("reembolso")} />
        ) : (
          <ReembolsoForm ctx={ctx} onBack={() => setView("home")} onDone={() => { setView("home"); loadCtx(); }} />
        )}
      </main>
    </div>
  );
}

function Login() {
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  useEffect(() => {
    const d = cpfDigits(cpf);
    setEmpresa(null);
    if (d.length !== 11 || !isValidCpf(d)) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.functions.invoke("driver-portal", { body: { action: "branding", cpf: d } });
      if (alive && data?.ok && data.empresa) setEmpresa(data.empresa as Empresa);
    })();
    return () => { alive = false; };
  }, [cpf]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCpf(cpf)) return toast.error("CPF inválido", "Confira os números do seu CPF.");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("driver-portal", { body: { action: "login", cpf: cpfDigits(cpf) } });
    let msg = data?.error;
    if (error) { try { msg = (await (error as any).context.json()).error; } catch { msg = error.message; } }
    if (!msg) {
      const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (e2) msg = e2.message;
    }
    setBusy(false);
    if (msg) toast.error("Não foi possível entrar", msg);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <form onSubmit={submit} className="w-full max-w-sm bg-card rounded-xl border p-6 space-y-4 shadow-sm">
        <div className="text-center">
          <img
            src={tenantLogoFrom(empresa?.logo_url) || agilizaLogo}
            alt={empresa?.nome || "Agiliza TMS"}
            className="h-20 max-w-full w-auto mx-auto object-contain"
          />
          <h1 className="text-xl font-bold mt-3">Portal do Motorista</h1>
          <p className="text-sm text-muted-foreground">Entre com seu CPF</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" inputMode="numeric" className="h-12 text-lg" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" />
        </div>
        <Button type="submit" className="w-full h-12 text-base" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}</Button>
      </form>
    </div>
  );
}

function Home({ ctx, onReembolso }: { ctx: Ctx; onReembolso: () => void }) {
  const tiles = [
    { label: "Reembolso", icon: Wallet, on: onReembolso },
    { label: "Notas", icon: FileText },
    { label: "Comprovantes de descarga", icon: Truck },
    { label: "Abastecimento", icon: Fuel },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={t.on}
            disabled={!t.on}
            className="aspect-square rounded-xl border bg-card flex flex-col items-center justify-center gap-2 p-3 text-center shadow-sm active:scale-95 transition disabled:opacity-50"
          >
            <t.icon className="h-10 w-10 text-primary" />
            <span className="font-bold uppercase text-sm leading-tight">{t.label}</span>
            {!t.on && <span className="text-[11px] text-muted-foreground">Em manutenção</span>}
          </button>
        ))}
      </div>
      {ctx.recentes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Meus últimos envios</h2>
          <ul className="space-y-2">
            {ctx.recentes.map((r) => (
              <li key={r.id} className="bg-card border rounded-lg p-3 text-sm flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate">{r.descricao}</p>
                  <p className="text-xs text-muted-foreground">{r.data_emissao.split("-").reverse().join("/")} · {r.veiculo_placa}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono">{formatCurrency(r.valor_total)}</p>
                  <p className="text-xs text-muted-foreground">{r.status === "pago" ? "Pago" : STATUS[r.portal_status] || r.portal_status}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReembolsoForm({ ctx, onBack, onDone }: { ctx: Ctx; onBack: () => void; onDone: () => void }) {
  const [data, setData] = useState(getLocalDateISO());
  const [valor, setValor] = useState("");
  const [natureza, setNatureza] = useState("");
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const v = Number(unmaskCurrency(valor));
    if (!(v > 0)) return toast.error("Informe o valor");
    if (!natureza) return toast.error("Escolha o motivo");
    if (!ctx.vehicle) return toast.error("Sem placa vinculada", "Procure o escritório para vincular sua placa.");
    if (!foto) return toast.error("Tire a foto do comprovante");
    setBusy(true);
    try {
      const foto_base64 = await compressImage(foto);
      await call({ action: "reembolso", data, valor: v, natureza, observacao: obs, foto_base64 });
      setSent(true);
    } catch (e: any) {
      toast.error("Não foi possível enviar", e.message);
    } finally { setBusy(false); }
  };

  if (sent) return (
    <div className="text-center space-y-4 py-10">
      <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
      <p className="text-lg font-semibold">Reembolso enviado!</p>
      <p className="text-sm text-muted-foreground">O escritório vai analisar e você verá o resultado aqui.</p>
      <Button className="h-12 w-full" onClick={onDone}>Voltar ao início</Button>
    </div>
  );

  const sel = "h-12 w-full rounded-md border bg-background px-3 text-base";
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-primary"><ArrowLeft className="h-4 w-4" /> Voltar</button>
      <h1 className="text-xl font-bold">Reembolso</h1>
      <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
        {ctx.vehicle ? <>Placa: <b>{ctx.vehicle.plate}</b></> : <span className="text-destructive">Nenhuma placa vinculada a você. Procure o escritório.</span>}
      </div>
      <div className="space-y-1"><Label>Motivo</Label>
        <select className={sel} value={natureza} onChange={(e) => setNatureza(e.target.value)}>
          <option value="">Selecione</option>
          {ctx.naturezas.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Data</Label><Input type="date" className="h-12" value={data} max={getLocalDateISO()} onChange={(e) => setData(e.target.value)} /></div>
        <div className="space-y-1"><Label>Valor (R$)</Label><Input inputMode="numeric" className="h-12 text-lg" value={valor} onChange={(e) => setValor(maskCurrency(e.target.value))} placeholder="0,00" /></div>
      </div>
      <div className="space-y-1"><Label>Observação (local, detalhe)</Label><Input className="h-12" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} /></div>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer bg-card">
        <Camera className="h-8 w-8 text-primary" />
        <span className="text-sm font-medium">{foto ? foto.name : "Foto do comprovante / cupom"}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
      </label>
      <Button className="w-full h-14 text-base" onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar reembolso"}</Button>
    </div>
  );
}
