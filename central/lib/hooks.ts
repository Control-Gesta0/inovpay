'use client'

import { useEffect, useState } from 'react'
import type { ExecutionData, LiveData, RecoveryData } from './types'

/**
 * Carrega UMA vez ao abrir a página. Refresh só manual: o botão dispara o
 * evento 'central:refresh' (nada de polling martelando o CRM).
 */
function useFonte<T>(path: string) {
  const [data, setData] = useState<(T & { demo?: boolean }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let on = true
    const load = () => {
      setCarregando(true)
      fetch(path, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (!on) return; if (d.error) { setErro(String(d.error)); setData(null) } else { setData(d); setErro(null) } })
        .catch(e => on && setErro(String(e)))
        .finally(() => on && setCarregando(false))
    }
    load()
    window.addEventListener('central:refresh', load)
    return () => { on = false; window.removeEventListener('central:refresh', load) }
  }, [path])
  return { data, erro, carregando }
}

export const useExecutions = () => useFonte<ExecutionData>('/api/exec')
export const useLive = () => useFonte<LiveData>('/api/live')
export const useRecovery = () => useFonte<RecoveryData>('/api/recuperacao')
