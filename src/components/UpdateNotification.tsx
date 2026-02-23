import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/useVersionCheck";

export function UpdateNotification() {
  const { newVersion, showUpdate, applyUpdate, dismissUpdate } = useVersionCheck();

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-5 py-3 flex items-center gap-3 max-w-md">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin" style={{ animationDuration: "3s" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Nova versão disponível! (v{newVersion})</p>
          <p className="text-xs opacity-80">Clique para atualizar o sistema.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={dismissUpdate}
          >
            Depois
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            onClick={applyUpdate}
          >
            Atualizar
          </Button>
        </div>
      </div>
    </div>
  );
}
