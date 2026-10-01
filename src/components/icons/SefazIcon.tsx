import { LucideProps } from "lucide-react";

/**
 * Ícone estilo Lucide representando a SEFAZ: prédio público da Fazenda
 * (pedimento + colunas) com carimbo de autorização (check).
 */
export function SefazIcon({ size = 24, color = "currentColor", strokeWidth = 2, className, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* bandeira da Fazenda */}
      <path d="M12 4V1" />
      <path d="M12 1h5.5l-2 1.75 2 1.75H12" />
      {/* pedimento */}
      <path d="M2 10 12 4l10 6" />
      {/* colunas */}
      <path d="M4 18v-8M8 18v-8M12 18v-8M16 18v-8M20 18v-8" />
      {/* arquitrave e base */}
      <path d="M2 18h20" />
      <path d="M2 22h20" />
    </svg>
  );
}
