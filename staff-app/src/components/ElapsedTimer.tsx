import { useState, useEffect } from 'react'

interface Props {
  startedAt: Date | null
}

export function ElapsedTimer({ startedAt }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const m = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const s = (elapsed % 60).toString().padStart(2, '0')
  const isLong = elapsed > 300 // warn after 5 min

  return (
    <div className={`text-5xl font-bold tabular-nums tracking-tight ${isLong ? 'text-amber-brand' : 'text-gray-800'}`}>
      {m}:{s}
    </div>
  )
}
