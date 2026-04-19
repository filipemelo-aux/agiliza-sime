import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { HandCoins, Wrench } from "lucide-react";
import type { ColaboradorRH } from "@/services/rh";

type TipoComissao = "motorista" | "embarque";

interface ComissoesTabProps {
  colaboradores: ColaboradorRH[];
}

/**
 * Aba de Comissões — RH
 *
 * Regras:
 *  - Apenas pessoas com is_colaborador_rh = true (já filtradas em `colaboradores`).
 *  - Tipo "Motorista": só permite selecionar colaboradores cujo `tipo === "motorista"`.
 *  - Tipo "Por Embarque": desabilitado ("Em manutenção").
 */
export function ComissoesTab({ colaboradores }: ComissoesTabProps) {
  const [tipo, setTipo] = useState<TipoComissao>("motorista");
  const [colaboradorId, setColaboradorId] = useState<string>("");

  // Lista de colaboradores elegíveis conforme o tipo de comissão
  const elegiveis = useMemo(() => {
    if (tipo === "motorista") {
      return colaboradores.filter((c) => c.tipo === "motorista" && c.ativo);
    }
    return colaboradores.filter((c) => c.ativo);
  }, [colaboradores, tipo]);

  // Reseta seleção se o colaborador atual deixar de ser elegível
  const isCurrentValid = elegiveis.some((c) => c.id === colaboradorId);
  if (colaboradorId && !isCurrentValid) {
    setColaboradorId("");
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Comissões</h3>
            <p className="text-[11px] text-muted-foreground">
              Configure o cálculo de comissões por colaborador.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          {/* Tipo de Comissão */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de Comissão</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoComissao)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motorista">Motorista</SelectItem>
                <SelectItem value="embarque" disabled>
                  <span className="flex items-center gap-2">
                    Por Embarque
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 gap-1 text-muted-foreground"
                    >
                      <Wrench className="h-2.5 w-2.5" /> Em manutenção
                    </Badge>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Colaborador */}
          <div className="space-y-1.5">
            <Label className="text-xs">Colaborador</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={
                    elegiveis.length === 0
                      ? tipo === "motorista"
                        ? "Nenhum motorista marcado como colaborador (RH)"
                        : "Nenhum colaborador disponível"
                      : "Selecione um colaborador"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {elegiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      {c.full_name}
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {c.tipo === "motorista" ? "Motorista" : c.cargo || "Colaborador"}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo === "motorista" && (
              <p className="text-[10px] text-muted-foreground">
                Apenas pessoas com categoria <span className="font-medium">Motorista</span> e
                marcadas como colaborador (RH) aparecem aqui.
              </p>
            )}
          </div>
        </div>

        {colaboradorId && (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 max-w-3xl">
            <p className="text-xs text-muted-foreground">
              Configuração de regras de cálculo (percentual, base, período) será adicionada em
              breve nesta tela.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
