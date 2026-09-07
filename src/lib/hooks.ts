import { useQuery } from '@tanstack/react-query'

export interface BootstrapResult {
  readyAt: number
}

/**
 * Simulates a network round-trip so the UI can show honest skeleton/loading
 * states even though this demo build reads from local mock state.
 */
export function useBootstrap(key: string | string[], ms = 550) {
  return useQuery<BootstrapResult>({
    queryKey: ['bootstrap', ...(Array.isArray(key) ? key : [key])],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, ms))
      return { readyAt: Date.now() }
    },
    staleTime: 2 * 60 * 1000,
  })
}
