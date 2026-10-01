// Distância rodoviária entre duas cidades (geocodifica no Nominatim e roteia no OSRM).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA = "AgilizaERP/1.0 (admin@fsm.app.br)";

const UF_COD: Record<string, number> = { RO:11,AC:12,AM:13,RR:14,PA:15,AP:16,TO:17,MA:21,PI:22,CE:23,RN:24,PB:25,PE:26,AL:27,SE:28,BA:29,MG:31,ES:32,RJ:33,SP:35,PR:41,SC:42,RS:43,MS:50,MT:51,GO:52,DF:53 };
let MUN: any[] | null = null;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
async function geocode(cidade: string, uf: string, ibge?: string): Promise<[number, number] | null> {
  if (!MUN) {
    const r = await fetch("https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json");
    MUN = await r.json();
  }
  const m = (ibge && MUN!.find((x) => String(x.codigo_ibge) === String(ibge)))
    || MUN!.find((x) => x.codigo_uf === UF_COD[uf.toUpperCase()] && norm(x.nome) === norm(cidade));
  return m ? [Number(m.longitude), Number(m.latitude)] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Não autenticado" }, 401);

    const { origem, destino } = await req.json();
    if (!origem?.cidade || !origem?.uf || !destino?.cidade || !destino?.uf) return json({ error: "Informe cidade e UF de origem e destino" }, 400);
    const a = await geocode(origem.cidade, origem.uf, origem.ibge);
    const b = await geocode(destino.cidade, destino.uf, destino.ibge);
    if (!a || !b) return json({ error: "Cidade não localizada no mapa" }, 404);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`, { headers: { "User-Agent": UA } });
    const j = await r.json();
    const m = j?.routes?.[0]?.distance;
    if (!m) return json({ error: "Rota não encontrada" }, 404);
    return json({ km: Math.round(m / 1000) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
