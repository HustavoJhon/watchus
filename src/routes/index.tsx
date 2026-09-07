import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeIndex,
})

function HomeIndex() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <h1 className="text-3xl font-bold">WatchUs</h1>
      <p className="text-muted-foreground">
        Tu colección compartida de películas y series.
      </p>
    </div>
  )
}
