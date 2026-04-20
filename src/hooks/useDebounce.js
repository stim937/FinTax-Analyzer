import { useState, useEffect, useRef } from 'react'

/**
 * 값이 바뀌면 타이머를 리셋하고, delay ms 동안 변화가 없을 때 비로소 반환값을 갱신.
 * isPending: 라이브 값 ≠ 디바운스 값 (스피너 표시용)
 */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  const [isPending, setIsPending] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    setIsPending(true)
    const timer = setTimeout(() => {
      setDebounced(value)
      setIsPending(false)
    }, delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return { debounced, isPending }
}
