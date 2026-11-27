import { avaliarFonte, type ResultadoFonte } from './resultado.ts'

/** Isola cada fonte: uma falha de rede nunca descarta o resultado da outra. */
export async function consultarFonte(endpoint: string, requisitar: () => Promise<Response>, segredos: string[], repetir = false): Promise<ResultadoFonte> {
  const inicio = Date.now()
  const limpar = (texto: string) => segredos.filter(Boolean).reduce((s, segredo) => s.split(segredo).join('[omitido]'), texto)
  for (let tentativa = 0; ; tentativa++) {
    try {
      const response = await requisitar()
      const text = limpar(await response.text())
      let out: unknown = null
      try { out = JSON.parse(text) } catch { /* Não guardar HTML de gateway nem headers. */ }
      const resultado = avaliarFonte(endpoint, response.status, out, Date.now() - inicio)
      if (repetir && tentativa === 0 && Date.now() - inicio < 40000 && (resultado.codigo === 605 || response.status === 502 || response.status === 504)) continue
      return resultado
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return avaliarFonte(endpoint, null, null, Date.now() - inicio, timeout ? 'A conexão excedeu o tempo disponível; dados anteriores preservados.' : 'Não foi possível conectar ao serviço; dados anteriores preservados.')
    }
  }
}