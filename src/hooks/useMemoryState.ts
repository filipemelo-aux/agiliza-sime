import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Estado que sobrevive à troca de página dentro do app (cache em memória do módulo).
 * Ao voltar para a tela, os dados aparecem na hora, sem novo carregamento.
 */
const store = new Map<string, unknown>();

export function hasMemoryState(key: string) {
  return store.has(key);
}

export function useMemoryState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (store.has(key)) return store.get(key) as T;
    const v = typeof initial === "function" ? (initial as () => T)() : initial;
    return v;
  });
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        store.set(key, v);
        return v;
      });
    },
    [key],
  );
  return [value, set];
}
