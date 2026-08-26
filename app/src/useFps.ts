import { useEffect, useRef, useState } from 'react'

/** Rolling frame rate, plus the worst sustained value seen while `sampling`. */
export function useFps(sampling: boolean): { fps: number; worst: number } {
  const [fps, setFps] = useState(0)
  const [worst, setWorst] = useState(Number.POSITIVE_INFINITY)
  const active = useRef(sampling)
  active.current = sampling

  useEffect(() => {
    if (sampling) setWorst(Number.POSITIVE_INFINITY)
  }, [sampling])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc: number[] = []
    let stopped = false
    const tick = (now: number): void => {
      const dt = now - last
      last = now
      if (dt > 0 && dt < 500) {
        acc.push(1000 / dt)
        if (acc.length > 20) acc.shift()
        const avg = acc.reduce((a, b) => a + b, 0) / acc.length
        setFps(avg)
        if (active.current && acc.length >= 8) setWorst((w) => Math.min(w, avg))
      }
      if (!stopped) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [])

  return { fps, worst }
}
