/**
 * Centraliza os avisos do sistema: em vez de toasts que somem sozinhos, cada
 * mensagem abre um aviso no centro da tela (NoticeHost) com botão de fechar no
 * canto superior direito.
 *
 * Regras de fechamento: erros e alertas ficam abertos até o usuário fechar;
 * mensagens positivas (success) e informativas (info) se fecham sozinhas.
 *
 * Importe `toast` daqui nos componentes: as demais funções do sonner
 * (loading, etc.) continuam funcionando normalmente.
 */
import { toast as sonner } from "sonner";

export interface NoticeItem {
  id: number;
  title: string;
  description?: string;
  kind?: NoticeKind;
  /** Sobrescreve o tempo de fechamento automático, em milissegundos. */
  autoCloseMs?: number;
  /**
   * Aviso solicitado explicitamente pelo usuário (ex.: retorno de consulta/operacao
   * na SEFAZ): fica aberto até o usuário fechar, mesmo sendo positivo/informativo.
   */
  persistent?: boolean;
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

export function pushErrorNotice(
  title: string,
  description?: string,
  kind: NoticeKind = "error",
  autoCloseMs?: number,
  persistent?: boolean,
) {
  if (!title && !description) return;
  queue.push({ id: ++seq, title: title || (kind === "error" ? "Erro" : "Aviso"), description, kind, autoCloseMs, persistent });
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

function central(kind: NoticeKind, message: unknown, data?: { description?: unknown; duration?: unknown; autoCloseMs?: unknown } | string) {
  const description =
    typeof data === "string" ? data
      : data && typeof data === "object" && data.description != null ? String(data.description) : undefined;
  const rawMs =
    data && typeof data === "object"
      ? typeof data.autoCloseMs === "number" ? data.autoCloseMs
      : typeof data.duration === "number" ? data.duration
      : undefined
      : undefined;
  const autoCloseMs = rawMs != null && rawMs > 0 ? rawMs : undefined;
  const persistent =
    data && typeof data === "object" && (data as { persistent?: unknown }).persistent === true ? true : undefined;
  pushErrorNotice(message == null ? "" : String(message), description, kind, autoCloseMs, persistent);
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
