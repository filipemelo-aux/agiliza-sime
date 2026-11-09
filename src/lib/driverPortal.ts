/** Login do portal do motorista: o CPF vira um e-mail interno fixo (não recebe mensagens). */
export const cpfDigits = (v: string) => v.replace(/\D/g, "").slice(0, 11);
export const driverEmailFromCpf = (cpf: string) => `${cpfDigits(cpf)}@motorista.agiliza.app`;
export const maskCpf = (v: string) => {
  const d = cpfDigits(v);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
export function isValidCpf(v: string) {
  const c = cpfDigits(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
