import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Phone, FileText, Calendar, Edit2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  cpf: string;
  phone: string;
  cnh_number: string;
  cnh_category: string;
  cnh_expiry: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({
    full_name: "",
    phone: "",
    cnh_number: "",
    cnh_category: "",
    cnh_expiry: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          navigate("/auth");
        } else {
          fetchProfile(session.user.id);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
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
        cnh_number: data.cnh_number,
        cnh_category: data.cnh_category,
        cnh_expiry: data.cnh_expiry,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update(editData)
        .eq("id", profile.id);

      if (error) throw error;

      setProfile({ ...profile, ...editData });
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
                        cnh_number: profile.cnh_number,
                        cnh_category: profile.cnh_category,
                        cnh_expiry: profile.cnh_expiry,
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
                  <p className="text-sm text-muted-foreground">
                    CPF: {profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                  </p>
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

              {/* CNH Info */}
              <div className="pt-6 border-t border-border">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Carteira Nacional de Habilitação
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Número</Label>
                    {editing ? (
                      <Input
                        value={editData.cnh_number}
                        onChange={(e) =>
                          setEditData({ ...editData, cnh_number: e.target.value })
                        }
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.cnh_number}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Categoria</Label>
                    {editing ? (
                      <Input
                        value={editData.cnh_category}
                        onChange={(e) =>
                          setEditData({ ...editData, cnh_category: e.target.value })
                        }
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">{profile.cnh_category}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      Validade
                    </Label>
                    {editing ? (
                      <Input
                        type="date"
                        value={editData.cnh_expiry}
                        onChange={(e) =>
                          setEditData({ ...editData, cnh_expiry: e.target.value })
                        }
                        className="input-transport"
                      />
                    ) : (
                      <p className="font-medium">
                        {new Date(profile.cnh_expiry).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
