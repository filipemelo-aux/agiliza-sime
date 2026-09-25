import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ } from "@/lib/masks";

export interface EstablishmentInfo {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  type: string;
  inscricao_estadual?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_municipio?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  rntrc?: string | null;
}

/**
 * Hook that provides a unified company view for non-fiscal modules.
 * All Sime establishments are treated as a single entity outside fiscal areas.
 * 
 * - `matrizId`: the primary establishment ID (matriz)
 * - `allIds`: array of ALL establishment IDs (for querying data across all)
 * - `unifiedLabel`: "Sime Transporte Ltda"
 * - `unifiedCnpjs`: formatted string with both CNPJs
 * - `establishments`: raw list for fiscal-only use
 */
// Cache compartilhado: evita milhares de consultas repetidas (uma por componente montado)
let cache: { data: EstablishmentInfo[]; at: number } | null = null;
let inflight: Promise<EstablishmentInfo[]> | null = null;
const TTL = 5 * 60 * 1000;

function fetchEstablishments(): Promise<EstablishmentInfo[]> {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase
      .from("fiscal_establishments")
      .select("id, razao_social, nome_fantasia, cnpj, type, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep, rntrc")
      .eq("active", true)
      .order("type")
      .order("razao_social");
    const list = (data as EstablishmentInfo[]) || [];
    cache = { data: list, at: Date.now() };
    return list;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function useUnifiedCompany() {
  const [establishments, setEstablishments] = useState<EstablishmentInfo[]>(cache?.data || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    fetchEstablishments().then((list) => {
      if (!alive) return;
      setEstablishments(list);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const matriz = useMemo(
    () => establishments.find((e) => e.type === "matriz") || establishments[0],
    [establishments]
  );

  const matrizId = matriz?.id || "";

  const allIds = useMemo(
    () => establishments.map((e) => e.id),
    [establishments]
  );

  const unifiedLabel = matriz?.razao_social || "Sime Transporte Ltda";

  const unifiedCnpjs = useMemo(
    () => establishments.map((e) => maskCNPJ(e.cnpj)).join(" / "),
    [establishments]
  );

  /** Each CNPJ on its own line, e.g. ["CNPJ: 23.662.751/0001-79", "CNPJ: 23.662.751/0002-50"] */
  const unifiedCnpjLines = useMemo(
    () => establishments.map((e) => `CNPJ: ${maskCNPJ(e.cnpj)}`),
    [establishments]
  );

  const unifiedCnpjsRaw = useMemo(
    () => establishments.map((e) => e.cnpj),
    [establishments]
  );

  /** All CNPJs masked, joined by " | " (for compact footers) */
  const unifiedCnpjsPipe = useMemo(
    () => establishments.map((e) => maskCNPJ(e.cnpj)).join(" | "),
    [establishments]
  );

  return {
    matrizId,
    matriz,
    allIds,
    unifiedLabel,
    unifiedCnpjs,
    unifiedCnpjsPipe,
    unifiedCnpjLines,
    unifiedCnpjsRaw,
    establishments,
    loading,
  };
}
