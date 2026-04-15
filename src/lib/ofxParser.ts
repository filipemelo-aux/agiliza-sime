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
