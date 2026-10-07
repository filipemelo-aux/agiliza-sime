import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Filter, RotateCcw, X } from "lucide-react";
import { PlanoContasCombobox, PlanoContaOption } from "./PlanoContasCombobox";
import { PeriodFilter } from "@/components/PeriodFilter";
import { FilterField } from "@/components/ui/search-filter-card";

export type QuickPeriod = "todos" | "mes_atual" | "mes_anterior";

export interface CashFlowFilterValues {
  dataInicio: Date | null;
  dataFim: Date | null;
  tipo: "todos" | "entrada" | "saida";
  origem: "todos" | "contas_pagar" | "contas_receber" | "despesas" | "colheitas" | "pagamento_despesa" | "manual";
  valorMin: string;
  valorMax: string;
  quickPeriod: QuickPeriod;
  planoContasId: string;
}

interface CashFlowFiltersProps {
  filters: CashFlowFilterValues;
  onChange: (filters: CashFlowFilterValues) => void;
  chartAccounts?: PlanoContaOption[];
  primaryFilter?: React.ReactNode;
}

function getDatesForPeriod(period: QuickPeriod): { dataInicio: Date | null; dataFim: Date | null } {
  const now = new Date();
  if (period === "mes_atual") return { dataInicio: startOfMonth(now), dataFim: endOfMonth(now) };
  if (period === "mes_anterior") {
    const prev = subMonths(now, 1);
    return { dataInicio: startOfMonth(prev), dataFim: endOfMonth(prev) };
  }
  return { dataInicio: null, dataFim: null };
}

export function CashFlowFilters({ filters, onChange, chartAccounts, primaryFilter }: CashFlowFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<CashFlowFilterValues>) => {
    onChange({ ...filters, ...partial });
  };

  const setQuickPeriod = (period: QuickPeriod) => {
    const dates = getDatesForPeriod(period);
    onChange({ ...filters, ...dates, quickPeriod: period });
  };

  const hasAdvancedFilters = filters.valorMin !== "" || filters.valorMax !== "";
  const hasAnyFilter = filters.tipo !== "todos" || filters.origem !== "todos" || hasAdvancedFilters || filters.dataInicio !== null || filters.dataFim !== null || filters.planoContasId !== "todos";

  const clearAll = () => {
    onChange({
      dataInicio: null,
      dataFim: null,
      tipo: "todos",
      origem: "todos",
      valorMin: "",
      valorMax: "",
      quickPeriod: "todos",
      planoContasId: "todos",
    });
  };

  const clearAdvanced = () => {
    update({ valorMin: "", valorMax: "" });
  };

  const periodButtons: { key: QuickPeriod; label: string }[] = [
    { key: "todos", label: "Todas" },
    { key: "mes_atual", label: "Mês atual" },
    { key: "mes_anterior", label: "Mês anterior" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-end justify-end gap-2">
        <FilterField label="Período" className="mr-auto">
          <PeriodFilter
            size="sm"
            inicio={filters.dataInicio ? format(filters.dataInicio, "yyyy-MM-dd") : ""}
            fim={filters.dataFim ? format(filters.dataFim, "yyyy-MM-dd") : ""}
            allowClear
            onChange={(i, f) =>
              update({
                dataInicio: i ? new Date(`${i}T12:00:00`) : null,
                dataFim: f ? new Date(`${f}T12:00:00`) : null,
                quickPeriod: "todos",
              })
            }
          />
        </FilterField>
        {primaryFilter}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {periodButtons.map((p) => (
            <Button key={p.key} variant={filters.quickPeriod === p.key ? "default" : "outline"} size="sm" className="h-8 px-2.5 text-xs" onClick={() => setQuickPeriod(p.key)}>
              {p.label}
            </Button>
          ))}
        </div>
        <FilterField label="Tipo">
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
        </FilterField>

        <FilterField label="Origem">
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
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        {chartAccounts && (
          <FilterField label="Plano de Contas" className="min-w-[220px]">
            <PlanoContasCombobox
              value={filters.planoContasId}
              onChange={(v) => update({ planoContasId: v })}
              options={chartAccounts}
              size="sm"
              includeAll
              allValue="todos"
              allLabel="Todos"
              placeholder="Todos"
              includeSemClassificacao
              allowCreate={false}
            />
          </FilterField>
        )}
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

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground hover:text-destructive gap-1"
            onClick={clearAll}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-2">
          <FilterField label="Valor mínimo">
            <Input
              type="number"
              placeholder="0,00"
              className="w-[130px] h-9"
              value={filters.valorMin}
              onChange={(e) => update({ valorMin: e.target.value })}
            />
          </FilterField>
          <FilterField label="Valor máximo">
            <Input
              type="number"
              placeholder="0,00"
              className="w-[130px] h-9"
              value={filters.valorMax}
              onChange={(e) => update({ valorMax: e.target.value })}
            />
          </FilterField>
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
