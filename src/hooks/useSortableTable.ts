import { useMemo, useState, useCallback } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/**
 * Hook genérico para ordenação de tabelas com cabeçalhos clicáveis.
 * - Clique em uma coluna inverte a direção quando já está ativa.
 * - Clique em outra coluna ativa-a iniciando em "desc" (padrão para listagens com datas/números).
 */
export function useSortableTable<T, K extends string>(
  data: T[],
  initial: SortState<K>,
  accessors: Record<K, (row: T) => unknown>,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback((key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" },
    );
  }, []);

  const sorted = useMemo(() => {
    const acc = accessors[sort.key];
    if (!acc) return data;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return -1 * dir;
      if (as > bs) return 1 * dir;
      return 0;
    });
  }, [data, sort, accessors]);

  return { sort, toggle, sorted };
}
