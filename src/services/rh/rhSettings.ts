/**
 * RH Settings Service
 * Camada única de persistência das configurações do módulo RH.
 * Não duplica regras: apenas armazena referências (IDs do plano de contas e overrides).
 */
const STORAGE_KEY = "rh:settings:v1";

export type RHSettings = {
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  payDay?: string;
  salaryOverrides?: Record<string, number>;
};

type Listener = (s: RHSettings) => void;
const listeners = new Set<Listener>();

export const rhSettings = {
  get(): RHSettings {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      // Overrides locais descontinuados: `profiles.salario` é a fonte única.
      if (raw && raw.salaryOverrides) {
        delete raw.salaryOverrides;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
      }
      return raw;
    } catch {
      return {};
    }
  },
  set(next: RHSettings) {
    const clean = { ...next };
    delete (clean as any).salaryOverrides;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    listeners.forEach((l) => l(clean));
  },
  patch(partial: Partial<RHSettings>) {
    const next = { ...this.get(), ...partial };
    this.set(next);
    return next;
  },
  /** @deprecated Salário é editado direto em `profiles.salario`. */
  setSalaryOverride(_id: string, _value: number | null) {
    return this.get();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const isFolhaAccountName = (nome: string) => {
  const n = norm(nome);
  return n.includes("salario") || n.includes("folha");
};
export const isAdiantAccountName = (nome: string) => {
  const n = norm(nome);
  return n.includes("adiantamento") || n.includes("vale");
};
