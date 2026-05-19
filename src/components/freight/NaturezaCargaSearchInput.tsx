import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface NaturezaResult {
  produto_predominante: string;
  tipo: string | null;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function NaturezaCargaSearchInput({
  value,
  onChange,
  placeholder = "Buscar ou digitar natureza da carga...",
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NaturezaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setQuery(value);
  }, [value]);

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
        const { data, error } = await supabase
          .from("cargas")
          .select("produto_predominante, tipo")
          .ilike("produto_predominante", `%${q}%`)
          .eq("ativo", true)
          .order("produto_predominante", { ascending: true })
          .limit(10);

        if (error) throw error;

        // Deduplicar por produto_predominante
        const seen = new Set<string>();
        const deduped = ((data as any[]) || []).filter((item) => {
          if (seen.has(item.produto_predominante)) return false;
          seen.add(item.produto_predominante);
          return true;
        });

        setResults(deduped);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (item: NaturezaResult) => {
    setQuery(item.produto_predominante);
    onChange(item.produto_predominante);
    setShowDropdown(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    search(val);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item.produto_predominante}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0"
            >
              <div className="font-medium text-sm">{item.produto_predominante}</div>
              {item.tipo && (
                <div className="text-xs text-muted-foreground mt-0.5">{item.tipo}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg px-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma natureza encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Continue digitando para cadastrar uma nova</p>
        </div>
      )}
    </div>
  );
}
