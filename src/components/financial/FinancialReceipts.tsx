import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Download, Eye } from "lucide-react";
import { format } from "date-fns";

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

      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("payment-receipts")
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("payment_receipts")
        .insert({
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

  const handleDownload = async (receipt: Receipt) => {
    const { data, error } = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(receipt.file_url, 60);

    if (error || !data?.signedUrl) {
      toast.error("Erro ao gerar link de download.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Recibos de Pagamento</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Recibo</Button>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : receipts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum recibo anexado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Credor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{r.person_name}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs truncate max-w-[120px]">{r.file_name}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(r)} title="Visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r)} title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
