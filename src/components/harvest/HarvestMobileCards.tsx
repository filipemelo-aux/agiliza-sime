import { Pencil, Check, X, MinusCircle, Trash2, Truck, User, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

interface Discount {
  id: string;
  type: string;
  description: string;
  value: number;
  date?: string;
}

interface Assignment {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  start_date: string;
  end_date: string | null;
  daily_value: number | null;
  company_daily_value: number | null;
  status: string;
  discounts: Discount[];
  company_discounts: Discount[];
  driver_name?: string;
  vehicle_plate?: string;
  owner_name?: string;
  days_worked?: number;
  fleet_type?: string;
}

interface AgregadoData {
  dv: number;
  days: number;
  totalBruto: number;
  totalDescontos: number;
  totalLiquido: number;
}

interface FaturamentoData {
  dvEmpresa: number;
  days: number;
  totalBruto: number;
  liquidoTerceiros: number;
  descontosEmpresa: number;
  faturamentoLiquido: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string) =>
  new Date(date + "T00:00:00").toLocaleDateString("pt-BR");

// ─── Agregado Card ───

interface AgregadoCardProps {
  assignment: Assignment;
  data: AgregadoData;
  editingStartDateId: string | null;
  editingStartDateValue: string;
  editingEndDateId: string | null;
  editingEndDateValue: string;
  editingDailyId: string | null;
  editingDailyValue: string;
  onStartEditStartDate: (id: string, value: string) => void;
  onSaveStartDate: (id: string) => void;
  onCancelStartDate: () => void;
  onChangeStartDate: (value: string) => void;
  onStartEditEndDate: (id: string, value: string) => void;
  onSaveEndDate: (id: string) => void;
  onCancelEndDate: () => void;
  onChangeEndDate: (value: string) => void;
  onStartEditDaily: (id: string, value: string) => void;
  onSaveDaily: (id: string) => void;
  onCancelDaily: () => void;
  onChangeDaily: (value: string) => void;
  onOpenDiscount: (a: Assignment) => void;
  onRemove: (id: string) => void;
}

export function AgregadoMobileCard({
  assignment: a,
  data,
  editingStartDateId, editingStartDateValue,
  editingEndDateId, editingEndDateValue,
  editingDailyId, editingDailyValue,
  onStartEditStartDate, onSaveStartDate, onCancelStartDate, onChangeStartDate,
  onStartEditEndDate, onSaveEndDate, onCancelEndDate, onChangeEndDate,
  onStartEditDaily, onSaveDaily, onCancelDaily, onChangeDaily,
  onOpenDiscount, onRemove,
}: AgregadoCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Header: Driver + Plate */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">{a.driver_name}</span>
          </div>
          <div className="flex items-center gap-4 mt-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="font-mono">{a.vehicle_plate}</span>
            </div>
            {a.owner_name && a.owner_name !== "—" && (
              <span className="text-xs text-muted-foreground truncate">{a.owner_name}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive shrink-0" onClick={() => onRemove(a.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Início</span>
          {editingStartDateId === a.id ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Input type="date" className="h-7 text-xs flex-1" value={editingStartDateValue} onChange={(e) => onChangeStartDate(e.target.value)} autoFocus />
              <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={() => onSaveStartDate(a.id)}><Check className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelStartDate}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 cursor-pointer mt-0.5" onClick={() => onStartEditStartDate(a.id, a.start_date)}>
              <span className="text-sm">{formatDate(a.start_date)}</span>
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Fim</span>
          {editingEndDateId === a.id ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Input type="date" className="h-7 text-xs flex-1" value={editingEndDateValue} onChange={(e) => onChangeEndDate(e.target.value)} autoFocus />
              <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={() => onSaveEndDate(a.id)}><Check className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelEndDate}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 cursor-pointer mt-0.5" onClick={() => onStartEditEndDate(a.id, a.end_date || "")}>
              <span className={`text-sm ${a.end_date ? "" : "text-muted-foreground"}`}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Financial row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Dias</span>
          <Badge variant="secondary" className="mt-0.5 text-xs font-semibold">{data.days}</Badge>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Diária</span>
          {editingDailyId === a.id ? (
            <div className="flex items-center gap-1 mt-0.5">
              <div className="relative flex-1">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">R$</span>
                <Input
                  className="h-7 text-xs pl-6 w-full"
                  value={editingDailyValue ? maskCurrency(String(Math.round(parseFloat(editingDailyValue) * 100))) : ""}
                  onChange={(e) => onChangeDaily(unmaskCurrency(e.target.value))}
                  autoFocus
                />
              </div>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => onSaveDaily(a.id)}><Check className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onCancelDaily}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 cursor-pointer mt-0.5" onClick={() => onStartEditDaily(a.id, String(data.dv))}>
              <span className="text-sm">{formatCurrency(data.dv)}</span>
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Descontos</span>
          <div className="flex items-center gap-0.5 mt-0.5">
            <span className={`text-sm ${data.totalDescontos > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {data.totalDescontos > 0 ? `- ${formatCurrency(data.totalDescontos)}` : "—"}
            </span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onOpenDiscount(a)}>
              <MinusCircle className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Total Líquido</span>
        <span className="text-base font-bold text-primary">{formatCurrency(data.totalLiquido)}</span>
      </div>
    </div>
  );
}

// ─── Faturamento Card ───

interface FaturamentoCardProps {
  assignment: Assignment;
  data: FaturamentoData;
  onOpenCompanyDiscount: (a: Assignment) => void;
}

export function FaturamentoMobileCard({ assignment: a, data, onOpenCompanyDiscount }: FaturamentoCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{a.driver_name}</span>
        </div>
        <div className="flex items-center gap-4 mt-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="font-mono">{a.vehicle_plate}</span>
          </div>
          {a.owner_name && a.owner_name !== "—" && (
            <span className="text-xs text-muted-foreground truncate">{a.owner_name}</span>
          )}
        </div>
      </div>

      {/* Dates + Days */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Início</span>
          <span>{formatDate(a.start_date)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Fim</span>
          <span className={a.end_date ? "" : "text-muted-foreground"}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Dias</span>
          <Badge variant="secondary" className="text-xs font-semibold">{data.days}</Badge>
        </div>
      </div>

      {/* Financial grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border text-sm">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Diária Empresa</span>
          <span>{formatCurrency(data.dvEmpresa)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Bruto</span>
          <span>{formatCurrency(data.totalBruto)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Líq. Terceiros</span>
          <span className="text-orange-500">{formatCurrency(data.liquidoTerceiros)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Descontos Emp.</span>
          <div className="flex items-center gap-0.5">
            <span className={data.descontosEmpresa > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
              {data.descontosEmpresa > 0 ? `- ${formatCurrency(data.descontosEmpresa)}` : "—"}
            </span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onOpenCompanyDiscount(a)}>
              <MinusCircle className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Fat. Líquido</span>
        <span className="text-base font-bold text-green-600">{formatCurrency(data.faturamentoLiquido)}</span>
      </div>
    </div>
  );
}

// ─── Cliente Card ───

interface ClienteData {
  dvCliente: number;
  days: number;
  totalBruto: number;
  totalDescontos: number;
  totalLiquido: number;
}

interface ClienteCardProps {
  assignment: Assignment;
  data: ClienteData;
}

export function ClienteMobileCard({ assignment: a, data }: ClienteCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{a.driver_name}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <Truck className="h-3 w-3 shrink-0" />
          <span className="font-mono">{a.vehicle_plate}</span>
        </div>
      </div>

      {/* Dates + Days */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Início</span>
          <span>{formatDate(a.start_date)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Fim</span>
          <span className={a.end_date ? "" : "text-muted-foreground"}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Dias</span>
          <Badge variant="secondary" className="text-xs font-semibold">{data.days}</Badge>
        </div>
      </div>

      {/* Financial grid */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-sm">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Diária</span>
          <span>{formatCurrency(data.dvCliente)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Bruto</span>
          <span>{formatCurrency(data.totalBruto)}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground block">Descontos</span>
          <span className={data.totalDescontos > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
            {data.totalDescontos > 0 ? `- ${formatCurrency(data.totalDescontos)}` : "—"}
          </span>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Total Cliente</span>
        <span className="text-base font-bold text-primary">{formatCurrency(data.totalLiquido)}</span>
      </div>
    </div>
  );
}
