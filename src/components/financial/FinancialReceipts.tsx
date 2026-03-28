import { useState, useEffect } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { ReceiptPdfCanvasViewer } from "@/components/financial/ReceiptPdfCanvasViewer";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Eye, User, Calendar, Receipt } from "lucide-react";
import { format } from "date-fns";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";

interface Receipt {
  id: string;
  person_id: string | null;
  person_name: string;
  description: string;
  file_url: string;
  file_name: string;
  harvest_job_id: string | null;
  created_at: string;
}

export function FinancialReceipts() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState("");
  const [viewerBlob, setViewerBlob] = useState<Blob | null>(null);
  const isMobile = useIsMobile();

  // Form state
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const fetchReceipts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_receipts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setReceipts(data as Receipt[]);
    setLoading(false);
  };

  useEffect(() => { fetchReceipts(); }, []);

  useEffect(() => {
    return () => { if (viewerUrl) URL.revokeObjectURL(viewerUrl); };
  }, [viewerUrl]);

  const handleUpload = async () => {
    if (!file || !personName || !description) {
      toast.error("Preencha todos os campos e selecione um arquivo.");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("payment-receipts").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("payment_receipts").insert({
        person_id: personId,
        person_name: personName,
        description,
        file_url: filePath,
        file_name: file.name,
        created_by: user.id,
      });

      if (insertError) throw insertError;

      toast.success("Recibo anexado com sucesso!");
      setDialogOpen(false);
      setPersonId(null);
      setPersonName("");
      setDescription("");
      setFile(null);
      fetchReceipts();
    } catch (err: any) {
      toast.error("Erro ao enviar recibo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    if (!await confirm({ title: "Excluir recibo", description: "Excluir este recibo?", variant: "destructive", confirmLabel: "Excluir" })) return;

    await supabase.storage.from("payment-receipts").remove([receipt.file_url]);
    const { error } = await supabase.from("payment_receipts").delete().eq("id", receipt.id);
    if (error) {
      toast.error("Erro ao excluir recibo.");
    } else {
      toast.success("Recibo excluído.");
      fetchReceipts();
    }
  };

  const handleView = async (receipt: Receipt) => {
    const { data, error } = await supabase.storage.from("payment-receipts").download(receipt.file_url);

    if (error || !data) {
      toast.error("Erro ao carregar arquivo para visualização.");
      return;
    }

    if (viewerUrl) URL.revokeObjectURL(viewerUrl);

    const pdfFile = /\.pdf$/i.test(receipt.file_name);
    const normalizedBlob = pdfFile && data.type !== "application/pdf" ? data.slice(0, data.size, "application/pdf") : data;
    const blobUrl = URL.createObjectURL(normalizedBlob);

    setViewerFileName(receipt.file_name);
    setViewerBlob(normalizedBlob);
    setViewerUrl(blobUrl);
  };

  const closeViewer = () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerFileName("");
    setViewerBlob(null);
  };

  const isImage = (fileName: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName);

  return (
    <div className="space-y-4">
      {/* Summary + action */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-sm font-bold text-foreground">{receipts.length} recibo{receipts.length !== 1 ? "s" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-muted/30 transition-colors border-dashed">
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ação</p>
                  <p className="text-sm font-bold text-foreground">Novo Recibo</p>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Anexar Recibo de Pagamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Credor / Proprietário</Label>
                <PersonSearchInput
                  selectedName={personName}
                  onSelect={(person) => { setPersonId(person.id); setPersonName(person.full_name); }}
                  onClear={() => { setPersonId(null); setPersonName(""); }}
                  placeholder="Buscar pessoa..."
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Recibo pagamento colheita Fazenda X - Jan/2026" />
              </div>
              <div>
                <Label>Arquivo (PDF ou Imagem)</Label>
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="w-full gap-1.5">
                <Plus className="h-4 w-4" />
                {uploading ? "Enviando..." : "Anexar Recibo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : receipts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhum recibo anexado ainda.</p>
            <p className="text-muted-foreground text-xs mt-1">Clique em "Novo Recibo" para começar.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {receipts.map((r) => (
            <Card key={r.id} className="border-l-4 border-l-primary">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">{r.person_name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleView(r)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDateBR(r.created_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{r.file_name}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Credor</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Descrição</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Arquivo</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Data</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary shrink-0" />
                          {r.person_name}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{r.description}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-1 max-w-[150px]">
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{r.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{formatDateBR(r.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleView(r)} title="Visualizar">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Viewer Dialog */}
      <Dialog open={!!viewerUrl} onOpenChange={(open) => !open && closeViewer()}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
          <DialogHeader className="px-4 py-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{viewerFileName}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-muted/30">
            {viewerUrl &&
              (isImage(viewerFileName) ? (
                <div className="flex items-center justify-center h-full p-4">
                  <img src={viewerUrl} alt={viewerFileName} className="max-w-full max-h-full object-contain rounded-md" />
                </div>
              ) : isPdf(viewerFileName) && viewerBlob ? (
                <ReceiptPdfCanvasViewer file={viewerBlob} fallbackUrl={viewerUrl} isMobile={isMobile} />
              ) : (
                <div className="h-full w-full flex items-center justify-center p-6">
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">Formato não suportado para visualização interna.</p>
                    <Button asChild variant="outline" size={isMobile ? "sm" : "default"}>
                      <a href={viewerUrl} target="_blank" rel="noopener noreferrer">Abrir arquivo</a>
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
