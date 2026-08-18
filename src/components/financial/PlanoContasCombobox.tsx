import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Check, ChevronsUpDown, FolderTree, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlanoContaOption {
  id: string;
  codigo: string;
  nome: string;
  tipo?: string;
  conta_pai_id?: string | null;
  tipo_operacional?: string | null;
}

export const SEM_CLASSIFICACAO_VALUE = "sem_classificacao";

interface PlanoContasComboboxProps {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: PlanoContaOption[];
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  /** Inclui opção "Todas as contas" no topo (uso em filtros) */
  includeAll?: boolean;
  allLabel?: string;
  allValue?: string;
  /** Inclui opção "⚠️ Sem Classificação / Em Branco" (uso em filtros) */
  includeSemClassificacao?: boolean;
  semClassificacaoLabel?: string;
  /** Limita opções exibidas (default: 200) */
  maxResults?: number;
  /** Habilita botão "+" para criar conta diretamente */
  allowCreate?: boolean;
  /** Tipo padrão ao criar nova conta */
  defaultTipo?: "receita" | "despesa";
  /** Callback após criação - útil para parent atualizar lista */
  onCreated?: (option: PlanoContaOption) => void;
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function PlanoContasCombobox({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Buscar conta contábil...",
  size = "md",
  className,
  includeAll = false,
  allLabel = "Todas as contas",
  allValue = "all",
  includeSemClassificacao = false,
  semClassificacaoLabel = "⚠️ Sem Classificação / Em Branco",
  maxResults = 200,
  allowCreate = true,
  defaultTipo = "despesa",
  onCreated,
}: PlanoContasComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [extras, setExtras] = useState<PlanoContaOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [hierarchy, setHierarchy] = useState<Record<string, { nome: string; codigo: string; conta_pai_id: string | null }>>({});

  // Carrega hierarquia completa (para exibir contas pai mesmo quando as options são só folhas)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, codigo, nome, conta_pai_id")
        .eq("ativo", true);
      if (cancelled || !data) return;
      const map: Record<string, { nome: string; codigo: string; conta_pai_id: string | null }> = {};
      for (const a of data as any[]) map[a.id] = { nome: a.nome, codigo: a.codigo, conta_pai_id: a.conta_pai_id };
      setHierarchy(map);
    })();
    return () => { cancelled = true; };
  }, []);

  const reloadFromDb = useCallback(async () => {
    const tipos = [...new Set(options.map((o) => o.tipo).filter(Boolean))];
    let query = supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional")
      .eq("ativo", true)
      .order("codigo");
    if (tipos.length === 1) {
      query = query.eq("tipo", tipos[0]);
    }
    const { data } = await query;
    const fetched = (data as PlanoContaOption[]) || [];
    const seen = new Set(options.map((o) => o.id));
    setExtras((prev) => {
      const prevIds = new Set(prev.map((p) => p.id));
      const fresh = fetched.filter((f) => !seen.has(f.id) && !prevIds.has(f.id));
      return [...prev, ...fresh];
    });
  }, [options]);

  const merged = useMemo(() => {
    const seen = new Set(options.map((o) => o.id));
    return [...options, ...extras.filter((e) => !seen.has(e.id))];
  }, [options, extras]);

  // Caminho das contas pai: "2 Despesas › 2.1 Operacionais"
  const parentPathOf = useCallback(
    (o: PlanoContaOption) => {
      const source: Record<string, { nome: string; codigo: string; conta_pai_id: string | null }> = { ...hierarchy };
      for (const m of merged) {
        if (!source[m.id]) source[m.id] = { nome: m.nome, codigo: m.codigo, conta_pai_id: m.conta_pai_id ?? null };
      }
      const chain: string[] = [];
      let pid = o.conta_pai_id ?? source[o.id]?.conta_pai_id ?? null;
      let guard = 0;
      while (pid && guard++ < 10) {
        const p = source[pid];
        if (!p) break;
        chain.unshift(p.nome);
        pid = p.conta_pai_id;
      }
      return chain.join(" › ");
    },
    [hierarchy, merged]
  );

  const sorted = useMemo(
    () => [...merged].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [merged]
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const list = !q
      ? sorted
      : sorted.filter((o) => normalize(`${o.codigo} ${o.nome} ${parentPathOf(o)}`).includes(q));
    return list.slice(0, maxResults);
  }, [sorted, search, maxResults, parentPathOf]);

  const selected =
    value && value !== allValue && value !== SEM_CLASSIFICACAO_VALUE
      ? merged.find((o) => o.id === value)
      : null;
  const isSemClassificacao = value === SEM_CLASSIFICACAO_VALUE;

  const heightCls = size === "sm" ? "h-8 text-xs px-2" : "h-9 text-sm";
  const itemTextCls = size === "sm" ? "text-xs" : "text-sm";


  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", heightCls)}
          >
            {selected ? (
              <span className="truncate text-left">
                <span className="font-mono text-[10px] mr-1 text-muted-foreground">{selected.codigo}</span>
                {selected.nome}
              </span>
            ) : isSemClassificacao ? (
              <span className="truncate text-left text-amber-600">{semClassificacaoLabel}</span>
            ) : includeAll && (value === allValue || !value) ? (
              <span className="flex items-center gap-1 text-left">
                <FolderTree className="h-3 w-3 text-muted-foreground" />
                {allLabel}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          avoidCollisions
        >

          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                placeholder="Digite código ou nome..."
                className="h-9 pr-9"
                value={search}
                onValueChange={setSearch}
              />
              {allowCreate && !disabled && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); setCreateOpen(true); }}
                  title={search ? `Criar "${search}"` : "Criar nova conta"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <CommandList className="max-h-[320px]">
              {filtered.length === 0 ? (
                <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {includeAll && (
                    <CommandItem
                      value={allValue}
                      onSelect={() => { onChange(allValue); setOpen(false); setSearch(""); }}
                      className={itemTextCls}
                    >
                      <Check className={cn("mr-2 h-3 w-3", value === allValue || !value ? "opacity-100" : "opacity-0")} />
                      <FolderTree className="h-3 w-3 mr-2 text-muted-foreground" />
                      {allLabel}
                    </CommandItem>
                  )}
                  {includeSemClassificacao && (
                    <CommandItem
                      value={SEM_CLASSIFICACAO_VALUE}
                      onSelect={() => { onChange(SEM_CLASSIFICACAO_VALUE); setOpen(false); setSearch(""); }}
                      className={cn(itemTextCls, "text-amber-600")}
                    >
                      <Check className={cn("mr-2 h-3 w-3", isSemClassificacao ? "opacity-100" : "opacity-0")} />
                      {semClassificacaoLabel}
                    </CommandItem>
                  )}
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => { onChange(o.id); setOpen(false); setSearch(""); }}
                      className={itemTextCls}
                    >
                      <Check className={cn("mr-2 h-3 w-3", value === o.id ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono text-[10px] mr-2 text-muted-foreground">{o.codigo}</span>
                      <span className="truncate">{o.nome}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>

        </PopoverContent>
      </Popover>


      <CreatePlanoContaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTipo={defaultTipo}
        defaultNome={search}
        existingOptions={merged}
        onCreated={(opt) => {
          setExtras((prev) => [...prev, opt]);
          onChange(opt.id);
          onCreated?.(opt);
          reloadFromDb();
        }}
      />
    </div>
  );
}


function CreatePlanoContaDialog({
  open,
  onOpenChange,
  defaultTipo,
  defaultNome,
  existingOptions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTipo: "receita" | "despesa";
  defaultNome: string;
  existingOptions: PlanoContaOption[];
  onCreated: (opt: PlanoContaOption) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receita" | "despesa">(defaultTipo);
  const [contaPaiId, setContaPaiId] = useState<string>("none");
  const [ativo, setAtivo] = useState(true);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [establishments, setEstablishments] = useState<{ id: string; razao_social: string; type?: string }[]>([]);
  const [allAccounts, setAllAccounts] = useState<Array<{ id: string; codigo: string; nome: string; tipo: string; empresa_id: string; nivel: number }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(defaultNome || "");
    setCodigo("");
    setTipo(defaultTipo);
    setContaPaiId("none");
    setAtivo(true);

    (async () => {
      const [estRes, accRes] = await Promise.all([
        supabase.from("fiscal_establishments").select("id, razao_social, type").eq("active", true).order("razao_social"),
        supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, empresa_id, nivel").eq("ativo", true).order("codigo"),
      ]);
      const list = estRes.data || [];
      setEstablishments(list);
      const matriz = list.find((e: any) => e.type === "matriz") || list[0];
      if (matriz) setEmpresaId(matriz.id);
      setAllAccounts((accRes.data as any) || []);
    })();
  }, [open, defaultNome, defaultTipo]);

  const parentOptions = useMemo(
    () => allAccounts.filter((o) => o.tipo === tipo && (!empresaId || o.empresa_id === empresaId)),
    [allAccounts, tipo, empresaId]
  );

  const handleSave = async () => {
    if (!codigo.trim()) return toast.error("Informe o código da conta");
    if (!nome.trim()) return toast.error("Informe o nome da conta");
    if (!empresaId) return toast.error("Empresa não disponível");

    const parent = contaPaiId !== "none" ? allAccounts.find((o) => o.id === contaPaiId) : null;
    const nivel = parent ? (parent.nivel || 1) + 1 : 1;



    setSaving(true);
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .insert({
        codigo: codigo.trim(),
        nome: nome.trim(),
        tipo,
        conta_pai_id: parent?.id || null,
        nivel,
        ativo,
        empresa_id: empresaId,
        tipo_operacional: null,
      } as any)
      .select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional")
      .single();
    setSaving(false);

    if (error) {
      if (error.message.includes("unique")) return toast.error("Código já existe para esta empresa");
      return toast.error(error.message);
    }
    toast.success("Conta criada");
    onCreated(data as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conta Contábil</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Código</Label>
              <Input className="h-9" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="1.1.01" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Nome</Label>
              <Input className="h-9" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Combustível" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Conta Pai</Label>
              <Select value={contaPaiId} onValueChange={setContaPaiId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (raiz)</SelectItem>
                  {parentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs mr-2">{a.codigo}</span>{a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {establishments.length > 1 && (
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select value={empresaId} onValueChange={setEmpresaId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {establishments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label className="text-xs">Conta ativa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
