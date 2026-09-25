// Bloqueia qualquer gravação no backend para usuários com acesso de consulta.
// A proteção definitiva está nas regras do banco (consultor só tem leitura);
// este guard evita chamadas de escrita e mostra uma mensagem clara.
import { toast } from "@/hooks/use-toast";

const READ_RPC_PREFIXES = ["get_", "user_has_documents", "has_role"];
let installed = false;
let enabled = false;
let lastToast = 0;

function isWrite(url: string, method: string): boolean {
  const m = method.toUpperCase();
  if (url.includes("/auth/v1/")) return false;
  if (url.includes("/rest/v1/rpc/")) {
    const name = url.split("/rest/v1/rpc/")[1]?.split("?")[0] || "";
    return !READ_RPC_PREFIXES.some((p) => name.startsWith(p));
  }
  if (url.includes("/rest/v1/")) return m !== "GET" && m !== "HEAD";
  if (url.includes("/storage/v1/object")) {
    if (url.includes("/object/sign") || url.includes("/object/list")) return false;
    return m !== "GET" && m !== "HEAD";
  }
  if (url.includes("/functions/v1/")) return !url.includes("/functions/v1/open-finance-sync");
  return false;
}

export function setReadOnlyMode(on: boolean) {
  enabled = on;
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (enabled) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      if (isWrite(url, method)) {
        if (Date.now() - lastToast > 2000) {
          lastToast = Date.now();
          toast({ title: "Acesso somente consulta", description: "Seu perfil permite apenas visualizar e emitir relatórios.", variant: "destructive" });
        }
        return new Response(JSON.stringify({ message: "Acesso somente consulta", error: "Acesso somente consulta" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return orig(input as any, init);
  };
}

// ---- Desativa visualmente botões de criar/editar para o consultor ----
const WRITE_WORDS = /\b(nov[oa]s?|adicionar|criar|cadastrar|editar|alterar|salvar|excluir|apagar|remover|deletar|importar|lan[cç]ar|pagar|quitar|receber|baixar pagamento|estornar|conciliar|vincular|desvincular|gerar|emitir|duplicar|faturar|transmitir|confirmar|aprovar|rejeitar|enviar|upload|anexar|parcelar|transferir|registrar|atualizar cadastro|inutilizar|cancelar (cte|mdf|fatura|cheque|nota))\b/i;
const ALLOW_WORDS = /(sincronizar open finance|imprimir|relat[oó]rio|exportar|baixar pdf|download|visualizar|filtrar|limpar|buscar|pesquisar|fechar|voltar|atualizar$|detalhes|ver )/i;
const WRITE_ICONS = ["lucide-plus", "lucide-pencil", "lucide-square-pen", "lucide-pen", "lucide-pen-line", "lucide-trash", "lucide-trash-2", "lucide-save", "lucide-upload", "lucide-circle-plus", "lucide-plus-circle", "lucide-copy-plus", "lucide-banknote", "lucide-hand-coins", "lucide-link", "lucide-unlink", "lucide-send"];
let observer: MutationObserver | null = null;

function labelOf(el: HTMLElement) {
  return `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.textContent || ""}`.replace(/\s+/g, " ").trim();
}

function isWriteControl(el: HTMLElement): boolean {
  if (el.closest("[data-readonly-allow]")) return false;
  const label = labelOf(el);
  if (label && ALLOW_WORDS.test(label)) return false;
  if (label && WRITE_WORDS.test(label)) return true;
  if (!el.textContent?.trim()) {
    const svg = el.querySelector("svg");
    const cls = svg?.getAttribute("class") || "";
    return WRITE_ICONS.some((c) => cls.split(/\s+/).includes(c));
  }
  return false;
}

function lockControls(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('button, [role="menuitem"], a[role="button"]').forEach((el) => {
    if (el.dataset.roLocked) return;
    if (!isWriteControl(el)) return;
    el.dataset.roLocked = "1";
    if (el instanceof HTMLButtonElement) el.disabled = true;
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("data-disabled", "");
    el.style.pointerEvents = "none";
    el.style.opacity = "0.45";
    el.title = "Somente consulta";
  });
}

function unlockAll() {
  document.querySelectorAll<HTMLElement>("[data-ro-locked]").forEach((el) => {
    delete el.dataset.roLocked;
    if (el instanceof HTMLButtonElement) el.disabled = false;
    el.removeAttribute("aria-disabled");
    el.removeAttribute("data-disabled");
    el.style.pointerEvents = "";
    el.style.opacity = "";
  });
}

export function setReadOnlyUi(on: boolean) {
  if (typeof document === "undefined") return;
  if (on && !observer) {
    lockControls(document);
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; lockControls(document); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else if (!on && observer) {
    observer.disconnect();
    observer = null;
    unlockAll();
  }
}

/** Classifica uma ação pelo nome (e ícone opcional) para o perfil consultor. */
export function isWriteActionLabel(label: string, iconName?: string): boolean {
  if (ALLOW_WORDS.test(label)) return false;
  if (WRITE_WORDS.test(label)) return true;
  if (iconName) {
    const kebab = "lucide-" + iconName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    return WRITE_ICONS.includes(kebab);
  }
  return false;
}
export const isPrintActionLabel = (label: string) => /(imprimir|relat[oó]rio|exportar|pdf)/i.test(label);
