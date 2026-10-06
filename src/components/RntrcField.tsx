import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ANTT_URL = "https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx";

/** Busca o RNTRC já conhecido para o CNPJ (estabelecimentos fiscais e veículos do proprietário). */
async function findKnownRntrc(cnpj: string): Promise<string | null> {
  const { data: est } = await supabase
    .from("fiscal_establishments").select("rntrc").eq("cnpj", cnpj).not("rntrc", "is", null).limit(1);
  const e = (est as any)?.[0]?.rntrc;
  if (e && String(e).trim()) return String(e).trim();
  const { data: profs } = await supabase.from("profiles").select("id").eq("cnpj", cnpj).limit(5);
  const ids = (profs || []).map((p: any) => p.id);
  if (ids.length) {
    const { data: v } = await supabase
      .from("vehicles").select("antt_number").in("owner_id", ids).not("antt_number", "is", null).limit(1);
    const a = (v as any)?.[0]?.antt_number;
    if (a && String(a).trim()) return String(a).trim();
  }
  return null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  cnpj: string;
  className?: string;
}

export function RntrcField({ value, onChange, cnpj, className }: Props) {
  const digits = (cnpj || "").replace(/\D/g, "");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const lastLooked = useRef("");

  useEffect(() => {
    if (digits.length !== 14 || (value || "").trim() || lastLooked.current === digits) return;
    lastLooked.current = digits;
    let alive = true;
    setLoading(true);
    findKnownRntrc(digits)
      .then((r) => {
        if (!alive) return;
        if (r) { onChange(r); setHint("Preenchido a partir de cadastros anteriores."); }
        else setHint("");
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const openAntt = async () => {
    if (digits) {
      try { await navigator.clipboard.writeText(digits); toast({ title: "CNPJ copiado", description: "Cole no site da ANTT para consultar o RNTRC." }); } catch { /* ignore */ }
    }
    window.open(ANTT_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-0.5">
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Input className={className} value={value || ""} onChange={(e) => { setHint(""); onChange(e.target.value); }} />
          {loading && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Consultar na ANTT" onClick={openAntt}>
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
