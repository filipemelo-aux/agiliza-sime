import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Settings2, ArrowRight } from "lucide-react";
import { listSystemPages } from "@/components/AdminLayout";
import { usePageAccess } from "@/hooks/usePageAccess";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const DEFAULTS = ["/admin/freight/cte", "/admin/financial/payables", "/admin/fuel-orders", "/admin/fuelings"];

/** Atalhos de páginas escolhidos pelo usuário; só oferece páginas liberadas para ele. */
export function PageShortcuts() {
  const { user } = useAuth();
  const { getRule } = usePageAccess();
  const key = `page-shortcuts:${user?.id ?? "anon"}`;
  const available = useMemo(
    () => listSystemPages().filter((p) => p.url && p.url !== "/admin" && getRule(p.url).mode === "active"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getRule],
  );
  const [chosen, setChosen] = useState<string[] | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(key); setChosen(v ? JSON.parse(v) : null); } catch { setChosen(null); }
  }, [key]);
  const save = (list: string[]) => { setChosen(list); localStorage.setItem(key, JSON.stringify(list)); };
  const selected = (chosen ?? DEFAULTS).filter((u) => available.some((p) => p.url === u));
  const pages = selected.map((u) => available.find((p) => p.url === u)!);
  const toggle = (u: string) => save(selected.includes(u) ? selected.filter((x) => x !== u) : [...selected, u]);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1.5 ml-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Acesso às Páginas</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"><Settings2 className="h-3.5 w-3.5" /> Escolher páginas</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
              {available.map((p) => (
                <label key={p.url} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent cursor-pointer">
                  <Checkbox checked={selected.includes(p.url)} onCheckedChange={() => toggle(p.url)} />
                  <span className="flex-1">{p.title}</span>
                  <span className="text-[10px] text-muted-foreground">{p.group}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {pages.length === 0 ? (
        <p className="text-xs text-muted-foreground ml-1">Nenhuma página escolhida. Use “Escolher páginas”.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {pages.map((p) => (
            <Link key={p.url} to={p.url} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 bg-primary text-primary-foreground shadow-md hover:bg-accent hover:text-accent-foreground transition-colors">
              <span className="min-w-0">
                <span className="block text-xs font-semibold truncate">{p.title}</span>
                <span className="block text-[10px] opacity-75 truncate">{p.group}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
