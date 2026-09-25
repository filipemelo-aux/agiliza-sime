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
