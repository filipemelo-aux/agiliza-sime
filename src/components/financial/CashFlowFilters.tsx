import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon, Filter, RotateCcw, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface CashFlowFilterValues {
  dataInicio: Date;
  dataFim: Date;
  tipo: "todos" | "entrada" | "saida";
  origem: "todos" | "contas_pagar" | "contas_receber" | "despesas" | "colheitas";
  valorMin: string;
  valorMax: string;
}

interface CashFlowFiltersProps {
  filters: CashFlowFilterValues;
  onChange: (filters: CashFlowFilterValues) => void;
}

export function CashFlowFilters({ filters, onChange }: CashFlowFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<CashFlowFilterValues>) => {
    onChange({ ...filters, ...partial });
  };

  const hasAdvancedFilters = filters.valorMin !== "" || filters.valorMax !== "";

  const hasAnyFilter = filters.tipo !== "todos" || filters.origem !== "todos" || hasAdvancedFilters;

  const clearAll = () => {
    onChange({
      dataInicio: startOfMonth(new Date()),
      dataFim: endOfMonth(new Date()),
      tipo: "todos",
      origem: "todos",
      valorMin: "",
      valorMax: "",
    });
  };

  const clearAdvanced = () => {
    update({ valorMin: "", valorMax: "" });
  };

  return (
    <div className="space-y-3">
      {/* Primary filters row */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date range */}
        <div>
          <Label className="text-xs text-muted-foreground">De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-3 w-3" />
                {format(filters.dataInicio, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dataInicio}
                onSelect={(d) => d && update({ dataInicio: d })}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-3 w-3" />
                {format(filters.dataFim, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dataFim}
                onSelect={(d) => d && update({ dataFim: d })}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Type filter */}
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={filters.tipo} onValueChange={(v) => update({ tipo: v as CashFlowFilterValues["tipo"] })}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Origin filter */}
        <div>
          <Label className="text-xs text-muted-foreground">Origem</Label>
          <Select value={filters.origem} onValueChange={(v) => update({ origem: v as CashFlowFilterValues["origem"] })}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="contas_pagar">Contas a Pagar</SelectItem>
              <SelectItem value="contas_receber">Contas a Receber</SelectItem>
              <SelectItem value="despesas">Despesas</SelectItem>
              <SelectItem value="colheitas">Colheitas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Advanced toggle */}
        <Button
          variant={hasAdvancedFilters ? "secondary" : "ghost"}
          size="sm"
          className="h-9"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filtros
          {hasAdvancedFilters && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs w-4 h-4 flex items-center justify-center">
              !
            </span>
          )}
        </Button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-muted/30">
          <div>
            <Label className="text-xs text-muted-foreground">Valor mínimo</Label>
            <Input
              type="number"
              placeholder="0,00"
              className="w-[130px] h-9"
              value={filters.valorMin}
              onChange={(e) => update({ valorMin: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor máximo</Label>
            <Input
              type="number"
              placeholder="0,00"
              className="w-[130px] h-9"
              value={filters.valorMax}
              onChange={(e) => update({ valorMax: e.target.value })}
            />
          </div>
          {hasAdvancedFilters && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearAdvanced}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
