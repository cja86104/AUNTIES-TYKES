import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useStore } from './store/useStore'
import './index.css'
import './i18n'

// Loads public settings, restores any Supabase session, and hydrates the cache.
// No-op in demo mode, where the cache comes from localStorage.
void useStore.getState().bootstrap()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 0, staleTime: 30_000 },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root was not found in index.html')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)