import { LucideProps } from "lucide-react";
import receitaIcon from "@/assets/receita.svg.asset.json";

/** Ícone oficial já utilizado pela Sime para as operações fiscais. */
export function SefazIcon({ size = 24, className }: LucideProps) {
  return (
    <img
      src={receitaIcon.url}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
