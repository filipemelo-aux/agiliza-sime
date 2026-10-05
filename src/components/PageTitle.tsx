import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Título da página exibido no cabeçalho superior do layout (padrão único). */
export function PageTitle({ children }: { children: React.ReactNode; className?: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("page-title-slot"));
  }, []);
  if (!slot) return null;
  return createPortal(
    <h1 className="text-sm font-normal text-muted-foreground truncate">{children}</h1>,
    slot,
  );
}
