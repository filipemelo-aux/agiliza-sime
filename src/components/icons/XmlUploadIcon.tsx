import { type SVGProps } from "react";

/**
 * Ícone de XML (o mesmo do menu SEFAZ — "Baixar XML autorizado") com uma seta
 * para cima indicando upload. Os sinais de código são deslocados um pouco para a
 * esquerda para que a seta tenha espaço próprio dentro do documento, sem que
 * nenhum traço encoste no outro.
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
      <path d="m4 12-3 3 3 3" />
      <path d="m8 18 3-3-3-3" />
      {/* seta para cima (enviar) */}
      <path d="M15.5 17V11" />
      <path d="m13.5 13 2-2 2 2" />
    </svg>
  );
}
