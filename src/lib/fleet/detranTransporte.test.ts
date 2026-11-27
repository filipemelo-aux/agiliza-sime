import { describe, it, expect, vi } from 'vitest'
import { consultarFonte } from '../../../supabase/functions/vehicle-debts-sync/transporte'

describe('Transporte de consultas manuais', () => {
  it.each(['detran/ma/licenciamento', 'detran/to/veiculo', 'sefaz/to/ipva'])('não repete timeout em %s', async endpoint => {
    const pedir = vi.fn(async () => new Response(JSON.stringify({ code: 605 }), { status: 200 }))
    expect((await consultarFonte(endpoint, pedir, [])).codigo).toBe(605)
    expect(pedir).toHaveBeenCalledTimes(1)
  })
  it('falha de conexão Detran não rejeita consulta paralela à SEFAZ', async () => {
    const [detran, sefaz] = await Promise.all([
      consultarFonte('detran/to/veiculo', async () => { throw new Error('Falha') }, []),
      consultarFonte('sefaz/to/ipva', async () => new Response(JSON.stringify({ code: 200, data: [{ pagamentos: [] }] })), []),
    ])
    expect(detran.status).toBe('falha'); expect(sefaz.status).toBe('sucesso')
  })
  it('remove segredos de mensagens do provedor antes de registrar e devolver', async () => {
    const r = await consultarFonte('detran/ma/licenciamento', async () => new Response(JSON.stringify({ code: 603, code_message: 'Token teste-secreto inválido', errors: ['teste-secreto'] })), ['teste-secreto'])
    expect(r.erros).toEqual(['[omitido]']); expect(JSON.stringify(r)).not.toContain('teste-secreto')
  })
})