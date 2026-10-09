import { type SVGProps } from "react";

/**
 * Ícone de XML (o mesmo do menu SEFAZ — "Baixar XML autorizado") com uma seta
 * para cima indicando upload. Desenhado como um único SVG para que a espessura
 * dos traços e o tamanho acompanhem a mesma classe usada nos demais botões.
 */
export function XmlUploadIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* documento */}
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {/* marcação de XML */}
      <path d="m5 12-3 3 3 3" />
      <path d="m9 18 3-3-3-3" />
      {/* seta para cima (enviar) */}
      <path d="M16.5 21v-8" />
      <path d="m13.5 16 3-3 3 3" />
    </svg>
  );
}
