import { useEffect, useState } from "react";
import { ProcessingOverlay } from "./processing-overlay";

/**
 * Shows the blocking ProcessingOverlay automatically whenever a write request
 * (insert/update/delete/rpc/function call) to the backend takes longer than a short delay.
 * Operações no banco apenas processam: ao terminar, o quadro fecha em silêncio,
 * sem aviso de conclusão — a confirmação fica somente nas janelas do usuário.
 */
type Listener = (count: number, label: string) => void;
let pending = 0;
let lastLabel = "Processando...";
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l(pending, lastLabel));

const backendUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";

/** Nomes de rotina trocados por descrições do processo (sem nomes técnicos). */
const friendlyFunction: Record<string, string> = {
  "focus-nfe": "Comunicando com a SEFAZ...",
  "nfe-auto-sync": "Sincronizando notas recebidas...",
  "superadmin-tenants": "Aplicando configurações da empresa...",
  "create-employee-account": "Criando acesso do colaborador...",
};

function labelFor(method: string, url: string) {
  let resource = "";
  const table = url.match(/\/rest\/v1\/([^/?]+)/)?.[1];
  const rpc = url.match(/\/rpc\/([^/?]+)/)?.[1];
  const fn = url.match(/\/functions\/v1\/([^/?]+)/)?.[1];
  if (rpc) resource = rpc.replace(/_/g, " ");
  else if (fn) resource = fn.replace(/-/g, " ");
  else if (table) resource = table.replace(/_/g, " ");

  if (fn && friendlyFunction[fn]) return friendlyFunction[fn];
  if (rpc) return `Executando ${resource}...`;
  if (fn) return `Processando ${resource}...`;
  if (method === "DELETE") return resource ? `Excluindo registro em ${resource}...` : "Excluindo...";
  if (method === "POST") return resource ? `Salvando ${resource}...` : "Salvando...";
  return resource ? `Atualizando ${resource}...` : "Atualizando...";
}

/** Última interação do usuário (clique/tecla): escritas sem ação recente são automáticas e não exibem quadro. */
let lastUserAction = 0;
const USER_WINDOW_MS = 3000;

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const mark = () => { lastUserAction = Date.now(); };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isWrite =
      method !== "GET" && method !== "HEAD" && method !== "OPTIONS" &&
      (!backendUrl || url.startsWith(backendUrl)) &&
      /\/(rest\/v1|functions\/v1|storage\/v1)\//.test(url) &&
      !url.includes("/auth/v1/");
    if (!isWrite) return orig(input as any, init);
    // Carregamentos/sincronizações automáticas: concluem em silêncio, sem quadro.
    if (pending === 0 && Date.now() - lastUserAction > USER_WINDOW_MS) return orig(input as any, init);
    pending++;
    lastLabel = labelFor(method, url);
    notify();
    return orig(input as any, init).finally(() => {
      pending = Math.max(0, pending - 1);
      notify();
    });
  };
}
install();

export function GlobalWriteOverlay() {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState(lastLabel);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const l: Listener = (c, lb) => { setCount(c); setLabel(lb); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (count > 0) {
      const t = setTimeout(() => setShow(true), 350);
      return () => clearTimeout(t);
    }
    // Sem aviso de conclusão: o quadro apenas fecha quando as operações terminam.
    const t = setTimeout(() => setShow(false), 150);
    return () => clearTimeout(t);
  }, [count]);

  return <ProcessingOverlay open={show} label={label} status="processing" />;
}
