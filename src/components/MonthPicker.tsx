import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthPickerProps {
  /** Value as "YYYY-MM" */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const MONTHS_PT_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const parseYM = (v: string): { year: number; month: number } => {
  const [y, m] = v.split("-").map(Number);
  if (!y || !m) {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return { year: y, month: m };
};

const formatYM = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const { year: selectedYear, month: selectedMonth } = useMemo(() => parseYM(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedYear);

  const today = new Date();
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;

  const label = `${MONTHS_PT_LONG[selectedMonth - 1]} ${selectedYear}`;

  const handleSelect = (m: number) => {
    onChange(formatYM(viewYear, m));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setViewYear(selectedYear); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-10 justify-start text-left font-normal gap-2", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
          <span className="capitalize">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{viewYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y + 1)}
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS_PT.map((m, idx) => {
            const monthNum = idx + 1;
            const isSelected = viewYear === selectedYear && monthNum === selectedMonth;
            const isCurrent = viewYear === currentY && monthNum === currentM;
            return (
              <Button
                key={m}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-9 text-xs font-medium",
                  !isSelected && isCurrent && "border border-primary/40 text-primary",
                )}
                onClick={() => handleSelect(monthNum)}
              >
                {m}
              </Button>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              const ym = formatYM(currentY, currentM);
              onChange(ym);
              setViewYear(currentY);
              setOpen(false);
            }}
          >
            Mês atual
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
