import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Phone, FileText, Calendar, Edit2, Save, X, ShieldCheck, Building2, CreditCard, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  pix_key_type: string | null;
  pix_key: string | null;
}

interface MaskedDocuments {
  cpf_masked: string;
  cnh_masked: string;
  cnh_category: string;
  cnh_expiry: string;
  has_valid_cnh: boolean;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [documents, setDocuments] = useState<MaskedDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    full_name: "",
    phone: "",
    bank_name: "",
    bank_agency: "",
    bank_account: "",
    bank_account_type: "",
    pix_key_type: "",
    pix_key: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          navigate("/auth");
        } else {
          // Defer Supabase calls to prevent deadlock
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchMaskedDocuments();
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
        fetchMaskedDocuments();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, phone, bank_name, bank_agency, bank_account, bank_account_type, pix_key_type, pix_key")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        navigate("/register");
        return;
      }

      setProfile(data);
      setEditData({
        full_name: data.full_name,
        phone: data.phone,
        bank_name: data.bank_name || "",
        bank_agency: data.bank_agency || "",
        bank_account: data.bank_account || "",
        bank_account_type: data.bank_account_type || "",
        pix_key_type: data.pix_key_type || "",
        pix_key: data.pix_key || "",
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaskedDocuments = async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_masked_documents");
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setDocuments(data[0]);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const updateData = {
        full_name: editData.full_name,
        phone: editData.phone,
        bank_name: editData.bank_name || null,
        bank_agency: editData.bank_agency || null,
        bank_account: editData.bank_account || null,
        bank_account_type: editData.bank_account_type || null,
        pix_key_type: editData.pix_key_type || null,
        pix_key: editData.pix_key || null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({ ...profile, ...updateData });
      setEditing(false);
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram salvas com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-1/3" />
              <div className="h-64 bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold font-display">Meu Perfil</h1>
            {!editing ? (
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    if (profile) {
                      setEditData({
                        full_name: profile.full_name,
                        phone: profile.phone,
                        bank_name: profile.bank_name || "",
                        bank_agency: profile.bank_agency || "",
                        bank_account: profile.bank_account || "",
                        bank_account_type: profile.bank_account_type || "",
                        pix_key_type: profile.pix_key_type || "",
                        pix_key: profile.pix_key || "",
                      });
                    }
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-transport-accent"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            )}
          </div>

          {profile && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-6">
              {/* Avatar & Name */}
              <div className="flex items-center gap-4 pb-6 border-b border-border">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
                <div className="flex-1">
                  {editing ? (
                    <Input
                      value={editData.full_name}
                      onChange={(e) =>
                        setEditData({ ...editData, full_name: e.target.value })
                      }
                      className="input-transport text-xl font-semibold"
                    />
                  ) : (
                    <h2 className="text-xl font-semibold">{profile.full_name}</h2>
                  )}
                  {documents && (
                    <p className="text-sm text-muted-foreground">
                      CPF: {documents.cpf_masked}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    Telefone
                  </Label>
                  {editing ? (
                    <Input
                      value={editData.phone}
                      onChange={(e) =>
                        setEditData({ ...editData, phone: e.target.value })
                      }
                      className="input-transport"
                    />
                  ) : (
                    <p className="font-medium">{profile.phone}</p>
                  )}
                </div>
              </div>

              {/* Banking Information */}
              <div className="pt-6 border-t border-border">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Dados Bancários
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-4 h-4" />
                      Banco
                    </Label>
                    {editing ? (
                      <Input
                        value={editData.bank_name}
                        onChange={(e) =>
                          setEditData({ ...editData, bank_name: e.target.value })
                        }
                        placeholder="Nome do banco"
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.bank_name || "Não informado"}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Agência</Label>
                    {editing ? (
                      <Input
                        value={editData.bank_agency}
                        onChange={(e) =>
                          setEditData({ ...editData, bank_agency: e.target.value })
                        }
                        placeholder="0000"
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.bank_agency || "Não informado"}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="w-4 h-4" />
                      Conta
                    </Label>
                    {editing ? (
                      <Input
                        value={editData.bank_account}
                        onChange={(e) =>
                          setEditData({ ...editData, bank_account: e.target.value })
                        }
                        placeholder="00000-0"
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.bank_account || "Não informado"}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Tipo de Conta</Label>
                    {editing ? (
                      <Select
                        value={editData.bank_account_type}
                        onValueChange={(value) =>
                          setEditData({ ...editData, bank_account_type: value })
                        }
                      >
                        <SelectTrigger className="input-transport">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrente">Conta Corrente</SelectItem>
                          <SelectItem value="poupanca">Conta Poupança</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">
                        {profile.bank_account_type === "corrente"
                          ? "Conta Corrente"
                          : profile.bank_account_type === "poupanca"
                          ? "Conta Poupança"
                          : "Não informado"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* PIX Information */}
              <div className="pt-6 border-t border-border">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  Chave PIX
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Tipo de Chave</Label>
                    {editing ? (
                      <Select
                        value={editData.pix_key_type}
                        onValueChange={(value) =>
                          setEditData({ ...editData, pix_key_type: value })
                        }
                      >
                        <SelectTrigger className="input-transport">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="cnpj">CNPJ</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="telefone">Telefone</SelectItem>
                          <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">
                        {editData.pix_key_type === "cpf"
                          ? "CPF"
                          : editData.pix_key_type === "cnpj"
                          ? "CNPJ"
                          : editData.pix_key_type === "email"
                          ? "E-mail"
                          : editData.pix_key_type === "telefone"
                          ? "Telefone"
                          : editData.pix_key_type === "aleatoria"
                          ? "Chave Aleatória"
                          : "Não informado"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Key className="w-4 h-4" />
                      Chave
                    </Label>
                    {editing ? (
                      <Input
                        value={editData.pix_key}
                        onChange={(e) =>
                          setEditData({ ...editData, pix_key: e.target.value })
                        }
                        placeholder="Sua chave PIX"
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.pix_key || "Não informado"}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* CNH Info (Read-only, masked) */}
              {documents && (
                <div className="pt-6 border-t border-border">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Carteira Nacional de Habilitação
                    <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      <ShieldCheck className="w-3 h-3" />
                      Dados protegidos
                    </span>
                  </h3>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Número</Label>
                      <p className="font-medium font-mono">{documents.cnh_masked}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Categoria</Label>
                      <p className="font-medium">{documents.cnh_category}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        Validade
                      </Label>
                      <p className={`font-medium ${!documents.has_valid_cnh ? 'text-destructive' : ''}`}>
                        {new Date(documents.cnh_expiry).toLocaleDateString("pt-BR")}
                        {!documents.has_valid_cnh && (
                          <span className="ml-2 text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                            Vencida
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Para atualizar seus documentos, entre em contato com o suporte.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
