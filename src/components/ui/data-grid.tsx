import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DataGridColumn<T> {
  key: string;
  header: string;
  /** conteúdo da célula */
  cell: (row: T) => React.ReactNode;
  /** valor usado na ordenação (se omitido, coluna não ordena) */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
  width?: string;
  align?: "left" | "right" | "center";
}

function DescriptionCell({ children, fullText }: { children: React.ReactNode; fullText: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => setTruncated(element.scrollWidth > element.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  const content = <div ref={ref} className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{children}</div>;
  if (!truncated || !fullText) return content;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-lg whitespace-normal text-xs leading-relaxed">
        {fullText}
      </TooltipContent>
    </Tooltip>
  );
}

interface DataGridProps<T> {
  rows: T[];
  columns: DataGridColumn<T>[];
  rowId: (row: T) => string;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  /** ids não selecionáveis */
  isSelectable?: (row: T) => boolean;
  loading?: boolean;
  emptyMessage?: string;
  minWidth?: number;
  footer?: React.ReactNode;
  rowClassName?: (row: T) => string;
  maxHeight?: string;
}

export function DataGrid<T>({
  rows,
  columns,
  rowId,
  selected,
  onSelectedChange,
  isSelectable,
  loading,
  emptyMessage = "Nenhum registro encontrado",
  minWidth = 900,
  footer,
  rowClassName,
  maxHeight,
}: DataGridProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const selectableRows = useMemo(
    () => rows.filter((r) => (isSelectable ? isSelectable(r) : true)),
    [rows, isSelectable]
  );

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue?.(a);
      const bv = col.sortValue?.(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true }) * dir;
    });
  }, [rows, columns, sortKey, sortDir]);

  const toggleSort = (col: DataGridColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectedChange(next);
  };

  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selected.has(rowId(r)));

  const toggleAll = () => {
    if (allSelected) {
      onSelectedChange(new Set());
    } else {
      onSelectedChange(new Set(selectableRows.map(rowId)));
    }
  };

  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="min-w-0 rounded-lg border border-border bg-card [&_td_.truncate]:max-w-full">
      <div className="overflow-x-auto xl:overflow-x-hidden" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
        <table
          className="data-grid-table w-full table-auto border-collapse text-xs"
          style={{ "--data-grid-min-width": `${minWidth}px` } as React.CSSProperties}
        >
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border">
              <th className="w-10 min-w-[40px] max-w-[40px] md:w-8 md:min-w-[32px] md:max-w-[32px] px-1.5 py-2 md:py-1.5 bg-muted">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              {columns.map((col, ci) => (
                <th
                  key={col.key}
                  data-column-key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => toggleSort(col)}
                  className={cn(
                    "px-2 py-2 md:py-1.5 font-semibold text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap",
                    
                    alignCls(col.align),
                    col.sortValue && "cursor-pointer select-none hover:text-foreground",
                    col.headerClassName
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortValue &&
                      (sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const id = rowId(row);
                const selectable = isSelectable ? isSelectable(row) : true;
                const isSel = selected.has(id);
                return (
                  <tr
                    key={id}
                    onClick={() => selectable && toggleRow(id)}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      selectable ? "cursor-pointer hover:bg-muted/40" : "opacity-70",
                      isSel && "bg-primary/10 hover:bg-primary/15 ring-1 ring-inset ring-primary/30",
                      rowClassName?.(row)
                    )}
                  >
                    <td
                      className="relative w-10 min-w-[40px] max-w-[40px] md:w-8 md:min-w-[32px] md:max-w-[32px] px-1.5 py-2.5 md:py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0",
                          rowClassName?.(row),
                          isSel && "bg-primary/10"
                        )}
                      />
                      {selectable && (
                        <Checkbox checked={isSel} onCheckedChange={() => toggleRow(id)} />
                      )}
                    </td>
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        data-column-key={col.key}
                        className={cn(
                          "overflow-hidden px-2 py-2.5 md:py-1 align-middle",
                          alignCls(col.align),
                          ci === 0 && "relative",
                          col.className
                        )}
                      >
                        {ci === 0 && (
                          <span
                            aria-hidden
                            className={cn(
                              "pointer-events-none absolute inset-0",
                              rowClassName?.(row),
                              isSel && "bg-primary/10"
                            )}
                          />
                        )}
                        <span className={cn("block min-w-0 w-full", ci === 0 && "relative")}>
                          {col.key === "descricao" || col.key === "description" ? (
                            <DescriptionCell fullText={String(col.sortValue?.(row) ?? "")}>{col.cell(row)}</DescriptionCell>
                          ) : col.cell(row)}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {footer && (
            <tfoot className="sticky bottom-0 bg-muted/60">
              <tr>
                <td colSpan={columns.length + 1} className="px-2 py-1.5">
                  {footer}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
