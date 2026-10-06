import { useEffect, useState } from "react";
import { ProcessingOverlay } from "./processing-overlay";

/**
 * Shows the blocking ProcessingOverlay automatically whenever a write request
 * (insert/update/delete/rpc/function call) to the backend takes longer than a short delay.
 */
type Listener = (count: number, label: string) => void;
let pending = 0;
let lastLabel = "Processando...";
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l(pending, lastLabel));

const backendUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";

function labelFor(method: string, url: string) {
  if (method === "DELETE") return "Excluindo...";
  if (url.includes("/rpc/") || url.includes("/functions/v1/")) return "Processando...";
  if (method === "POST") return "Salvando...";
  return "Atualizando...";
}

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
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
    pending++;
    lastLabel = labelFor(method, url);
    notify();
    try {
      return await orig(input as any, init);
    } finally {
      pending = Math.max(0, pending - 1);
      notify();
    }
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
    const t = setTimeout(() => setShow(false), 150);
    return () => clearTimeout(t);
  }, [count]);

  return <ProcessingOverlay open={show} label={label} />;
}
