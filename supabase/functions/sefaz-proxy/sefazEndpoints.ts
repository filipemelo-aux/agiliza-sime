/**
 * Registro de Webservices SEFAZ por UF e Ambiente
 *
 * Referência oficial:
 * https://www.cte.fazenda.gov.br/portal/webServices.aspx
 * https://dfe-portal.svrs.rs.gov.br/Mdfe/Servicos
 *
 * Cada UF pode ter endpoints próprios ou usar SVRS/SVSP como contingência.
 */

export type SefazAmbiente = "homologacao" | "producao";
export type ContingencyMode = "normal" | "svc_an" | "svc_rs" | "offline";

export interface SefazEndpoints {
  cteAutorizacao: string;
  cteConsulta: string;
  cteEvento: string; // cancelamento, carta correção
  cteStatusServico: string;
  mdfeAutorizacao: string;
  mdfeConsulta: string;
  mdfeEvento: string;
  mdfeStatusServico: string;
  mdfeEncerramento: string;
  mdfeDistribuicao: string;
}

// ── Homologação ──────────────────────────────────────────────

const SVRS_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte-homologacao.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte-homologacao.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
  mdfeConsulta: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
  mdfeEvento: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
  mdfeStatusServico: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
  mdfeEncerramento: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
  mdfeDistribuicao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
};

const SP_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcao.asmx",
  cteConsulta: "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeConsulta.asmx",
  cteEvento: "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://homologacao.nfe.fazenda.sp.gov.br/cteWEB/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const MG_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcao.asmx",
  cteConsulta: "https://hcte.fazenda.mg.gov.br/cte/services/CTeConsulta.asmx",
  cteEvento: "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://hcte.fazenda.mg.gov.br/cte/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const MT_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeRecepcao.asmx",
  cteConsulta: "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeConsulta.asmx",
  cteEvento: "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://homologacao.sefaz.mt.gov.br/ctews/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const MS_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://homologacao.cte.ms.gov.br/services/CTeRecepcao.asmx",
  cteConsulta: "https://homologacao.cte.ms.gov.br/services/CTeConsulta.asmx",
  cteEvento: "https://homologacao.cte.ms.gov.br/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://homologacao.cte.ms.gov.br/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const PR_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeRecepcao.asmx",
  cteConsulta: "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeConsulta.asmx",
  cteEvento: "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://homologacao.cte.fazenda.pr.gov.br/cte/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

// ── Produção ─────────────────────────────────────────────────

const SVRS_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
  mdfeConsulta: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
  mdfeEvento: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
  mdfeStatusServico: "https://mdfe.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
  mdfeEncerramento: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
  mdfeDistribuicao: "https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
};

const SP_PROD: SefazEndpoints = {
  cteAutorizacao: "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcao.asmx",
  cteConsulta: "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeConsulta.asmx",
  cteEvento: "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

const MG_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcao.asmx",
  cteConsulta: "https://cte.fazenda.mg.gov.br/cte/services/CTeConsulta.asmx",
  cteEvento: "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.fazenda.mg.gov.br/cte/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

const MT_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.sefaz.mt.gov.br/ctews/services/CTeRecepcao.asmx",
  cteConsulta: "https://cte.sefaz.mt.gov.br/ctews/services/CTeConsulta.asmx",
  cteEvento: "https://cte.sefaz.mt.gov.br/ctews/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.sefaz.mt.gov.br/ctews/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

const MS_PROD: SefazEndpoints = {
  cteAutorizacao: "https://producao.cte.ms.gov.br/services/CTeRecepcao.asmx",
  cteConsulta: "https://producao.cte.ms.gov.br/services/CTeConsulta.asmx",
  cteEvento: "https://producao.cte.ms.gov.br/services/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://producao.cte.ms.gov.br/services/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

const PR_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.fazenda.pr.gov.br/cte/CTeRecepcao.asmx",
  cteConsulta: "https://cte.fazenda.pr.gov.br/cte/CTeConsulta.asmx",
  cteEvento: "https://cte.fazenda.pr.gov.br/cte/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.fazenda.pr.gov.br/cte/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

// ── Mapa UF → Endpoints ─────────────────────────────────────

const ENDPOINTS_HOMOLOG: Record<string, SefazEndpoints> = {
  SP: SP_HOMOLOG,
  MG: MG_HOMOLOG,
  MT: MT_HOMOLOG,
  MS: MS_HOMOLOG,
  PR: PR_HOMOLOG,
  // UFs que usam SVRS
  AC: SVRS_HOMOLOG, AL: SVRS_HOMOLOG, AM: SVRS_HOMOLOG, AP: SVRS_HOMOLOG,
  BA: SVRS_HOMOLOG, CE: SVRS_HOMOLOG, DF: SVRS_HOMOLOG, ES: SVRS_HOMOLOG,
  GO: SVRS_HOMOLOG, MA: SVRS_HOMOLOG, PA: SVRS_HOMOLOG, PB: SVRS_HOMOLOG,
  PE: SVRS_HOMOLOG, PI: SVRS_HOMOLOG, RJ: SVRS_HOMOLOG, RN: SVRS_HOMOLOG,
  RO: SVRS_HOMOLOG, RR: SVRS_HOMOLOG, RS: SVRS_HOMOLOG, SC: SVRS_HOMOLOG,
  SE: SVRS_HOMOLOG, TO: SVRS_HOMOLOG,
};

const ENDPOINTS_PROD: Record<string, SefazEndpoints> = {
  SP: SP_PROD,
  MG: MG_PROD,
  MT: MT_PROD,
  MS: MS_PROD,
  PR: PR_PROD,
  AC: SVRS_PROD, AL: SVRS_PROD, AM: SVRS_PROD, AP: SVRS_PROD,
  BA: SVRS_PROD, CE: SVRS_PROD, DF: SVRS_PROD, ES: SVRS_PROD,
  GO: SVRS_PROD, MA: SVRS_PROD, PA: SVRS_PROD, PB: SVRS_PROD,
  PE: SVRS_PROD, PI: SVRS_PROD, RJ: SVRS_PROD, RN: SVRS_PROD,
  RO: SVRS_PROD, RR: SVRS_PROD, RS: SVRS_PROD, SC: SVRS_PROD,
  SE: SVRS_PROD, TO: SVRS_PROD,
};

// ── SVC (Serviço Virtual de Contingência) ────────────────────

const SVC_AN_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://cte-homologacao.svc.fazenda.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte-homologacao.svc.fazenda.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte-homologacao.svc.fazenda.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte-homologacao.svc.fazenda.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const SVC_RS_HOMOLOG: SefazEndpoints = {
  cteAutorizacao: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte-homologacao.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte-homologacao.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_HOMOLOG.mdfeAutorizacao,
  mdfeConsulta: SVRS_HOMOLOG.mdfeConsulta,
  mdfeEvento: SVRS_HOMOLOG.mdfeEvento,
  mdfeStatusServico: SVRS_HOMOLOG.mdfeStatusServico,
  mdfeEncerramento: SVRS_HOMOLOG.mdfeEncerramento,
  mdfeDistribuicao: SVRS_HOMOLOG.mdfeDistribuicao,
};

const SVC_AN_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.svc.fazenda.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte.svc.fazenda.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte.svc.fazenda.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.svc.fazenda.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

const SVC_RS_PROD: SefazEndpoints = {
  cteAutorizacao: "https://cte.svrs.rs.gov.br/ws/cterecepcao/CTeRecepcao.asmx",
  cteConsulta: "https://cte.svrs.rs.gov.br/ws/cteconsulta/CTeConsulta.asmx",
  cteEvento: "https://cte.svrs.rs.gov.br/ws/cterecepcaoevento/CTeRecepcaoEvento.asmx",
  cteStatusServico: "https://cte.svrs.rs.gov.br/ws/ctestatusservico/CTeStatusServico.asmx",
  mdfeAutorizacao: SVRS_PROD.mdfeAutorizacao,
  mdfeConsulta: SVRS_PROD.mdfeConsulta,
  mdfeEvento: SVRS_PROD.mdfeEvento,
  mdfeStatusServico: SVRS_PROD.mdfeStatusServico,
  mdfeEncerramento: SVRS_PROD.mdfeEncerramento,
  mdfeDistribuicao: SVRS_PROD.mdfeDistribuicao,
};

// UFs that use SVC-AN (Ambiente Nacional) as contingency
const UFS_SVC_AN = new Set(["SP", "MG", "MS", "MT", "PR"]);
// All others use SVC-RS

// ── Código IBGE da UF ────────────────────────────────────────

export const UF_CODIGO_IBGE: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MG: "31", MS: "50",
  MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41",
  RJ: "33", RN: "24", RO: "11", RR: "14", RS: "43", SC: "42",
  SE: "28", SP: "35", TO: "17",
};

// ── Public API ───────────────────────────────────────────────

/**
 * Resolve os endpoints SEFAZ para uma UF, ambiente e modo de contingência.
 */
export function getSefazEndpoints(
  uf: string,
  ambiente: SefazAmbiente,
  contingency: ContingencyMode = "normal"
): SefazEndpoints {
  const upperUf = uf.toUpperCase();
  const isProd = ambiente === "producao";

  // Contingência SVC
  if (contingency === "svc_an") {
    return isProd ? SVC_AN_PROD : SVC_AN_HOMOLOG;
  }
  if (contingency === "svc_rs") {
    return isProd ? SVC_RS_PROD : SVC_RS_HOMOLOG;
  }

  // Normal
  const map = isProd ? ENDPOINTS_PROD : ENDPOINTS_HOMOLOG;
  const fallback = isProd ? SVRS_PROD : SVRS_HOMOLOG;
  return map[upperUf] || fallback;
}

/**
 * Resolve o endpoint específico para uma ação SEFAZ.
 */
export function getSefazUrl(
  uf: string,
  ambiente: SefazAmbiente,
  action: string,
  contingency: ContingencyMode = "normal"
): string {
  const endpoints = getSefazEndpoints(uf, ambiente, contingency);

  const actionMap: Record<string, keyof SefazEndpoints> = {
    autorizar_cte: "cteAutorizacao",
    consultar_cte: "cteConsulta",
    cancelar_cte: "cteEvento",
    status_cte: "cteStatusServico",
    autorizar_mdfe: "mdfeAutorizacao",
    consultar_mdfe: "mdfeConsulta",
    cancelar_mdfe: "mdfeEvento",
    encerrar_mdfe: "mdfeEncerramento",
    status_mdfe: "mdfeStatusServico",
    distribuicao_mdfe: "mdfeDistribuicao",
  };

  const key = actionMap[action];
  if (!key) {
    throw new Error(`Ação SEFAZ desconhecida: ${action}`);
  }

  return endpoints[key];
}

/**
 * Retorna o tpAmb (1=produção, 2=homologação) para uso no XML.
 */
export function getTpAmb(ambiente: SefazAmbiente): string {
  return ambiente === "producao" ? "1" : "2";
}

/**
 * Determines which SVC to use for a given UF.
 */
export function getDefaultSvcMode(uf: string): ContingencyMode {
  return UFS_SVC_AN.has(uf.toUpperCase()) ? "svc_an" : "svc_rs";
}

/**
 * Checks if a SEFAZ error indicates the service is offline/unavailable.
 */
export function isSefazOfflineError(cStat: string, errorMessage?: string): boolean {
  const offlineCodes = new Set(["108", "109", "999"]);
  if (offlineCodes.has(cStat)) return true;
  if (errorMessage) {
    const offlinePatterns = [
      "timeout", "timed out", "connection refused", "ECONNREFUSED",
      "service unavailable", "503", "502", "504",
      "serviço indisponível", "fora do ar",
    ];
    const lower = errorMessage.toLowerCase();
    return offlinePatterns.some((p) => lower.includes(p));
  }
  return false;
}
