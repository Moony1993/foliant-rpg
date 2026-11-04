import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { BrowserRouter } from 'react-router-dom'
// Fonts are served by the app itself (no request to Google; OFL-1.1, licenses in the bundle's license list).
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/400-italic.css'
import '@fontsource/lora/500.css'
import '@fontsource/lora/600.css'
import '@fontsource/lora/700.css'
import '@fontsource/unifrakturmaguntia/400.css'
import './index.css'
import App from './App.tsx'
import { isDbWaking } from './lib/api'
import { useLang } from './lib/i18n'

// Register the PWA service worker and hard-reload once when a new build takes
// over, so users always run the latest deploy without clearing the cache. The
// SW is built with skipWaiting + clientsClaim, so a new sw.js activates
// immediately and fires `controllerchange` → we reload exactly once.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.update()
    // Re-check for a new build whenever the tab regains focus.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update()
    })
  })
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

// Long gcTime so cached queries survive a reload for offline reads.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, staleTime: 1000 * 30,
      // DB waking from auto-pause (503): keep retrying every 10 s for ~3 min; otherwise the default 3 retries.
      retry: (n, err) => (isDbWaking(err) ? n < 18 : n < 3),
      retryDelay: (n, err) => (isDbWaking(err) ? 10_000 : Math.min(1000 * 2 ** n, 30_000)),
    },
  },
})

// Persist the cache to localStorage → offline reads + instant startup.
// <html lang> follows the UI language (screen readers, hyphenation).
function Localized() {
  const lang = useLang((s) => s.lang)
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return <App />
}

const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'pf-query-cache' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
      // On reconnect, retry any mutations that were paused while offline.
      onSuccess={() => queryClient.resumePausedMutations()}
    >
      <BrowserRouter>
        <Localized />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
