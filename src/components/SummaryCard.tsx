import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type ValueColor = "default" | "green" | "red" | "primary" | "muted";

interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  valueColor?: ValueColor;
  className?: string;
}

const colorMap: Record<ValueColor, string> = {
  default: "text-foreground",
  green: "text-green-600",
  red: "text-destructive",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

export function SummaryCard({ icon: Icon, label, value, valueColor = "default", className }: SummaryCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-3.5 flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground/70 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
          <p className={cn("text-base font-bold truncate leading-snug", colorMap[valueColor])}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
