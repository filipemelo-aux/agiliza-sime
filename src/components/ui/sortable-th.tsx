import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useSortableTable";

interface SortableThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  active: boolean;
  direction: SortDirection;
  align?: "left" | "right" | "center";
  onSort: () => void;
}

export function SortableTh({
  active,
  direction,
  align = "left",
  onSort,
  className,
  children,
  ...rest
}: SortableThProps) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      {...rest}
      className={cn(
        "select-none cursor-pointer hover:text-foreground transition-colors",
        active && "text-foreground",
        className,
      )}
      onClick={onSort}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "justify-end w-full",
          align === "center" && "justify-center w-full",
        )}
      >
        {children}
        <Icon className={cn("w-3 h-3", active ? "opacity-80" : "opacity-40")} />
      </span>
    </th>
  );
}
