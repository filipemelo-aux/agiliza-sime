import { useState, useEffect, useRef, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, maskCPF } from "@/lib/masks";
import { personDisplayName, personSecondaryName } from "@/lib/personName";

interface PersonResult {
  id: string;
  user_id: string;
  full_name: string;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  category: string;
  person_type: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  inscricao_estadual: string | null;
}

interface PersonSearchInputProps {
  /** Which categories to search. Default: all except motorista */
  categories?: string[];
  placeholder?: string;
  onSelect: (person: PersonResult) => void;
  onClear?: () => void;
  /** Currently selected person name (controlled) */
  selectedName?: string;
  /** Optional action element rendered inside the input (e.g. a "new" button) */
  endAction?: ReactNode;
}

const CATEGORY_LABELS: Record<string, string> = {
  motorista: "Motorista",
  cliente: "Cliente",
  proprietario: "Proprietário",
  fornecedor: "Fornecedor",
  colaborador: "Colaborador",
  banco: "Banco",
};

const CATEGORY_COLORS: Record<string, string> = {
  motorista: "bg-blue-500/10 text-blue-500",
  cliente: "bg-amber-500/10 text-amber-500",
  proprietario: "bg-emerald-500/10 text-emerald-500",
  fornecedor: "bg-purple-500/10 text-purple-500",
  colaborador: "bg-cyan-500/10 text-cyan-500",
  banco: "bg-rose-500/10 text-rose-500",
};
/**
 * Documento da pessoa (armazenado no campo `cnpj` dos perfis, que também recebe CPF).
 * Retorna rótulo + valor formatado para exibição nas buscas.
 */
export function personDocInfo(p: { cnpj?: string | null } | null | undefined) {
  const digits = (p?.cnpj || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length <= 11
    ? { label: "CPF", value: maskCPF(digits) }
    : { label: "CNPJ", value: maskCNPJ(digits) };
}

export function PersonSearchInput({
  categories = ["cliente", "proprietario", "fornecedor"],
  placeholder = "Buscar pessoa cadastrada...",
  onSelect,
  onClear,
  selectedName,
  endAction,
}: PersonSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<string | null>(selectedName || null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSelected(selectedName || null);
  }, [selectedName]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const includeOwners = categories.includes("proprietario");
        const catList = categories.join(",");
        // Cobre categoria principal, flag de proprietário e categorias adicionais (array overlap).
        const orParts: string[] = [`category.in.(${catList})`, `categories_extra.ov.{${catList}}`];
        if (includeOwners) orParts.push(`is_owner.eq.true`);
        const query = supabase
          .from("profiles")
          .select("id, user_id, full_name, cnpj, razao_social, nome_fantasia, category, person_type, address_street, address_number, address_neighborhood, address_city, address_state, inscricao_estadual, is_owner")
          .or(orParts.join(","));
        const digits = q.replace(/\D/g, "");
        const matchParts = [
          `full_name.ilike.%${q}%`,
          `razao_social.ilike.%${q}%`,
          `nome_fantasia.ilike.%${q}%`,
          `cnpj.ilike.%${q}%`,
        ];
        // Permite buscar digitando o documento com máscara (05.050.995/0001-19).
        if (digits.length >= 2 && digits !== q) matchParts.push(`cnpj.ilike.%${digits}%`);
        const { data } = await query
          .or(matchParts.join(","))
          .order("full_name")
          .limit(10);
        setResults(data || []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (person: PersonResult) => {
    setSelected(personDisplayName(person));
    const doc = personDocInfo(person);
    setSelectedDoc(doc ? `${doc.label} ${doc.value}` : null);
    setQuery("");
    setShowDropdown(false);
    onSelect(person);
  };

  const handleClear = () => {
    setSelected(null);
    setSelectedDoc(null);
    setQuery("");
    setResults([]);
    onClear?.();
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-muted/30 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium break-words whitespace-normal">{selected}</div>
          {selectedDoc && (
            <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{selectedDoc}</div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className={`pl-8 ${endAction ? "pr-16" : ""}`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!loading && endAction}
        </div>
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto overflow-x-hidden">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelect(person)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0 min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm break-words whitespace-normal min-w-0 flex-1">{personDisplayName(person)}</span>
                <Badge className={`text-[10px] shrink-0 ${CATEGORY_COLORS[person.category] || ""}`}>
                  {CATEGORY_LABELS[person.category] || person.category}
                </Badge>
              </div>
              {(() => {
                const doc = personDocInfo(person);
                return doc ? (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground/90">
                      {doc.label}: {doc.value}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-destructive/80">Sem documento cadastrado</div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mt-1 min-w-0">
                {personSecondaryName(person) && <span className="break-words">{personSecondaryName(person)}</span>}
                {person.address_city && person.address_state && (
                  <span className={personSecondaryName(person) ? "before:content-['•'] before:mr-1" : ""}>
                    {person.address_city}/{person.address_state}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg px-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma pessoa encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Preencha manualmente ou cadastre em Cadastros</p>
        </div>
      )}
    </div>
  );
}
