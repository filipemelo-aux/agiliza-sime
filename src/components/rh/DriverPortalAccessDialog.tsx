import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notice";
import { maskCpf, isValidCpf, cpfDigits } from "@/lib/driverPortal";

type Props = { profile: { id: string; full_name: string; user_id?: string | null } | null; onClose: () => void };

export function DriverPortalAccessDialog({ profile, onClose }: Props) {
  const [cpf, setCpf] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setCpf(""); setAtivo(false);
    (async () => {
      const { data: acc } = await supabase.from("driver_portal_access").select("cpf, ativo").eq("profile_id", profile.id).maybeSingle();
      if (acc) { setCpf(maskCpf(acc.cpf)); setAtivo(acc.ativo); return; }
      const { data: pr } = await supabase.from("profiles").select("cnpj, user_id").eq("id", profile.id).maybeSingle();
      const d = cpfDigits(pr?.cnpj || "");
      if (d.length === 11) { setCpf(maskCpf(d)); return; }
      const uid = profile.user_id || pr?.user_id;
      if (uid) {
        const { data: doc } = await supabase.from("driver_documents").select("cpf").eq("user_id", uid).limit(1).maybeSingle();
        if (doc?.cpf) setCpf(maskCpf(doc.cpf));
      }
    })();
  }, [profile]);

  const run = async (action: "grant" | "revoke") => {
    if (!profile) return;
    if (action === "grant") {
      if (!cpf) return toast.error("CPF não cadastrado", "Atualize o cadastro do motorista em Cadastros → Pessoas informando o CPF.");
      if (!isValidCpf(cpf)) return toast.error("CPF inválido no cadastro", "Corrija o CPF do motorista em Cadastros → Pessoas.");
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("driver-portal", { body: { action, profile_id: profile.id, cpf: cpfDigits(cpf) } });
    setBusy(false);
    let msg = data?.error;
    if (error) { try { msg = (await (error as any).context.json()).error; } catch { msg = error.message; } }
    if (msg) return toast.error("Não foi possível salvar", msg);
    toast.success(action === "grant" ? "Acesso liberado" : "Acesso bloqueado");
    onClose();
  };

  return (
    <Dialog open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Acesso ao Portal do Motorista</DialogTitle>
          <DialogDescription>{profile?.full_name} entra em <b>/motorista</b> somente com o CPF.{ativo ? " Acesso ativo." : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {cpf ? <p className="text-sm">CPF cadastrado: <b>{cpf}</b></p> : <p className="text-sm text-destructive">Este motorista não tem CPF no cadastro. Atualize em Cadastros → Pessoas antes de ativar o acesso.</p>}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {ativo ? <Button variant="outline" className="h-10" disabled={busy} onClick={() => run("revoke")}>Bloquear acesso</Button> : <span />}
          <Button className="h-10" disabled={busy || !cpf} onClick={() => run("grant")}>{ativo ? "Atualizar acesso" : "Ativar acesso"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
