/**
 * Camada de Serviços Fiscais
 * 
 * Arquitetura:
 * 
 *   xmlBuilder.ts   → Gera XML no formato SEFAZ (CT-e / MDF-e)
 *   xmlSigner.ts    → Delega assinatura digital ao backend (edge function)
 *   sefazClient.ts  → Comunicação com webservices SEFAZ via edge function
 *   cteService.ts   → Orquestra ciclo de vida do CT-e
 *   mdfeService.ts  → Orquestra ciclo de vida do MDF-e
 * 
 * Uso:
 *   import { emitirCte, cancelarCte } from "@/services/fiscal";
 *   import { emitirMdfe, encerrarMdfe } from "@/services/fiscal";
 */

// CT-e
export { emitirCte, consultarCte, cancelarCte } from "./cteService";
export type { EmitirCteParams, EmitirCteResult } from "./cteService";

// MDF-e
export { emitirMdfe, consultarMdfe, cancelarMdfe, encerrarMdfe } from "./mdfeService";
export type { EmitirMdfeParams, EmitirMdfeResult } from "./mdfeService";

// XML Builder (para uso direto se necessário)
export { buildCteXml, buildMdfeXml } from "./xmlBuilder";
export type { CteXmlData, MdfeXmlData } from "./xmlBuilder";

// SEFAZ Client
export { sendToSefaz, consultarSefaz, cancelarDocumento } from "./sefazClient";
export type { SefazAction, SefazRequest, SefazResponse } from "./sefazClient";

// XML Signer
export { signXml, validateXmlForSigning } from "./xmlSigner";
