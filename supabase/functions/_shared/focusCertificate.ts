// Validação de certificado A1 (.pfx) e envio para o cadastro da empresa na Focus NFe.
import forge from "npm:node-forge@1.3.1";

export interface PfxInfo { cnpj: string | null; titular: string; validFrom: Date; validUntil: Date }

const toBinary = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};

export const toBase64 = (buf: ArrayBuffer) => btoa(toBinary(buf));

/** Abre o PFX com a senha. Lança erro amigável se a senha estiver errada ou o arquivo for inválido. */
export function parsePfx(buf: ArrayBuffer, senha: string): PfxInfo {
  let p12: any;
  try {
    const asn1 = forge.asn1.fromDer(toBinary(buf));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    throw new Error("Senha incorreta ou arquivo de certificado inválido");
  }
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (!bags.length || !keyBags.length) throw new Error("O arquivo não contém certificado e chave privada (A1)");
  // certificado do titular: o que não é emissor de nenhum outro
  const certs = bags.map((b: any) => b.cert).filter(Boolean);
  const leaf = certs.find((c: any) => !certs.some((o: any) => o !== c && o.issuer.hash === c.subject.hash)) || certs[0];
  const cn = String(leaf.subject.getField("CN")?.value || "");
  const m = cn.match(/:(\d{14})\b/) || cn.match(/(\d{14})/);
  return { cnpj: m ? m[1] : null, titular: cn.split(":")[0] || cn, validFrom: leaf.validity.notBefore, validUntil: leaf.validity.notAfter };
}

const FOCUS_API = "https://api.focusnfe.com.br";

/** Atualiza o certificado da empresa (já cadastrada) na Focus usando o token principal da conta. */
export async function pushCertificateToFocus(masterToken: string, cnpj: string, base64: string, senha: string): Promise<{ ok: boolean; message: string }> {
  const auth = { Authorization: "Basic " + btoa(masterToken + ":") };
  try {
    const r = await fetch(`${FOCUS_API}/v2/empresas?cnpj=${cnpj}`, { headers: auth });
    const list = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403) return { ok: false, message: "Token principal da Focus sem permissão para gerenciar empresas" };
    const emp = Array.isArray(list) ? list.find((e: any) => String(e.cnpj || "").replace(/\D/g, "") === cnpj) || list[0] : null;
    if (!emp?.id) return { ok: false, message: `Empresa CNPJ ${cnpj} não encontrada na Focus` };
    const u = await fetch(`${FOCUS_API}/v2/empresas/${emp.id}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo_certificado_base64: base64, senha_certificado: senha }),
    });
    const res = await u.json().catch(() => ({}));
    if (!u.ok) return { ok: false, message: res?.mensagem || res?.erros?.[0]?.mensagem || `Focus respondeu ${u.status}` };
    return { ok: true, message: `Certificado atualizado na Focus (empresa ${emp.id})` };
  } catch (e) {
    return { ok: false, message: "Falha de comunicação com a Focus: " + (e as Error).message };
  }
}

async function encKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CERTIFICATE_ENCRYPTION_KEY");
  if (!secret) throw new Error("CERTIFICATE_ENCRYPTION_KEY not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt", "encrypt"]);
}

export async function encryptCertPassword(password: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encKey(), new TextEncoder().encode(password));
  return `${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ct)))}`;
}

export async function decryptCertPassword(encrypted: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(":");
  if (!ivB64 || !ctB64) return encrypted; // legado em texto puro
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encKey(), ct));
}

/** Envia um certificado já salvo para a Focus (todos os CNPJs vinculados) e grava o resultado. */
// deno-lint-ignore no-explicit-any
export async function syncCertificateToFocus(svc: any, certificateId: string): Promise<{ ok: boolean; message: string }> {
  const { data: cert } = await svc.from("fiscal_certificates").select("id,tenant_id,caminho_storage,senha_criptografada,cnpj").eq("id", certificateId).maybeSingle();
  if (!cert) return { ok: false, message: "Certificado não encontrado" };
  const save = async (r: { ok: boolean; message: string }, status?: string) => {
    await svc.from("fiscal_certificates").update({ focus_sync_status: status ?? (r.ok ? "sincronizado" : "erro"), focus_sync_message: r.message, focus_synced_at: new Date().toISOString() }).eq("id", cert.id);
    return r;
  };
  const { data: sec } = await svc.from("tenant_secrets").select("focus_nfe_token_master").eq("tenant_id", cert.tenant_id).maybeSingle();
  const master = sec?.focus_nfe_token_master || Deno.env.get("FOCUS_NFE_TOKEN_MASTER");
  if (!master) return save({ ok: false, message: "Aguardando o SuperAdmin informar o token principal da conta Focus" }, "pendente");
  const { data: blob } = await svc.storage.from("fiscal-certificates").download(cert.caminho_storage);
  if (!blob) return save({ ok: false, message: "Arquivo do certificado não encontrado" });
  const senha = await decryptCertPassword(cert.senha_criptografada);
  const b64 = toBase64(await blob.arrayBuffer());
  const { data: links } = await svc.from("establishment_certificates").select("establishment_id").eq("certificate_id", cert.id);
  const ids = (links || []).map((l: any) => l.establishment_id);
  let cnpjs: string[] = [];
  if (ids.length) {
    const { data: ests } = await svc.from("fiscal_establishments").select("cnpj").in("id", ids);
    cnpjs = (ests || []).map((e: any) => String(e.cnpj).replace(/\D/g, ""));
  }
  if (!cnpjs.length && cert.cnpj) cnpjs = [cert.cnpj];
  if (!cnpjs.length) return save({ ok: false, message: "Nenhum CNPJ vinculado ao certificado" });
  const msgs: string[] = []; let ok = true;
  for (const c of cnpjs) { const r = await pushCertificateToFocus(master, c, b64, senha); ok &&= r.ok; msgs.push(`${c}: ${r.message}`); }
  return save({ ok, message: msgs.join(" | ") });
}
