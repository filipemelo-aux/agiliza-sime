import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ } from "@/lib/masks";

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
}

const CATEGORY_LABELS: Record<string, string> = {
  motorista: "Motorista",
  cliente: "Cliente",
  proprietario: "Proprietário",
  fornecedor: "Fornecedor",
};

const CATEGORY_COLORS: Record<string, string> = {
  motorista: "bg-blue-500/10 text-blue-500",
  cliente: "bg-amber-500/10 text-amber-500",
  proprietario: "bg-emerald-500/10 text-emerald-500",
  fornecedor: "bg-purple-500/10 text-purple-500",
};

export function PersonSearchInput({
  categories = ["cliente", "proprietario", "fornecedor"],
  placeholder = "Buscar pessoa cadastrada...",
  onSelect,
  onClear,
  selectedName,
}: PersonSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<string | null>(selectedName || null);
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
        const { data } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, cnpj, razao_social, nome_fantasia, category, person_type, address_street, address_number, address_neighborhood, address_city, address_state, inscricao_estadual")
          .in("category", categories)
          .or(`full_name.ilike.%${q}%,razao_social.ilike.%${q}%,cnpj.ilike.%${q}%,nome_fantasia.ilike.%${q}%`)
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
    setSelected(person.full_name);
    setQuery("");
    setShowDropdown(false);
    onSelect(person);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    onClear?.();
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-muted/30">
        <span className="text-sm font-medium truncate flex-1">{selected}</span>
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
    <div ref={wrapperRef} className="relative">
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
          className="pl-8"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelect(person)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{person.full_name}</span>
                <Badge className={`text-[10px] shrink-0 ${CATEGORY_COLORS[person.category] || ""}`}>
                  {CATEGORY_LABELS[person.category] || person.category}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {person.cnpj && <span>{maskCNPJ(person.cnpj)}</span>}
                {person.razao_social && <span>• {person.razao_social}</span>}
                {person.address_city && person.address_state && (
                  <span>• {person.address_city}/{person.address_state}</span>
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
