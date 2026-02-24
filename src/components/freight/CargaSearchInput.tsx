import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CargaResult {
  id: string;
  produto_predominante: string;
  peso_bruto: number;
  valor_carga: number;
  unidade: string;
  remetente_nome: string | null;
  destinatario_nome: string | null;
  uf_origem: string | null;
  uf_destino: string | null;
  municipio_origem_nome: string | null;
  municipio_destino_nome: string | null;
  valor_carga_averb: number | null;
  chaves_nfe_ref: string[] | null;
}

interface CargaSearchInputProps {
  placeholder?: string;
  onSelect: (carga: CargaResult) => void;
  onClear?: () => void;
  selectedName?: string;
}

export function CargaSearchInput({
  placeholder = "Buscar carga cadastrada...",
  onSelect,
  onClear,
  selectedName,
}: CargaSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CargaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<string | null>(selectedName || null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setSelected(selectedName || null); }, [selectedName]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("cargas")
          .select("id, produto_predominante, peso_bruto, valor_carga, unidade, remetente_nome, destinatario_nome, uf_origem, uf_destino, municipio_origem_nome, municipio_destino_nome, valor_carga_averb, chaves_nfe_ref")
          .or(`produto_predominante.ilike.%${q}%,remetente_nome.ilike.%${q}%,destinatario_nome.ilike.%${q}%`)
          .order("created_at", { ascending: false })
          .limit(10);
        setResults((data as any[]) || []);
        setShowDropdown(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const handleSelect = (carga: CargaResult) => {
    setSelected(carga.produto_predominante);
    setQuery("");
    setShowDropdown(false);
    onSelect(carga);
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
        <button type="button" onClick={handleClear} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
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
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className="pl-8"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((carga) => (
            <button
              key={carga.id}
              type="button"
              onClick={() => handleSelect(carga)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{carga.produto_predominante}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {Number(carga.peso_bruto).toLocaleString("pt-BR")} {carga.unidade}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {carga.remetente_nome && <span>{carga.remetente_nome}</span>}
                {carga.destinatario_nome && <span>→ {carga.destinatario_nome}</span>}
                {carga.uf_origem && carga.uf_destino && (
                  <span>• {carga.uf_origem}→{carga.uf_destino}</span>
                )}
                <span>• {Number(carga.valor_carga).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg px-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma carga encontrada</p>
        </div>
      )}
    </div>
  );
}
