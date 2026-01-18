import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Truck, Edit, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

type VehicleType = Database["public"]["Enums"]["vehicle_type"];

interface Freight {
  id: string;
  company_name: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  cargo_type: string;
  weight_kg: number;
  value_brl: number;
  distance_km: number | null;
  pickup_date: string;
  delivery_date: string | null;
  required_vehicle_type: VehicleType | null;
  description: string | null;
  status: string;
}

const vehicleTypes: { value: VehicleType; label: string }[] = [
  { value: "truck", label: "Truck" },
  { value: "bitruck", label: "Bitruck" },
  { value: "carreta", label: "Carreta" },
  { value: "carreta_ls", label: "Carreta LS" },
  { value: "rodotrem", label: "Rodotrem" },
  { value: "bitrem", label: "Bitrem" },
  { value: "treminhao", label: "Treminhão" },
];

const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export default function AdminFreights() {
  const { user, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [freights, setFreights] = useState<Freight[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingFreight, setEditingFreight] = useState<Freight | null>(null);

  const [form, setForm] = useState({
    company_name: "",
    origin_city: "",
    origin_state: "",
    destination_city: "",
    destination_state: "",
    cargo_type: "",
    weight_kg: "",
    value_brl: "",
    distance_km: "",
    pickup_date: "",
    delivery_date: "",
    required_vehicle_type: "" as VehicleType | "",
    description: "",
  });

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchFreights();
    }
  }, [isAdmin]);

  const fetchFreights = async () => {
    try {
      const { data, error } = await supabase
        .from("freights")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFreights(data || []);
    } catch (error) {
      console.error("Error fetching freights:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      company_name: "",
      origin_city: "",
      origin_state: "",
      destination_city: "",
      destination_state: "",
      cargo_type: "",
      weight_kg: "",
      value_brl: "",
      distance_km: "",
      pickup_date: "",
      delivery_date: "",
      required_vehicle_type: "",
      description: "",
    });
    setEditingFreight(null);
  };

  const handleEdit = (freight: Freight) => {
    setEditingFreight(freight);
    setForm({
      company_name: freight.company_name,
      origin_city: freight.origin_city,
      origin_state: freight.origin_state,
      destination_city: freight.destination_city,
      destination_state: freight.destination_state,
      cargo_type: freight.cargo_type,
      weight_kg: freight.weight_kg.toString(),
      value_brl: freight.value_brl.toString(),
      distance_km: freight.distance_km?.toString() || "",
      pickup_date: freight.pickup_date,
      delivery_date: freight.delivery_date || "",
      required_vehicle_type: freight.required_vehicle_type || "",
      description: freight.description || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este frete?")) return;

    try {
      const { error } = await supabase
        .from("freights")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Frete excluído com sucesso!" });
      fetchFreights();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir frete",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const freightData = {
        company_name: form.company_name,
        origin_city: form.origin_city,
        origin_state: form.origin_state,
        destination_city: form.destination_city,
        destination_state: form.destination_state,
        cargo_type: form.cargo_type,
        weight_kg: parseFloat(form.weight_kg),
        value_brl: parseFloat(form.value_brl),
        distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
        pickup_date: form.pickup_date,
        delivery_date: form.delivery_date || null,
        required_vehicle_type: form.required_vehicle_type || null,
        description: form.description || null,
      };

      if (editingFreight) {
        const { error } = await supabase
          .from("freights")
          .update(freightData)
          .eq("id", editingFreight.id);

        if (error) throw error;
        toast({ title: "Frete atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from("freights")
          .insert([freightData]);

        if (error) throw error;
        toast({ title: "Frete cadastrado com sucesso!" });
      }

      setDialogOpen(false);
      resetForm();
      fetchFreights();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar frete",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display">Gerenciar Fretes</h1>
            <p className="text-muted-foreground">Cadastre e gerencie os fretes disponíveis</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="btn-transport-accent">
                <Plus className="w-4 h-4 mr-2" />
                Novo Frete
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  {editingFreight ? "Editar Frete" : "Cadastrar Novo Frete"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="company_name">Nome do Cliente / Empresa</Label>
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                    className="input-transport"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="origin_city">Cidade de Origem</Label>
                    <Input
                      id="origin_city"
                      value={form.origin_city}
                      onChange={(e) => setForm({ ...form, origin_city: e.target.value })}
                      required
                      className="input-transport"
                    />
                  </div>
                  <div>
                    <Label htmlFor="origin_state">Estado de Origem</Label>
                    <Select
                      value={form.origin_state}
                      onValueChange={(value) => setForm({ ...form, origin_state: value })}
                    >
                      <SelectTrigger className="input-transport">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="destination_city">Cidade de Destino</Label>
                    <Input
                      id="destination_city"
                      value={form.destination_city}
                      onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
                      required
                      className="input-transport"
                    />
                  </div>
                  <div>
                    <Label htmlFor="destination_state">Estado de Destino</Label>
                    <Select
                      value={form.destination_state}
                      onValueChange={(value) => setForm({ ...form, destination_state: value })}
                    >
                      <SelectTrigger className="input-transport">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cargo_type">Tipo de Carga</Label>
                    <Input
                      id="cargo_type"
                      value={form.cargo_type}
                      onChange={(e) => setForm({ ...form, cargo_type: e.target.value })}
                      required
                      className="input-transport"
                      placeholder="Ex: Grãos, Eletrônicos"
                    />
                  </div>
                  <div>
                    <Label htmlFor="weight_kg">Peso (kg)</Label>
                    <Input
                      id="weight_kg"
                      type="number"
                      value={form.weight_kg}
                      onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                      required
                      className="input-transport"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="value_brl">Valor do Frete (R$)</Label>
                    <Input
                      id="value_brl"
                      type="number"
                      step="0.01"
                      value={form.value_brl}
                      onChange={(e) => setForm({ ...form, value_brl: e.target.value })}
                      required
                      className="input-transport"
                    />
                  </div>
                  <div>
                    <Label htmlFor="distance_km">Distância (km)</Label>
                    <Input
                      id="distance_km"
                      type="number"
                      value={form.distance_km}
                      onChange={(e) => setForm({ ...form, distance_km: e.target.value })}
                      className="input-transport"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pickup_date">Data de Coleta</Label>
                    <Input
                      id="pickup_date"
                      type="date"
                      value={form.pickup_date}
                      onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                      required
                      className="input-transport"
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_date">Data de Entrega (opcional)</Label>
                    <Input
                      id="delivery_date"
                      type="date"
                      value={form.delivery_date}
                      onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                      className="input-transport"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="required_vehicle_type">Veículo Requerido (opcional)</Label>
                  <Select
                    value={form.required_vehicle_type}
                    onValueChange={(value) => setForm({ ...form, required_vehicle_type: value as VehicleType })}
                  >
                    <SelectTrigger className="input-transport">
                      <SelectValue placeholder="Qualquer veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input-transport min-h-[100px]"
                    placeholder="Informações adicionais sobre o frete..."
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full btn-transport-accent py-3"
                >
                  {submitting ? "Salvando..." : editingFreight ? "Atualizar Frete" : "Cadastrar Frete"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : freights.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum frete cadastrado</h3>
            <p className="text-muted-foreground">Clique em "Novo Frete" para adicionar o primeiro.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {freights.map((freight) => (
              <div
                key={freight.id}
                className="freight-card flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">{freight.company_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      freight.status === "available"
                        ? "bg-green-500/20 text-green-500"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {freight.status === "available" ? "Disponível" : freight.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {freight.origin_city}/{freight.origin_state} → {freight.destination_city}/{freight.destination_state}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {freight.cargo_type} • {freight.weight_kg.toLocaleString("pt-BR")} kg
                    {freight.distance_km && ` • ${freight.distance_km.toLocaleString("pt-BR")} km`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-primary">
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(freight.value_brl)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(freight)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(freight.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
