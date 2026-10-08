import { supabase } from "@/integrations/supabase/client";

export type MdfeFocusAction = "emitir_mdfe_salvo" | "consultar_mdfe_salvo" | "encerrar_mdfe_salvo" | "cancelar_mdfe_salvo" | "damdfe_mdfe_salvo" | "xml_mdfe_salvo";

/** Chama o conector Focus NFe para operações de MDF-e salvos. Sempre devolve objeto com `success` ou `error`. */
export async function mdfeFocus(action: MdfeFocusAction, mdfeId: string, extra: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke("focus-nfe", { body: { action, mdfe_id: mdfeId, ...extra } });
  if (error) {
    let msg = error.message || "Falha ao acessar a emissão fiscal";
    try { const ctx: any = (error as any).context; const j = ctx?.json ? await ctx.json() : null; if (j?.error) msg = j.error; } catch { /* ignore */ }
    return { success: false, error: msg };
  }
  return data ?? { success: false, error: "Sem resposta" };
}
