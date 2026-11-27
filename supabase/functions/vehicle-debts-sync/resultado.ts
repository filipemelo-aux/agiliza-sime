import { normalizar, normalizarSefazTO, type Debito } from './normalize.ts'

export type Fonte = {
  endpoint: string; orgao: string; status: 'sucesso' | 'parcial' | 'falha' | 'sem_debitos';
  http_status: number | null; codigo: number | null; motivo: string | null;
  erros: string[]; custo: number | null; cobrada: boolean | null; duracao_ms: number;
}
export type ResultadoFonte = Fonte & { dados: Record<string, unknown>[]; recibos: string[] }
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Somente mensagens do serviço: nunca guardar headers, token ou parâmetros de autenticação. */
export function avaliarFonte(endpoint: string, http: number | null, resposta: unknown, duracao: number, falhaRede?: string): ResultadoFonte {
  const out = objeto(resposta) ? resposta : {}
  const codigo = typeof out.code === 'number' ? out.code : null
  const header = objeto(out.header) ? out.header : {}
  const orgao = endpoint === 'detran/ma/licenciamento' ? 'Detran-MA / SEFAZ-MA'
    : endpoint.startsWith('sefaz/') ? `SEFAZ-${endpoint.split('/')[1].toUpperCase()}`
    : endpoint.startsWith('detran/') && endpoint.split('/').length > 2 ? `Detran-${endpoint.split('/')[1].toUpperCase()}` : 'Detran'
  const dados = Array.isArray(out.data) ? out.data.filter(objeto) : []
  const erros = Array.isArray(out.errors) ? out.errors.filter((e): e is string => typeof e === 'string').map(e => e.slice(0, 500)) : []
  const motivos: Record<number, string> = {
    605: 'O órgão não respondeu dentro do tempo disponível.',
    606: 'O serviço informou que faltam dados obrigatórios.',
    607: 'O serviço informou dados inválidos; confira o cadastro.',
    608: 'O órgão recusou os dados informados; confira placa, RENAVAM e proprietário.',
    609: 'O órgão limitou as tentativas de consulta.',
    610: 'Não foi possível resolver a verificação de segurança do órgão (CAPTCHA).',
    611: 'O órgão retornou dados incompletos.',
    612: 'O órgão não retornou dados; isso não comprova quitação.',
    613: 'O órgão bloqueou a consulta.',
    614: 'O site do órgão apresentou um erro.',
    615: 'O site do órgão está indisponível.',
    618: 'O site do órgão está sobrecarregado.',
    620: 'O órgão retornou um erro persistente; confira os detalhes antes de tentar novamente.',
    622: 'O serviço identificou consultas repetidas em sequência.',
  }
  const httpOk = http !== null && http >= 200 && http < 300
  // 612 só é interpretado como ausência de IPVA nos serviços específicos já utilizados.
  const vazioIpva = codigo === 612 && ['sefaz/to/ipva', 'sefaz/go/ipva'].includes(endpoint)
  const utilizavel = httpOk && ((codigo === 200 && dados.length > 0) || (codigo === 611 && dados.length > 0) || vazioIpva)
  let status: Fonte['status'] = !utilizavel ? 'falha' : vazioIpva ? 'sem_debitos' : codigo === 611 ? 'parcial' : 'sucesso'
  let motivo = codigo === 200 && dados.length === 0 ? 'Resposta vazia; os débitos anteriores foram preservados.'
    : codigo === 200 ? null : vazioIpva ? 'Nenhum IPVA em aberto retornado nesta fonte.'
    : codigo !== null ? motivos[codigo] ?? String(out.code_message ?? 'Consulta não concluída').slice(0, 500)
    : falhaRede ?? (http === 502 || http === 504 ? 'A conexão com o serviço demorou demais.' : `Resposta inválida do serviço${http ? ` (HTTP ${http})` : ''}.`)
  if (!httpOk && http !== null) motivo = `Falha de comunicação (HTTP ${http}). ${motivo ?? ''}`.trim()
  if (utilizavel && endpoint === 'detran/ma/licenciamento') {
    const campos = ['ipva', 'outros_debitos_sefaz', 'debitos', 'debitos_autuacao', 'penalidades_multas', 'infracoes_autuacao']
    if (dados.some(item => campos.some(campo => !Array.isArray(item[campo])))) {
      status = 'parcial'
      motivo = 'Detran-MA não retornou todas as listas de débitos, incluindo a cobertura SEFAZ-MA; os registros anteriores foram preservados.'
    }
  }
  const preco = header.price == null ? null : Number(header.price)
  return { endpoint, orgao, status, http_status: http, codigo, motivo, erros,
    custo: header.billable === false ? 0 : preco !== null && Number.isFinite(preco) ? preco : null,
    cobrada: typeof header.billable === 'boolean' ? header.billable : null, duracao_ms: duracao,
    dados: utilizavel ? dados : [], recibos: Array.isArray(out.site_receipts) ? out.site_receipts.filter((s): s is string => typeof s === 'string') : [] }
}

export function consolidarResultados(uf: string, resultados: ResultadoFonte[], hoje: string) {
  const fontes: Fonte[] = resultados.map(({ dados: _dados, recibos: _recibos, ...fonte }) => fonte)
  const uteis = resultados.filter(r => r.status !== 'falha')
  const status = !uteis.length ? 'falha' : resultados.some(r => r.status === 'falha' || r.status === 'parcial') ? 'parcial' : 'sucesso'
  const avisos = resultados.filter(r => r.status !== 'sucesso').map(r => `${r.orgao}: ${r.motivo}${r.erros.length ? ` ${r.erros.join('; ')}` : ''}`)
  if (uf === 'MA' || uf === 'TO') avisos.push('Débitos anteriores ausentes nesta resposta foram preservados; ausência não comprova pagamento.')
  if (uf === 'GO') avisos.push('Licenciamento e multas do Detran-GO não fazem parte desta consulta.')
  const debitos: Debito[] = uteis.flatMap(r => r.dados.flatMap(item => r.endpoint === 'sefaz/to/ipva' ? normalizarSefazTO(item, hoje) : normalizar(uf, item, hoje)))
  const valores = resultados.map(r => r.custo).filter((n): n is number => n !== null)
  return { status, fontes, debitos, aviso: avisos.length ? avisos.join(' ') : null,
    response: uteis.flatMap(r => r.dados.map(item => ({ ...item, _fonte: r.endpoint }))),
    price: valores.length ? (Math.round(valores.reduce((s, n) => s + n, 0) * 100) / 100).toFixed(2) : null,
    receipt: uteis.flatMap(r => r.recibos) }
}

/** MA/TO: não inferir pagamento da ausência de um débito, inclusive em retorno parcial. */
export function podeQuitarAusente(uf: string, observacoes: string, status: string) {
  if (status !== 'sucesso' || uf === 'MA' || uf === 'TO') return false
  return uf !== 'GO' || observacoes.includes('[detran:IPVA-SEFAZGO-')
}

export function validarCadastroConsulta(uf: string, placa: string, renavam: string, documento: string): string | null {
  if (uf !== 'MA' && uf !== 'TO') return null
  if (!/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(placa)) return 'Confira a placa: informe uma placa antiga ou Mercosul válida.'
  if (!/^\d{9,11}$/.test(renavam)) return 'Confira o RENAVAM no cadastro: deve conter de 9 a 11 dígitos.'
  if (uf === 'TO' && !/^\d{11}$|^\d{14}$/.test(documento)) return 'O Detran-TO exige CPF com 11 dígitos ou CNPJ com 14 dígitos do proprietário.'
  return null
}

export function consultaSemDebitosConfirmados(importacao: { status?: string; debitos?: unknown } | null | undefined) {
  return !!importacao && (!importacao.status || importacao.status === 'sucesso') && Array.isArray(importacao.debitos) && importacao.debitos.length === 0
}