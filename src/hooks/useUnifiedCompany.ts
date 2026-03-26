import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ } from "@/lib/masks";

export interface EstablishmentInfo {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  type: string;
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
export function useUnifiedCompany() {
  const [establishments, setEstablishments] = useState<EstablishmentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("fiscal_establishments")
      .select("id, razao_social, nome_fantasia, cnpj, type")
      .eq("active", true)
      .order("type")
      .order("razao_social")
      .then(({ data }) => {
        setEstablishments((data as EstablishmentInfo[]) || []);
        setLoading(false);
      });
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

  const unifiedCnpjsRaw = useMemo(
    () => establishments.map((e) => e.cnpj),
    [establishments]
  );

  return {
    matrizId,
    allIds,
    unifiedLabel,
    unifiedCnpjs,
    unifiedCnpjsRaw,
    establishments,
    loading,
  };
}
