import { LucideProps } from "lucide-react";
import mdfeIcon from "@/assets/mdfe.svg.asset.json";

/** Ícone oficial já utilizado pela Sime para o manifesto (MDF-e). */
export function MdfeIcon({ size = 24, className }: LucideProps) {
  return (
    <img
      src={mdfeIcon.url}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
