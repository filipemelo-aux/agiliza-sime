import { LucideProps } from "lucide-react";

/**
 * Ícone no padrão visual da SEFAZ / Portal Nacional do DF-e:
 * folha de documento fiscal com o selo circular verde-amarelo-azul.
 */
export function SefazIcon({ size = 24, className, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...(props as any)}
    >
      <path d="M5 2h10l4 4v16H5z" fill="#ffffff" stroke="#1f5e2e" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M15 2v4h4" fill="none" stroke="#1f5e2e" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 7h5M8 9.5h7" stroke="#1f5e2e" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="4.6" fill="#009c3b" />
      <path d="M12 12.6 16.2 16 12 19.4 7.8 16z" fill="#ffdf00" />
      <circle cx="12" cy="16" r="1.8" fill="#002776" />
    </svg>
  );
}
