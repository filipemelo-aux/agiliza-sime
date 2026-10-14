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
  kind?: NoticeKind;
}
export type NoticeKind = "error" | "success" | "info" | "warning";

type Listener = (items: NoticeItem[]) => void;

const listeners = new Set<Listener>();
const queue: NoticeItem[] = [];
let seq = 0;

function emit() {
  const snapshot = [...queue];
  listeners.forEach((l) => l(snapshot));
}

export function pushErrorNotice(title: string, description?: string, kind: NoticeKind = "error") {
  if (!title && !description) return;
  queue.push({ id: ++seq, title: title || (kind === "error" ? "Erro" : "Aviso"), description, kind });
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

function central(kind: NoticeKind, message: unknown, data?: { description?: unknown } | string) {
  const description =
    typeof data === "string" ? data
      : data && typeof data === "object" && data.description != null ? String(data.description) : undefined;
  pushErrorNotice(message == null ? "" : String(message), description, kind);
  return seq;
}

/** Mantém o restante da API do sonner (success, info, warning, dismiss...). */
export const toast = Object.assign(
  ((m: any, d?: any) => central("info", m, d)) as unknown as typeof sonner,
  sonner,
  {
    error: (m: unknown, d?: any) => central("error", m, d),
    success: (m: unknown, d?: any) => central("success", m, d),
    info: (m: unknown, d?: any) => central("info", m, d),
    warning: (m: unknown, d?: any) => central("warning", m, d),
    message: (m: unknown, d?: any) => central("info", m, d),
  },
);
