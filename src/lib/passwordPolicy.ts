// Regra única de senha do sistema (espelhada em supabase/functions/_shared/passwordPolicy.ts).
export const PASSWORD_RULES = [
  { key: "len", label: "Pelo menos 8 caracteres", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "Uma letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "Uma letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { key: "digit", label: "Um número", test: (p: string) => /\d/.test(p) },
  { key: "symbol", label: "Um símbolo (ex.: ! @ # $ %)", test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
  { key: "common", label: "Não ser uma senha comum ou sequência", test: (p: string) => !isCommon(p) },
] as const;

const COMMON = ["123456", "12345678", "password", "senha", "qwerty", "abc123", "111111", "admin", "mudar", "trocar", "iloveyou", "sime", "agiliza"];

function isCommon(p: string) {
  const l = p.toLowerCase();
  if (/(.)\1{3,}/.test(l)) return true;
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/.test(l)) return true;
  return COMMON.some((c) => l.replace(/[^a-z0-9]/g, "").startsWith(c) && l.length < c.length + 4);
}

export function passwordErrors(p: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.label);
}

export function validatePassword(p: string): string | null {
  const errs = passwordErrors(p);
  return errs.length ? `A senha precisa ter: ${errs.join(", ").toLowerCase()}.` : null;
}

export function generateStrongPassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < 12) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  const out = chars.join("");
  return validatePassword(out) ? generateStrongPassword() : out;
}
