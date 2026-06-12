import { supabase } from "@/integrations/supabase/client";
import { exportFuelOrderPDF } from "./exportFuelOrderPdf";

export async function resolveSupplierEmail(order: any): Promise<string | null> {
  let email: string | undefined;
  if (order.supplier_id) {
    const { data } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", order.supplier_id)
      .maybeSingle();
    email = (data as any)?.email?.trim().toLowerCase();
  }
  if (!email && order.supplier_name) {
    const { data } = await supabase
      .from("profiles")
      .select("email")
      .ilike("full_name", `%${order.supplier_name}%`)
      .not("email", "is", null)
      .limit(1);
    email = (data?.[0] as any)?.email?.trim().toLowerCase();
  }
  return email || null;
}

async function resolveSignatureUrl(requesterUserId: string | null): Promise<string | null> {
  if (!requesterUserId) return null;
  const { data: sigData } = await supabase
    .from("profiles")
    .select("signature_data")
    .eq("user_id", requesterUserId)
    .maybeSingle();
  const base64Data = (sigData as any)?.signature_data as string | null;
  if (!base64Data?.startsWith("data:image/")) return null;
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const filePath = `signatures/${requesterUserId}.png`;
    await supabase.storage
      .from("fuel-order-pdfs")
      .upload(filePath, blob, { upsert: true, contentType: "image/png" });
    const { data: urlData } = await supabase.storage
      .from("fuel-order-pdfs")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);
    return urlData?.signedUrl || null;
  } catch {
    return null;
  }
}

export async function sendFuelOrderEmail(params: {
  order: any;
  to: string;
  unifiedLabel: string;
  unifiedCnpjs: string;
}): Promise<void> {
  const { order, to, unifiedLabel, unifiedCnpjs } = params;
  const signatureUrl = await resolveSignatureUrl(order.requester_user_id);
  const html = exportFuelOrderPDF(order, unifiedLabel, unifiedCnpjs, signatureUrl);
  const { data, error } = await supabase.functions.invoke("send-smtp-email", {
    body: {
      to,
      subject: `Ordem de Abastecimento Nº ${order.order_number} — SIME Transportes`,
      html,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);

  if (order.status === "pendente") {
    await supabase.from("fuel_orders").update({ status: "enviada" } as any).eq("id", order.id);
  }
}
