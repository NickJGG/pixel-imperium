import { Link, getRouteApi } from '@tanstack/react-router'
import styles from './PuzzleList.module.css'

const route = getRouteApi('/')

export function PuzzleList() {
  const puzzles = route.useLoaderData()
  return (
    <main className={styles.list}>
      <h1>Puzzles</h1>
      <ul>
        {puzzles.map(p => (
          <li key={p.id}>
            <Link to="/play/$id" params={{ id: p.id }}>
              {p.title}
            </Link>{' '}
            <span className={styles.size}>
              {p.width}×{p.height}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
