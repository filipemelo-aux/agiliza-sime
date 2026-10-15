import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

export function PasswordRequirements({ password, className }: { password: string; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]", className)}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.key} className={cn("flex items-center gap-1", ok ? "text-success" : "text-muted-foreground")}>
            {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
