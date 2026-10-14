/**
 * Centraliza os avisos de erro do sistema: em vez de toasts que somem sozinhos,
 * cada erro abre um aviso no centro da tela (NoticeHost) que só fecha quando
 * o usuário clica no botão de fechar (canto superior direito).
 *
 * Importe `toast` daqui nos componentes: success/info/etc. continuam sendo
 * toasts do sonner; apenas `error` é convertido em aviso central.
 */
import { toast as sonner } from "sonner";

export interface NoticeItem {
  id: number;
  title: string;
  description?: string;
}

type Listener = (items: NoticeItem[]) => void;

const listeners = new Set<Listener>();
const queue: NoticeItem[] = [];
let seq = 0;

function emit() {
  const snapshot = [...queue];
  listeners.forEach((l) => l(snapshot));
}

export function pushErrorNotice(title: string, description?: string) {
  queue.push({ id: ++seq, title, description });
  emit();
}

export function dismissErrorNotice(id: number) {
  const idx = queue.findIndex((n) => n.id === id);
  if (idx >= 0) {
    queue.splice(idx, 1);
    emit();
  }
}

export function subscribeErrorNotices(listener: Listener) {
  listeners.add(listener);
  listener([...queue]);
  return () => {
    listeners.delete(listener);
  };
}

/** Mantém o restante da API do sonner (success, info, warning, dismiss...). */
export const toast = Object.assign(
  ((...args: Parameters<typeof sonner>) => sonner(...args)) as typeof sonner,
  sonner,
  {
    error: (message: unknown, data?: { description?: unknown } | string) => {
      const description =
        typeof data === "string"
          ? data
          : data && typeof data === "object" && data.description != null
            ? String(data.description)
            : undefined;
      pushErrorNotice(String(message), description);
    },
  },
);
