import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnifiedCompany, EstablishmentInfo } from "@/hooks/useUnifiedCompany";

/** Rótulo curto da empresa: "Matriz" / "Filial <complemento>" */
export function empresaShortLabel(e?: EstablishmentInfo | null) {
  if (!e) return "—";
  if (e.type === "matriz") return "Matriz";
  const extra = (e.razao_social || "").split("-").slice(1).join("-").trim();
  return extra ? extra.replace(/^Filial\s*/i, "Filial ") : "Filial";
}

export function useEmpresaOptions() {
  const { establishments, matrizId, loading } = useUnifiedCompany();
  const options = useMemo(
    () => establishments.map((e) => ({ id: e.id, label: empresaShortLabel(e), full: e.razao_social, type: e.type })),
    [establishments],
  );
  return { options, establishments, matrizId, loading };
}

/** Select obrigatório de Empresa/Unidade para formulários financeiros */
export function EmpresaSelect({
  value,
  onChange,
  label = "Empresa / Unidade",
  required = true,
  disabled,
  className,
  size = "sm",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
}) {
  const { options } = useEmpresaOptions();
  const h = size === "sm" ? "h-9" : "h-10";
  return (
    <div className={className}>
      {label && (
        <Label className="text-xs text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn(h, "text-xs")}>
          <SelectValue placeholder="Selecione a empresa..." />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              {o.label} — {o.full}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Filtro de empresa para listagens ("" = Todas as Empresas) */
export function EmpresaFilter({
  value,
  onChange,
  className,
  size = "sm",
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "default";
}) {
  const { options } = useEmpresaOptions();
  const h = size === "sm" ? "h-8" : "h-9";
  const active = !!value;
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger
        className={cn(
          h,
          "text-xs gap-1 w-auto min-w-[130px]",
          active && "bg-primary text-white border-primary [&>svg]:text-white",
          className,
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <SelectItem value="all" className="text-xs">Todas as Empresas</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Identificação compacta da empresa para grids */
export function EmpresaBadge({ empresaId, className }: { empresaId?: string | null; className?: string }) {
  const { establishments } = useUnifiedCompany();
  const est = establishments.find((e) => e.id === empresaId);
  if (!est) return <span className={cn("text-[10px] text-muted-foreground", className)}>—</span>;
  const isMatriz = est.type === "matriz";
  return (
    <span
      title={est.razao_social}
      className={cn(
        "inline-flex h-4 items-center justify-center rounded border px-1.5 text-[9px] font-medium leading-none",
        isMatriz
          ? "bg-primary/10 text-primary border-primary/30"
          : "bg-amber-500/10 text-amber-700 border-amber-500/30",
        className,
      )}
    >
      {isMatriz ? "Matriz" : "Filial"}
    </span>
  );
}
