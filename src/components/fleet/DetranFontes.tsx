import type { Fonte } from '../../../supabase/functions/vehicle-debts-sync/resultado'
import { formatCurrency } from '@/lib/masks'

const STATUS = { sucesso: 'Concluída', parcial: 'Dados parciais', falha: 'Falhou', sem_debitos: 'Sem IPVA retornado' }

export function DetranFontes({ fontes }: { fontes?: Fonte[] }) {
  if (!fontes?.length) return null
  return <div className="space-y-2 text-xs" aria-label="Resultado por órgão">
    {fontes.map((f, i) => <div key={`${f.endpoint}-${i}`} className="border-b border-border pb-2 space-y-1">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{f.orgao}</span>
        <span className={f.status === 'falha' ? 'text-destructive font-medium' : f.status === 'parcial' ? 'text-warning-foreground font-medium' : 'text-muted-foreground'}>{STATUS[f.status]}</span>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
        {f.codigo !== null && <span>Código {f.codigo}</span>}
        {f.http_status !== null && f.http_status !== 200 && <span>HTTP {f.http_status}</span>}
        <span>{(f.duracao_ms / 1000).toFixed(1).replace('.', ',')} s</span>
        <span>{f.custo !== null ? `Custo: ${formatCurrency(f.custo)}` : 'Custo não informado'}</span>
      </div>
      {f.motivo && <p className="break-words">{f.motivo}</p>}
      {f.erros?.length > 0 && <p className="text-muted-foreground break-words">{f.erros.join('; ')}</p>}
    </div>)}
  </div>
}