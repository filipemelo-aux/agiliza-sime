// Marca do produto: "Agiliza TMS by FSM Sistemas", idêntica à exibida na tela de login.

import agilizaLogo from "@/assets/brand/agiliza-tms-logo.png";
import fsmLogo from "@/assets/brand/fsm-systems-logo-horizontal.png";

type Props = { size?: "lg" | "sm"; className?: string };

export function AgilizaBrandMark({ size = "lg", className = "" }: Props) {
  const big = size === "lg";
  return (
    <div className={`flex flex-col items-center ${className}`.trim()}>
      <img
        src={agilizaLogo}
        alt="Agiliza TMS"
        width={1142}
        height={202}
        className={big ? "mb-4 h-auto w-full max-w-sm object-contain" : "mb-1.5 h-8 w-auto object-contain"}
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">by</span>
        <img src={fsmLogo} alt="FSM Sistemas" className={big ? "h-5 w-auto object-contain" : "h-4 w-auto object-contain"} />
      </div>
    </div>
  );
}
