/**
 * Simple OFX (Open Financial Exchange) parser.
 * Extracts bank transactions from OFX/QFX files.
 */

export interface OfxTransaction {
  fitid: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive = credit, negative = debit
  description: string;
  tipo: "entrada" | "saida";
  /** Detalhes extras (Open Finance): categoria, forma de pagamento, contraparte etc. */
  details?: Record<string, string | number | null> | null;
}

export interface OfxParseResult {
  bankName: string;
  accountId: string;
  transactions: OfxTransaction[];
}

function parseOfxDate(raw: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  const d = raw.replace(/\[.*$/, "").trim();
  if (d.length >= 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return d;
}

function extractTag(content: string, tag: string): string {
  // OFX uses SGML-style tags (not always closed)
  const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function extractBlocks(content: string, tag: string): string[] {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const blocks: string[] = [];
  let idx = 0;
  while (true) {
    const start = content.indexOf(openTag, idx);
    if (start === -1) break;
    const end = content.indexOf(closeTag, start);
    if (end === -1) {
      // Some OFX files don't close STMTTRN properly
      const nextStart = content.indexOf(openTag, start + openTag.length);
      blocks.push(content.slice(start, nextStart === -1 ? undefined : nextStart));
      if (nextStart === -1) break;
      idx = nextStart;
    } else {
      blocks.push(content.slice(start, end + closeTag.length));
      idx = end + closeTag.length;
    }
  }
  return blocks;
}

export function parseOfx(text: string): OfxParseResult {
  const bankName = extractTag(text, "ORG") || extractTag(text, "BANKID") || "Banco";
  const accountId = extractTag(text, "ACCTID") || "";

  const transBlocks = extractBlocks(text, "STMTTRN");
  const transactions: OfxTransaction[] = transBlocks.map((block) => {
    const amount = parseFloat(extractTag(block, "TRNAMT") || "0");
    return {
      fitid: extractTag(block, "FITID"),
      date: parseOfxDate(extractTag(block, "DTPOSTED")),
      amount,
      description: extractTag(block, "MEMO") || extractTag(block, "NAME") || "",
      tipo: amount >= 0 ? "entrada" : "saida",
    };
  });

  return { bankName, accountId, transactions };
}

/**
 * Tenta identificar "parcela X de Y" na descrição de um lançamento
 * (ex: "01/05", "1/5", "(1/5)", "PARC 01/05", "PARCELA 01 DE 05").
 * Retorna null quando não encontra ou quando o padrão parece uma data (dd/mm/yyyy).
 */
export function parseParcelaFromDescription(desc: string): { atual: number; total: number } | null {
  if (!desc) return null;
  const patterns: RegExp[] = [
    /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i,
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,
    /(?:^|[\s\-–])(\d{1,2})\s*\/\s*(\d{1,2})(?![\/\d])(?=\s|$|[^\d\/])/,
  ];
  for (const re of patterns) {
    const m = desc.match(re);
    if (!m) continue;
    const atual = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (!Number.isFinite(atual) || !Number.isFinite(total)) continue;
    if (total < 2 || total > 99) continue;
    if (atual < 1 || atual > total) continue;
    return { atual, total };
  }
  return null;
}
