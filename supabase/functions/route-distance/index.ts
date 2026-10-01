// Distância rodoviária entre duas cidades (geocodifica no Nominatim e roteia no OSRM).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA = "AgilizaERP/1.0 (admin@fsm.app.br)";

async function geocode(cidade: string, uf: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Brazil&city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j?.[0]) return null;
  return [Number(j[0].lon), Number(j[0].lat)];
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
    const a = await geocode(origem.cidade, origem.uf);
    const b = await geocode(destino.cidade, destino.uf);
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
