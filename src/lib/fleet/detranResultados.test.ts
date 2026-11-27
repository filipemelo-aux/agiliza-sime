import { describe, expect, it } from 'vitest'
import { avaliarFonte, consolidarResultados, podeQuitarAusente, validarCadastroConsulta, consultaSemDebitosConfirmados } from '../../../supabase/functions/vehicle-debts-sync/resultado'

const maCompleto = { ipva: [], outros_debitos_sefaz: [], debitos: [], debitos_autuacao: [], penalidades_multas: [], infracoes_autuacao: [] }
const ipva = () => avaliarFonte('sefaz/to/ipva', 200, { code: 200, header: { billable: true, price: '0.24' }, data: [{ pagamentos: [{ descricao: 'IPVA 2026 COTA ÚNICA', valor: 'R$ 1.500,00', vencimento: '20/03/2026' }] }] }, 30)
describe('Consultas manuais MA/TO por fonte', () => {
  it('TO aproveita o IPVA de R$ 1.500 da SEFAZ mesmo quando o Detran demora demais', () => {
    const r = consolidarResultados('TO', [avaliarFonte('detran/to/veiculo', 200, { code: 605 }, 50), ipva()], '2026-11-27')
    expect(r.status).toBe('parcial'); expect(r.debitos.map(d => [d.tipo, d.valor])).toEqual([['IPVA', 1500]])
    expect(r.fontes[0]).toMatchObject({ codigo: 605, status: 'falha' }); expect(r.price).toBe('0.24')
    expect(r.response[0]._fonte).toBe('sefaz/to/ipva')
  })
  it('TO aproveita a multa do Detran quando a SEFAZ é bloqueada', () => {
    const detran = avaliarFonte('detran/to/veiculo', 200, { code: 200, data: [{ multas: [{ numero_autuacao: 'AUTO-1', valor: 'R$ 130.16' }] }] }, 10)
    const r = consolidarResultados('TO', [detran, avaliarFonte('sefaz/to/ipva', 200, { code: 613 }, 20)], '2026-11-27')
    expect(r.status).toBe('parcial'); expect(r.debitos[0]).toMatchObject({ tipo: 'Multa', valor: 130.16 })
  })
  it('MA mantém os débitos SEFAZ como IPVA, nunca como multa de trânsito', () => {
    const r = consolidarResultados('MA', [avaliarFonte('detran/ma/licenciamento', 200, { code: 200, data: [{ ...maCompleto, outros_debitos_sefaz: [{ ano: 2023, tipo: 'AUTO INFRAÇÃO / NOTIFICAÇÃO', numero_documento: '123', normalizado_saldo_devedor: 900 }] }] }, 10)], '2026-11-27')
    expect(r.status).toBe('sucesso'); expect(r.debitos.map(d => [d.tipo, d.ano, d.valor])).toEqual([['IPVA', 2023, 900]])
    expect(r.fontes[0].orgao).toBe('Detran-MA / SEFAZ-MA')
  })
  it('MA lista SEFAZ ausente é parcial; lista vazia explícita não é falha', () => {
    expect(avaliarFonte('detran/ma/licenciamento', 200, { code: 200, data: [{ ipva: [] }] }, 10).status).toBe('parcial')
    expect(avaliarFonte('detran/ma/licenciamento', 200, { code: 200, data: [maCompleto] }, 10).status).toBe('sucesso')
  })
  it.each(['MA', 'TO'])('%s não quita débitos ausentes nem após sucesso', uf => {
    expect(podeQuitarAusente(uf, '[detran:IPVA-SEFAZTO-2025]', 'sucesso')).toBe(false)
    expect(podeQuitarAusente(uf, '[detran:MULTA-123]', 'parcial')).toBe(false)
  })
  it('GO preserva restrição de quitação às suas tags IPVA', () => {
    expect(podeQuitarAusente('GO', '[detran:MULTA-123]', 'sucesso')).toBe(false)
    expect(podeQuitarAusente('GO', '[detran:IPVA-SEFAZGO-2025]', 'sucesso')).toBe(true)
  })
  it('falhas por bloqueio/CAPTCHA são registráveis sem dados nem credenciais', () => {
    const f = avaliarFonte('detran/ma/licenciamento', 200, { code: 610, header: { parameters: { token: 'segredo' } }, errors: ['Verificação indisponível'] }, 12)
    expect(f).toMatchObject({ status: 'falha', codigo: 610, dados: [], duracao_ms: 12 }); expect(JSON.stringify(f)).not.toContain('segredo')
    expect(avaliarFonte('detran/to/veiculo', null, null, 12, 'Falha de conexão').status).toBe('falha')
  })
  it('611 com dados é parcial; 200 vazio e 612 Detran não comprovam quitação', () => {
    expect(avaliarFonte('detran/to/veiculo', 200, { code: 611, data: [{ multas: [] }] }, 10).status).toBe('parcial')
    expect(avaliarFonte('detran/ma/licenciamento', 200, { code: 200, data: [] }, 10).status).toBe('falha')
    expect(avaliarFonte('detran/to/veiculo', 200, { code: 612 }, 10).status).toBe('falha')
    expect(avaliarFonte('sefaz/to/ipva', 200, { code: 612 }, 10).status).toBe('sem_debitos')
  })
  it('conserva falhas das duas fontes e soma somente custos efetivos conhecidos', () => {
    const r = consolidarResultados('TO', [avaliarFonte('detran/to/veiculo', 200, { code: 605, header: { billable: false, price: '0.24' } }, 10), avaliarFonte('sefaz/to/ipva', 502, null, 20)], '2026-11-27')
    expect(r.status).toBe('falha'); expect(r.debitos).toEqual([]); expect(r.fontes).toHaveLength(2); expect(r.price).toBe('0.00')
  })
  it('impede cadastro inválido antes de consumir consulta MA/TO', () => {
    expect(validarCadastroConsulta('MA', 'ABC1D23', '123', '')).not.toBeNull()
    expect(validarCadastroConsulta('TO', 'ABC1D23', '12345678901', '')).not.toBeNull()
    expect(validarCadastroConsulta('MA', 'ABC1234', '123456789', '')).toBeNull()
    expect(validarCadastroConsulta('TO', 'ABC1D23', '12345678901', '12345678000199')).toBeNull()
  })
  it('falha ou parcial sem débitos nunca deixa a frota em dia; histórico antigo segue compatível', () => {
    expect(consultaSemDebitosConfirmados({ status: 'falha', debitos: [] })).toBe(false)
    expect(consultaSemDebitosConfirmados({ status: 'parcial', debitos: [] })).toBe(false)
    expect(consultaSemDebitosConfirmados({ status: 'sucesso', debitos: [] })).toBe(true)
    expect(consultaSemDebitosConfirmados({ debitos: [] })).toBe(true)
  })
})