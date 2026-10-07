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
  let resource = "";
  const table = url.match(/\/rest\/v1\/([^/?]+)/)?.[1];
  const rpc = url.match(/\/rpc\/([^/?]+)/)?.[1];
  const fn = url.match(/\/functions\/v1\/([^/?]+)/)?.[1];
  if (rpc) resource = rpc.replace(/_/g, " ");
  else if (fn) resource = fn.replace(/-/g, " ");
  else if (table) resource = table.replace(/_/g, " ");

  if (rpc) return `Executando ${resource}...`;
  if (fn) return `Processando ${resource}...`;
  if (method === "DELETE") return resource ? `Excluindo registro em ${resource}...` : "Excluindo...";
  if (method === "POST") return resource ? `Salvando ${resource}...` : "Salvando...";
  return resource ? `Atualizando ${resource}...` : "Atualizando...";
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
    console.log("[GWOverlay] write detectado", method, url, "backendUrl=", backendUrl);
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
    const l: Listener = (c, lb) => { console.log("[GWOverlay] listener", c, lb); setCount(c); setLabel(lb); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    console.log("[GWOverlay] count=", count);
    if (count > 0) {
      const t = setTimeout(() => { console.log("[GWOverlay] show=true"); setShow(true); }, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShow(false), 150);
    return () => clearTimeout(t);
  }, [count]);

  console.log("[GWOverlay] render show=", show, "label=", label);
  return <ProcessingOverlay open={show} label={label} />;
}
