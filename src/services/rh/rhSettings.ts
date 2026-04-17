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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  },
  set(next: RHSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    listeners.forEach((l) => l(next));
  },
  patch(partial: Partial<RHSettings>) {
    const next = { ...this.get(), ...partial };
    this.set(next);
    return next;
  },
  setSalaryOverride(id: string, value: number | null) {
    const cur = this.get();
    const overrides = { ...(cur.salaryOverrides || {}) };
    if (value == null || isNaN(value)) delete overrides[id];
    else overrides[id] = value;
    return this.patch({ salaryOverrides: overrides });
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
