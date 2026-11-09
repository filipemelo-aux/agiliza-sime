import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/notice";
import { maskCpf, isValidCpf, cpfDigits } from "@/lib/driverPortal";

type Props = { profile: { id: string; full_name: string; user_id?: string | null } | null; onClose: () => void };

export function DriverPortalAccessDialog({ profile, onClose }: Props) {
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setSenha(""); setCpf(""); setAtivo(false);
    (async () => {
      const { data: acc } = await supabase.from("driver_portal_access").select("cpf, ativo").eq("profile_id", profile.id).maybeSingle();
      if (acc) { setCpf(maskCpf(acc.cpf)); setAtivo(acc.ativo); return; }
      if (profile.user_id) {
        const { data: doc } = await supabase.from("driver_documents").select("cpf").eq("user_id", profile.user_id).maybeSingle();
        if (doc?.cpf) setCpf(maskCpf(doc.cpf));
      }
    })();
  }, [profile]);

  const run = async (action: "grant" | "revoke") => {
    if (!profile) return;
    if (action === "grant") {
      if (!isValidCpf(cpf)) return toast.error("CPF inválido");
      if (senha.length < 6) return toast.error("Senha curta", "Use pelo menos 6 caracteres.");
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("driver-portal", { body: { action, profile_id: profile.id, cpf: cpfDigits(cpf), senha } });
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
          <DialogDescription>{profile?.full_name} entra em <b>/motorista</b> com CPF e senha.{ativo ? " Acesso ativo." : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">CPF</Label><Input className="h-9" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} /></div>
          <div className="space-y-1"><Label className="text-xs">{ativo ? "Nova senha" : "Senha"}</Label><Input className="h-9" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {ativo ? <Button variant="outline" className="h-10" disabled={busy} onClick={() => run("revoke")}>Bloquear acesso</Button> : <span />}
          <Button className="h-10" disabled={busy} onClick={() => run("grant")}>{ativo ? "Salvar nova senha" : "Liberar acesso"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
