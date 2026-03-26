import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Search, Landmark, Building2, Wallet, PiggyBank, Ban, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { BankStatementDialog } from "@/components/financial/BankStatementDialog";


interface BankAccount {
  id: string;
  nome: string;
  tipo: string;
  banco_nome: string | null;
  banco_codigo: string | null;
  agencia: string | null;
  conta_numero: string | null;
  saldo_inicial: number;
  saldo_atual: number;
  ativo: boolean;
  empresa_id: string;
  permitir_multiplas_unidades: boolean;
  created_at: string;
}

interface Establishment {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  type: string;
}


const TIPOS = [
  { value: "corrente", label: "Conta Corrente" },
  { value: "poupanca", label: "Poupança" },
  { value: "caixa", label: "Caixa" },
  { value: "carteira", label: "Carteira" },
];

const tipoIcon = (tipo: string) => {
  switch (tipo) {
    case "corrente": return <Landmark className="h-4 w-4" />;
    case "poupanca": return <PiggyBank className="h-4 w-4" />;
    case "caixa": return <Building2 className="h-4 w-4" />;
    case "carteira": return <Wallet className="h-4 w-4" />;
    default: return <Landmark className="h-4 w-4" />;
  }
};

const tipoLabel = (tipo: string) => TIPOS.find(t => t.value === tipo)?.label ?? tipo;


const emptyForm = {
  nome: "",
  tipo: "corrente",
  banco_nome: "",
  banco_codigo: "",
  agencia: "",
  conta_numero: "",
  saldo_inicial: "0,00",
  empresa_id: "",
  permitir_multiplas_unidades: false,
  unidade_ids: [] as string[],
};

export default function AdminBankAccounts() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Statement (extrato) dialog state
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extratoAccount, setExtratoAccount] = useState<BankAccount | null>(null);


  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("ativo", { ascending: false })
      .order("nome");
    if (error) {
      toast.error("Erro ao carregar contas bancárias");
    } else {
      setAccounts((data as any[]) ?? []);
    }
    setLoading(false);
  }, []);

  const fetchEstablishments = useCallback(async () => {
    const { data } = await supabase
      .from("fiscal_establishments")
      .select("id, razao_social, nome_fantasia, type")
      .eq("active", true)
      .order("razao_social");
    setEstablishments(data ?? []);
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchEstablishments();
  }, [fetchAccounts, fetchEstablishments]);

  // Realtime subscription for bank_accounts balance updates
  useEffect(() => {
    const channel = supabase
      .channel("bank-accounts-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bank_accounts" },
        (payload) => {
          setAccounts(prev =>
            prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new as any } : a)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      empresa_id: establishments.length === 1 ? establishments[0].id : "",
    });
    setDialogOpen(true);
  };

  const openEdit = async (acc: BankAccount) => {
    setEditing(acc);
    // Fetch linked units
    let unitIds: string[] = [];
    if (acc.permitir_multiplas_unidades) {
      const { data } = await supabase
        .from("bank_account_units")
        .select("unidade_id")
        .eq("conta_bancaria_id", acc.id);
      unitIds = (data ?? []).map((d: any) => d.unidade_id);
    }
    setForm({
      nome: acc.nome,
      tipo: acc.tipo,
      banco_nome: acc.banco_nome ?? "",
      banco_codigo: acc.banco_codigo ?? "",
      agencia: acc.agencia ?? "",
      conta_numero: acc.conta_numero ?? "",
      saldo_inicial: formatCurrency(acc.saldo_inicial).replace("R$\u00a0", "").replace("R$ ", ""),
      empresa_id: acc.empresa_id,
      permitir_multiplas_unidades: acc.permitir_multiplas_unidades,
      unidade_ids: unitIds,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da conta"); return; }
    if (!form.empresa_id) { toast.error("Selecione a empresa"); return; }

    setSaving(true);
    const saldoInicial = unmaskCurrency(form.saldo_inicial);

    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      banco_nome: form.banco_nome.trim() || null,
      banco_codigo: form.banco_codigo.trim() || null,
      agencia: form.agencia.trim() || null,
      conta_numero: form.conta_numero.trim() || null,
      saldo_inicial: saldoInicial,
      empresa_id: form.empresa_id,
      permitir_multiplas_unidades: form.permitir_multiplas_unidades,
    };

    let accountId: string | null = null;

    if (editing) {
      const { error } = await supabase
        .from("bank_accounts")
        .update(payload as any)
        .eq("id", editing.id);
      if (error) {
        toast.error("Erro ao atualizar conta");
        setSaving(false);
        return;
      }
      accountId = editing.id;
      await supabase.rpc("recalc_bank_balance", { _conta_id: editing.id } as any);
    } else {
      const { data: inserted, error } = await supabase
        .from("bank_accounts")
        .insert({ ...payload, saldo_atual: saldoInicial } as any)
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Erro ao criar conta");
        setSaving(false);
        return;
      }
      accountId = inserted.id;
    }

    // Sync bank_account_units
    if (accountId) {
      await supabase.from("bank_account_units").delete().eq("conta_bancaria_id", accountId);

      // If global, link all establishments
      if (form.permitir_multiplas_unidades) {
        const rows = establishments.map(est => ({
          conta_bancaria_id: accountId!,
          unidade_id: est.id,
        }));
        await supabase.from("bank_account_units").insert(rows as any);
      }
    }

    toast.success(editing ? "Conta atualizada" : "Conta criada");
    setSaving(false);
    setDialogOpen(false);
    fetchAccounts();
  };

  const toggleAtivo = async (acc: BankAccount) => {
    const action = acc.ativo ? "inativar" : "reativar";
    const ok = await confirm(`Deseja ${action} a conta "${acc.nome}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("bank_accounts")
      .update({ ativo: !acc.ativo } as any)
      .eq("id", acc.id);
    if (error) toast.error("Erro ao alterar status");
    else {
      toast.success(`Conta ${acc.ativo ? "inativada" : "reativada"}`);
      fetchAccounts();
    }
  };

  // Statement (extrato) functions
  const openExtrato = (acc: BankAccount) => {
    setExtratoAccount(acc);
    setExtratoOpen(true);
  };


  const filtered = accounts.filter(a =>
    a.nome.toLowerCase().includes(search.toLowerCase()) ||
    (a.banco_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalSaldo = filtered.filter(a => a.ativo).reduce((s, a) => s + Number(a.saldo_atual), 0);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Contas Bancárias</h1>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Conta
          </Button>
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Total (contas ativas)</p>
              <p className={`text-2xl font-bold font-mono ${totalSaldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {formatCurrency(totalSaldo)}
              </p>
            </div>
            <Landmark className="h-8 w-8 text-muted-foreground/40" />
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(acc => (
              <Card key={acc.id} className={`relative ${!acc.ativo ? "opacity-50" : ""} border-l-4 ${acc.ativo ? (Number(acc.saldo_atual) >= 0 ? "border-l-emerald-500" : "border-l-destructive") : "border-l-muted-foreground"}`}>
                <CardContent className="p-3 flex flex-col gap-1.5">
                  {/* Header: name + status */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{acc.nome}</span>
                    <Badge variant={acc.ativo ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {acc.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>

                  {/* Type + Bank */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {tipoIcon(acc.tipo)}
                      <span>{tipoLabel(acc.tipo)}</span>
                    </div>
                    {acc.banco_nome && (
                      <>
                        <span>·</span>
                        <span>{acc.banco_nome}{acc.banco_codigo ? ` (${acc.banco_codigo})` : ""}</span>
                      </>
                    )}
                  </div>

                  {/* Agency / Account */}
                  {(acc.agencia || acc.conta_numero) && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Ag: {acc.agencia ?? "—"} / Conta: {acc.conta_numero ?? "—"}
                    </p>
                  )}

                  {/* Balances */}
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-border">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Saldo Inicial</p>
                      <p className="text-xs font-mono">{formatCurrency(acc.saldo_inicial)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Saldo Atual</p>
                      <p className={`text-sm font-mono font-bold ${Number(acc.saldo_atual) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {formatCurrency(Number(acc.saldo_atual))}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openExtrato(acc)} title="Extrato">
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(acc)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleAtivo(acc)} title={acc.ativo ? "Inativar" : "Reativar"}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Banco do Brasil" />
            </div>

            {/* Simplified: choose linked empresa OR mark as global */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="global-account"
                  checked={form.permitir_multiplas_unidades}
                  onCheckedChange={(checked) =>
                    setForm(f => ({
                      ...f,
                      permitir_multiplas_unidades: !!checked,
                      empresa_id: checked ? (establishments.find(e => e.type === "matriz")?.id || establishments[0]?.id || "") : f.empresa_id,
                    }))
                  }
                />
                <Label htmlFor="global-account" className="text-sm cursor-pointer">
                  Conta global (usada por matriz e filiais)
                </Label>
              </div>

                <div>
                  <Label>Empresa vinculada</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {establishments.find(e => e.type === "matriz")?.razao_social || "Sime Transporte Ltda"}
                  </p>
                </div>

              {form.permitir_multiplas_unidades && (
                <p className="text-xs text-muted-foreground">
                  Esta conta será compartilhada entre todas as unidades (matriz e filiais).
                </p>
              )}
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <Input value={form.banco_nome} onChange={e => setForm(f => ({ ...f, banco_nome: e.target.value }))} placeholder="Ex: Bradesco" />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={form.banco_codigo} onChange={e => setForm(f => ({ ...f, banco_codigo: e.target.value }))} placeholder="Ex: 237" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agência</Label>
                <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0001" />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={form.conta_numero} onChange={e => setForm(f => ({ ...f, conta_numero: e.target.value }))} placeholder="12345-6" />
              </div>
            </div>

            <div>
              <Label>Saldo Inicial</Label>
              <Input
                value={form.saldo_inicial}
                onChange={e => setForm(f => ({ ...f, saldo_inicial: maskCurrency(e.target.value) }))}
                className="font-mono"
                placeholder="0,00"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 pb-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BankStatementDialog open={extratoOpen} onOpenChange={setExtratoOpen} account={extratoAccount} />


      {ConfirmDialog}
    </AdminLayout>
  );
}
