import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { dismissErrorNotice, subscribeErrorNotices, type NoticeItem, type NoticeKind } from "@/lib/notice";

/**
 * Exibe os avisos do sistema no centro da tela, um por vez, com botão de fechar
 * no canto superior direito.
 *
 * Mensagens positivas (sucesso) e informativas fecham sozinhas; erros e
 * alertas permanecem abertos até o usuário fechar.
 */
function autoCloseMs(kind: NoticeKind | undefined): number | undefined {
  if (kind === "success") return 4000;
  if (kind === "info") return 5000;
  return undefined;
}

export function NoticeHost() {
  const [items, setItems] = useState<NoticeItem[]>([]);

  useEffect(() => subscribeErrorNotices(setItems), []);
  const ref = useRef<HTMLDivElement>(null);
  // Impede que janelas abertas por baixo (que bloqueiam cliques fora delas) capturem o clique no aviso.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    el.addEventListener("focusin", stop);
    return () => { el.removeEventListener("pointerdown", stop); el.removeEventListener("focusin", stop); };
  });

  const currentId = items[0]?.id;
  const currentKind = items[0]?.kind;
  const currentAutoClose = items[0]?.autoCloseMs;
  const currentPersistent = items[0]?.persistent;
  // Só sucesso e informação se fecham sozinhos; erro e alerta esperam o usuário.
  // Avisos solicitados pelo usuário (persistent) também esperam o fechamento manual.
  useEffect(() => {
    if (currentId == null || !currentKind || currentPersistent) return;
    const ms = currentAutoClose ?? autoCloseMs(currentKind);
    if (!ms) return;
    const timer = setTimeout(() => dismissErrorNotice(currentId), ms);
    return () => clearTimeout(timer);
  }, [currentId, currentKind, currentAutoClose, currentPersistent]);

  const current = items[0];
  if (!current) return null;
  const pending = items.length - 1;

  return createPortal(
    <div
      ref={ref}
      style={{ pointerEvents: "auto" }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={() => dismissErrorNotice(current.id)}
    >
      <div
        role="alertdialog"
        aria-label="Aviso do sistema"
        className="w-full max-w-md rounded-lg border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-3">
          {current.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            : current.kind === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            : <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${current.kind === "warning" ? "text-warning" : "text-destructive"}`} />}
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
    ,document.body
  );
}
