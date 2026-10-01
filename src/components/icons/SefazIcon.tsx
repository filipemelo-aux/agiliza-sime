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
      {/* mastro e bandeira da Fazenda */}
      <path d="M12 5V2" />
      <path d="M12 2h6l-2 2 2 2h-6" />
      {/* pedimento */}
      <path d="M3 12 12 5l9 7" />
      {/* colunas */}
      <path d="M4 18v-6M8 18v-6M16 18v-6M20 18v-6" />
      {/* base */}
      <path d="M2 22h20" />
      {/* carimbo de autorização */}
      <path d="M9.5 14.5l2 2 3.5-3.5" />
    </svg>
  );
}
