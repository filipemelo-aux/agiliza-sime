import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/MonthPicker";
import { CalendarRange, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeriodFilterProps {
  /** yyyy-MM-dd */
  inicio: string;
  /** yyyy-MM-dd */
  fim: string;
  onChange: (inicio: string, fim: string) => void;
  /** compact height */
  size?: "sm" | "default";
  className?: string;
  /** show a button to clear the period entirely */
  allowClear?: boolean;
}

const isFullMonth = (inicio: string, fim: string) => {
  if (!inicio || !fim) return false;
  const start = new Date(`${inicio}T12:00:00`);
  const end = new Date(`${fim}T12:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  return (
    format(startOfMonth(start), "yyyy-MM-dd") === inicio &&
    format(endOfMonth(start), "yyyy-MM-dd") === fim
  );
};

/**
 * Filtro de período padrão do sistema:
 * - Modo "mês": seletor discreto de mês (MonthPicker)
 * - Modo "período definido": intervalo customizado (De / Até)
 */
export function PeriodFilter({
  inicio,
  fim,
  onChange,
  size = "default",
  className,
  allowClear = false,
}: PeriodFilterProps) {
  const monthMatch = useMemo(() => isFullMonth(inicio, fim), [inicio, fim]);
  const [mode, setMode] = useState<"mes" | "custom">(
    monthMatch || (!inicio && !fim) ? "mes" : "custom",
  );

  // Se o valor externo mudar para um mês completo, volta ao modo mês
  useEffect(() => {
    if (monthMatch) setMode((m) => (m === "custom" ? m : "mes"));
  }, [monthMatch]);

  const h = size === "sm" ? "h-8" : "h-9";
  const text = size === "sm" ? "text-xs" : "text-xs";

  const monthValue = inicio
    ? inicio.slice(0, 7)
    : format(new Date(), "yyyy-MM");

  const handleMonth = (ym: string) => {
    const base = new Date(`${ym}-01T12:00:00`);
    onChange(format(startOfMonth(base), "yyyy-MM-dd"), format(endOfMonth(base), "yyyy-MM-dd"));
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {mode === "mes" ? (
        <>
          <MonthPicker
            value={monthValue}
            onChange={handleMonth}
            className={cn(h, text, "min-w-[132px]")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(h, "w-8 shrink-0 text-muted-foreground")}
            title="Período definido"
            aria-label="Período definido"
            onClick={() => setMode("custom")}
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Input
            type="date"
            aria-label="Data inicial"
            title="Data inicial"
            className={cn(h, text, "w-[132px]")}
            value={inicio}
            onChange={(e) => onChange(e.target.value, fim)}
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            aria-label="Data final"
            title="Data final"
            className={cn(h, text, "w-[132px]")}
            value={fim}
            onChange={(e) => onChange(inicio, e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(h, "w-8 shrink-0 text-muted-foreground")}
            title="Filtrar por mês"
            aria-label="Filtrar por mês"
            onClick={() => {
              setMode("mes");
              handleMonth(monthValue);
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {allowClear && (inicio || fim) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(h, "w-8 shrink-0 text-muted-foreground")}
          title="Limpar período"
          aria-label="Limpar período"
          onClick={() => {
            setMode("custom");
            onChange("", "");
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
