'use client'

import { useState, useCallback, useEffect, useReducer } from 'react'
import { BrandHeader } from '@/components/layout/BrandHeader'
import { Footer } from '@/components/layout/Footer'
import { SearchBar } from '@/components/home/SearchBar'
import { QuickGrid } from '@/components/home/QuickGrid'
import { SearchResults } from '@/components/home/SearchResults'
import { AiSection } from '@/components/home/AiSection'
import { OllamaStatus, useOllamaState } from '@/components/home/OllamaStatus'
import { searchServices } from '@/lib/services'

export default function Home() {
  const [query, setQuery] = useState('')
  const results = searchServices(query)
  const ollamaState = useOllamaState()
  const [aiTrigger, setAiTrigger] = useState(0)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Re-sync on route restore (browser back/forward)
  useEffect(() => {
    const onFocus = () => forceUpdate()
    window.addEventListener('focus', onFocus)
    window.addEventListener('popstate', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('popstate', onFocus)
    }
  }, [])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
  }, [])

  const handleEnter = useCallback(() => {
    if (results.length > 0) {
      window.open(results[0].url, '_blank', 'noopener,noreferrer')
    }
  }, [results])

  const handleAskAi = useCallback(() => {
    setAiTrigger((n) => n + 1)
  }, [])

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-xl px-4 flex-1">
        <BrandHeader />
        <OllamaStatus state={ollamaState} />

        <div className="mt-4">
          <SearchBar
            query={query}
            onSearch={handleSearch}
            onEnter={handleEnter}
            onAskAi={handleAskAi}
          />
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {query.trim() ? (
            <>
              <AiSection
                key={aiTrigger}
                query={query}
                hasResults={results.length > 0}
                ollamaState={ollamaState}
                onQueryChange={handleSearch}
              />
              <SearchResults results={results} query={query} />
            </>
          ) : (
            <QuickGrid />
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
