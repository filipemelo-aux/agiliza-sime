import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

export interface MaintenanceItem {
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

interface Props {
  veiculoId: string | null;
  onVeiculoIdChange: (id: string | null) => void;
  kmAtual: string;
  onKmAtualChange: (v: string) => void;
  tipoManutencao: string;
  onTipoManutencaoChange: (v: string) => void;
  fornecedorMecanica: string;
  onFornecedorMecanicaChange: (v: string) => void;
  tempoParado: string;
  onTempoParadoChange: (v: string) => void;
  proximaManutencaoKm: string;
  onProximaManutencaoKmChange: (v: string) => void;
  itensManutencao: MaintenanceItem[];
  onItensManutencaoChange: (items: MaintenanceItem[]) => void;
  onTotalChange: (total: number) => void;
}

export function MaintenanceFields({
  veiculoId, onVeiculoIdChange,
  kmAtual, onKmAtualChange,
  tipoManutencao, onTipoManutencaoChange,
  fornecedorMecanica, onFornecedorMecanicaChange,
  tempoParado, onTempoParadoChange,
  proximaManutencaoKm, onProximaManutencaoKmChange,
  itensManutencao, onItensManutencaoChange,
  onTotalChange,
}: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lastKm, setLastKm] = useState<number | null>(null);
  const [kmError, setKmError] = useState("");

  // New item form
  const [newTipo, setNewTipo] = useState<"peca" | "servico">("peca");
  const [newDesc, setNewDesc] = useState("");
  const [newQtd, setNewQtd] = useState("1");
  const [newValor, setNewValor] = useState("");

  useEffect(() => {
    supabase.from("vehicles").select("id, plate, brand, model").eq("is_active", true).then(({ data }) => {
      if (data) setVehicles(data);
    });
  }, []);

  // Fetch last km when vehicle changes
  useEffect(() => {
    if (!veiculoId) { setLastKm(null); return; }
    supabase
      .from("expenses")
      .select("km_atual")
      .eq("veiculo_id", veiculoId)
      .eq("tipo_despesa", "manutencao")
      .not("km_atual", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setLastKm(data?.km_atual ? Number(data.km_atual) : null);
      });
  }, [veiculoId]);

  // Validate km
  useEffect(() => {
    if (!kmAtual || lastKm === null) { setKmError(""); return; }
    if (Number(kmAtual) <= lastKm) {
      setKmError(`KM deve ser maior que o último registrado (${lastKm.toLocaleString("pt-BR")} km)`);
    } else {
      setKmError("");
    }
  }, [kmAtual, lastKm]);

  // Recalculate total when items change
  useEffect(() => {
    const total = itensManutencao.reduce((s, i) => s + i.valor_total, 0);
    onTotalChange(total);
  }, [itensManutencao]);

  const addItem = () => {
    if (!newDesc.trim()) return toast.error("Informe a descrição do item");
    if (!newValor || Number(newValor) <= 0) return toast.error("Informe o valor unitário");
    const qtd = Number(newQtd) || 1;
    const vu = Number(newValor);
    const item: MaintenanceItem = {
      tipo: newTipo,
      descricao: newDesc.trim(),
      quantidade: qtd,
      valor_unitario: vu,
      valor_total: qtd * vu,
    };
    onItensManutencaoChange([...itensManutencao, item]);
    setNewDesc("");
    setNewQtd("1");
    setNewValor("");
  };

  const removeItem = (idx: number) => {
    onItensManutencaoChange(itensManutencao.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Dados da Manutenção</span>
      </div>

      {/* Vehicle + Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Veículo *</Label>
          <Select value={veiculoId || ""} onValueChange={(v) => onVeiculoIdChange(v || null)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.plate} - {v.brand} {v.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo Manutenção *</Label>
          <Select value={tipoManutencao} onValueChange={onTipoManutencaoChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="corretiva">Corretiva</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KM + Fornecedor */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>KM Atual *</Label>
          <Input
            type="number"
            value={kmAtual}
            onChange={e => onKmAtualChange(e.target.value)}
            placeholder="0"
          />
          {kmError && <p className="text-xs text-destructive mt-1">{kmError}</p>}
          {lastKm !== null && !kmError && (
            <p className="text-xs text-muted-foreground mt-1">Último KM: {lastKm.toLocaleString("pt-BR")}</p>
          )}
        </div>
        <div>
          <Label>Fornecedor / Mecânica</Label>
          <Input value={fornecedorMecanica} onChange={e => onFornecedorMecanicaChange(e.target.value)} placeholder="Nome da oficina" />
        </div>
      </div>

      {/* Tempo parado + Próxima manutenção */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tempo Parado</Label>
          <Input value={tempoParado} onChange={e => onTempoParadoChange(e.target.value)} placeholder="Ex: 2 dias" />
        </div>
        <div>
          <Label>Próxima Manutenção (KM)</Label>
          <Input type="number" value={proximaManutencaoKm} onChange={e => onProximaManutencaoKmChange(e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* Items */}
      <div>
        <Label className="mb-1 block">Itens da Manutenção ({itensManutencao.length})</Label>
        
        {/* Add item row */}
        <div className="flex gap-2 mb-2">
          <Select value={newTipo} onValueChange={(v) => setNewTipo(v as "peca" | "servico")}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="peca">Peça</SelectItem>
              <SelectItem value="servico">Serviço</SelectItem>
            </SelectContent>
          </Select>
          <Input className="flex-1" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descrição" />
          <Input className="w-[70px]" type="number" value={newQtd} onChange={e => setNewQtd(e.target.value)} placeholder="Qtd" />
          <Input className="w-[100px]" type="number" step="0.01" value={newValor} onChange={e => setNewValor(e.target.value)} placeholder="Valor" />
          <Button type="button" variant="outline" size="icon" onClick={addItem}><Plus className="h-4 w-4" /></Button>
        </div>

        {itensManutencao.length > 0 && (
          <div className="border rounded-md overflow-x-auto max-h-[200px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-right">Qtd</TableHead>
                  <TableHead className="text-xs text-right">Vl. Unit.</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensManutencao.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.tipo === "peca" ? "Peça" : "Serviço"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{item.descricao}</TableCell>
                    <TableCell className="text-xs text-right">{item.quantidade}</TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {item.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {item.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {itensManutencao.length > 0 && (
          <div className="text-right mt-1">
            <span className="text-sm font-semibold text-foreground">
              Total Itens: R$ {itensManutencao.reduce((s, i) => s + i.valor_total, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
