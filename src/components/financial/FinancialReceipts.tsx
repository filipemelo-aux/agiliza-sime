import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Eye, User, Calendar } from "lucide-react";
import { format } from "date-fns";
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
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState("");
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

  useEffect(() => {
    fetchReceipts();
  }, []);

  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    };
  }, [viewerUrl]);

  const handleUpload = async () => {
    if (!file || !personName || !description) {
      toast.error("Preencha todos os campos e selecione um arquivo.");
      return;
    }

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    if (!confirm("Excluir este recibo?")) return;

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
    setViewerUrl(blobUrl);
  };

  const closeViewer = () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerFileName("");
  };

  const isImage = (fileName: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recibos de Pagamento</h2>
          <p className="text-sm text-muted-foreground">
            {receipts.length} recibo{receipts.length !== 1 ? "s" : ""} anexado{receipts.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Recibo
            </Button>
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
                  onSelect={(person) => {
                    setPersonId(person.id);
                    setPersonName(person.full_name);
                  }}
                  onClear={() => {
                    setPersonId(null);
                    setPersonName("");
                  }}
                  placeholder="Buscar pessoa..."
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Recibo pagamento colheita Fazenda X - Jan/2026"
                />
              </div>
              <div>
                <Label>Arquivo (PDF ou Imagem)</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? "Enviando..." : "Anexar Recibo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : receipts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum recibo anexado ainda.</p>
            <p className="text-muted-foreground text-xs mt-1">Clique em "Novo Recibo" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {receipts.map((r) => (
            <Card key={r.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <User className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{r.person_name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {format(new Date(r.created_at), "dd/MM/yyyy")}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[200px]">{r.file_name}</span>
                    </div>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleView(r)} title="Visualizar">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              ) : isPdf(viewerFileName) ? (
                <div className="h-full w-full">
                  <object data={viewerUrl} type="application/pdf" className="h-full w-full">
                    <div className="h-full w-full flex items-center justify-center p-6">
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">Não foi possível exibir o PDF internamente.</p>
                        <Button asChild variant="outline" size={isMobile ? "sm" : "default"}>
                          <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
                            Abrir PDF
                          </a>
                        </Button>
                      </div>
                    </div>
                  </object>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center p-6">
                  <div className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">Formato não suportado para visualização interna.</p>
                    <Button asChild variant="outline" size={isMobile ? "sm" : "default"}>
                      <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
                        Abrir arquivo
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
