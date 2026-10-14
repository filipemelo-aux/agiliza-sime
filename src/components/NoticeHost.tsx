import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { dismissErrorNotice, subscribeErrorNotices, type NoticeItem } from "@/lib/notice";

/**
 * Exibe os erros do sistema como avisos no centro da tela, um por vez,
 * com botão de fechar no canto superior direito. Não fecha automaticamente.
 */
export function NoticeHost() {
  const [items, setItems] = useState<NoticeItem[]>([]);

  useEffect(() => subscribeErrorNotices(setItems), []);

  const current = items[0];
  if (!current) return null;
  const pending = items.length - 1;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={() => dismissErrorNotice(current.id)}
    >
      <div
        role="alertdialog"
        aria-label="Aviso do sistema"
        className="w-full max-w-md rounded-lg border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <h2 className="min-w-0 flex-1 break-words text-sm font-semibold leading-5">
            {current.title}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => dismissErrorNotice(current.id)}
            className="-mr-1 -mt-1 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {current.description ? (
          <p className="whitespace-pre-wrap px-4 pb-4 pt-2 text-xs leading-5 text-muted-foreground">
            {current.description}
          </p>
        ) : (
          <div className="pb-3" />
        )}
        {pending > 0 && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            + {pending} aviso{pending > 1 ? "s" : ""} na fila
          </div>
        )}
      </div>
    </div>
  );
}
