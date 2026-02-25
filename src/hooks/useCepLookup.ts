import { useState, useCallback } from "react";
import { maskName, maskCEP } from "@/lib/masks";

export interface CepData {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  ibge?: string;
}

/**
 * Hook global para busca automática de CEP via BrasilAPI.
 * Retorna os dados do endereço e preenche automaticamente os campos.
 * 
 * Uso:
 * const { lookupCep, loading, error } = useCepLookup((data) => {
 *   setForm(prev => ({ ...prev, street: data.street, city: data.city, ... }));
 * });
 */
export function useCepLookup(onResult: (data: CepData) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookupCep = useCallback(async (rawCep: string) => {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (!res.ok) {
        setError("CEP não encontrado");
        return;
      }
      const data = await res.json();
      onResult({
        street: data.street ? maskName(data.street) : "",
        neighborhood: data.neighborhood ? maskName(data.neighborhood) : "",
        city: data.city ? maskName(data.city) : "",
        state: data.state || "",
        cep: maskCEP(cep),
        ibge: data.city_ibge ? String(data.city_ibge) : undefined,
      });
    } catch {
      setError("Erro ao buscar CEP");
    } finally {
      setLoading(false);
    }
  }, [onResult]);

  return { lookupCep, loading, error };
}
