import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PuzzleSummary } from '@pixel-imperium/protocol'

// Placeholder until the router and play screen land.
function App() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/puzzles')
      .then(res => (res.ok ? (res.json() as Promise<PuzzleSummary[]>) : Promise.reject(new Error(res.statusText))))
      .then(setPuzzles, (e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>Pixel Imperium</h1>
      {error && <p>Couldn't reach the server: {error}</p>}
      {puzzles && (
        <ul>
          {puzzles.map(p => (
            <li key={p.id}>
              {p.title} ({p.width}×{p.height})
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
