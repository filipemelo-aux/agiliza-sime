import { useEffect, useState } from "react";
import { Minus, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "app-font-size";
const MIN = 12;
const MAX = 22;
const DEFAULT = 16;
const STEP = 1;

function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`;
}

export function FontSizeControl() {
  const [size, setSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT;
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored >= MIN && stored <= MAX ? stored : DEFAULT;
  });

  useEffect(() => {
    applyFontSize(size);
    localStorage.setItem(STORAGE_KEY, String(size));
  }, [size]);

  const dec = () => setSize((s) => Math.max(MIN, s - STEP));
  const inc = () => setSize((s) => Math.min(MAX, s + STEP));
  const reset = () => setSize(DEFAULT);

  return (
    <div className="hidden md:flex items-center gap-0.5 rounded-md border border-border bg-background/50 px-1 h-8">
      <Button
        variant="ghost"
        size="icon"
        onClick={dec}
        disabled={size <= MIN}
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title="Diminuir fonte"
      >
        <Minus className="w-3 h-3" />
      </Button>
      <button
        onClick={reset}
        className="flex items-center gap-1 px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground tabular-nums"
        title="Restaurar tamanho padrão"
      >
        <Type className="w-3 h-3" />
        {size}
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={inc}
        disabled={size >= MAX}
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title="Aumentar fonte"
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}
