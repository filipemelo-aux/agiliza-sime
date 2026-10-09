import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Recarrega o sistema limpando caches, cookies e armazenamento local (mantém a sessão de login). */
export function HardRefreshButton() {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // Preserva apenas a sessão de login para não deslogar o usuário
      const keep: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) keep[k] = localStorage.getItem(k)!;
      }
      localStorage.clear();
      Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
      sessionStorage.clear();

      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim();
        if (!name || (name.startsWith("sb-") && name.includes("auth-token"))) return;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.error("Falha ao limpar dados locais:", e);
    }
    // Força o navegador a baixar de novo a página principal e os arquivos do sistema
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.version) localStorage.setItem("app_version", data.version);
      }
      const html = await (await fetch(`/?t=${Date.now()}`, { cache: "reload" })).text();
      await fetch("/", { cache: "reload" });
      const assets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)).map((m) => m[1]);
      await Promise.all(assets.map((a) => fetch(a, { cache: "reload" }).catch(() => null)));
    } catch { /* segue para o recarregamento */ }
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  };

  return (
    <Button variant="ghost" size="icon" onClick={run} disabled={busy} title="Atualizar sistema">
      <RefreshCw className={`w-5 h-5 ${busy ? "animate-spin" : ""}`} />
    </Button>
  );
}
