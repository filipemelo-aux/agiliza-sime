import { cn } from "@/lib/utils";

/** Tonalidades padrão de linha de lista em todo o sistema */
export type RowTone = "pending" | "resolved" | "overdue" | "neutral";

/** Classe de fundo aplicada à linha da lista conforme a situação do registro */
export function rowToneClass(tone: RowTone): string {
  switch (tone) {
    case "pending":
      return "bg-warning/10 hover:bg-warning/20";
    case "resolved":
      return "bg-success/10 hover:bg-success/20";
    case "overdue":
      return "bg-destructive/10 hover:bg-destructive/20 text-destructive";
    default:
      return "";
  }
}

const DEFAULT_LEGEND: { tone: RowTone; label: string }[] = [
  { tone: "pending", label: "Pendente / em aberto" },
  { tone: "resolved", label: "Resolvido / pago / recebido" },
  { tone: "overdue", label: "Vencido / atrasado" },
];

const SWATCH: Record<RowTone, string> = {
  pending: "bg-warning/40 border-warning",
  resolved: "bg-success/40 border-success",
  overdue: "bg-destructive/40 border-destructive",
  neutral: "bg-muted border-border",
};

interface StatusLegendProps {
  items?: { tone: RowTone; label: string }[];
  className?: string;
}

/** Legenda discreta de cores exibida ao final das listagens */
export function StatusLegend({ items = DEFAULT_LEGEND, className }: StatusLegendProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground", className)}>
      {items.map((it) => (
        <span key={it.tone + it.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-[2px] border", SWATCH[it.tone])} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
