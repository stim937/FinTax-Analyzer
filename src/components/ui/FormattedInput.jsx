import { useState } from 'react'

/**
 * 숫자 입력창 — 포커스 해제 시 천단위 쉼표 자동 표시
 * props: value(number), onChange(number => void), className, min, step, placeholder
 */
export default function FormattedInput({
  value, onChange, className = '',
  min, step = 1, placeholder, disabled, readOnly,
}) {
  // 편집 중에만 사용하는 로컬 문자열 (포맷 없는 순수 입력값)
  const [localStr, setLocalStr] = useState(null)
  const editing = localStr !== null

  const handleFocus = () => {
    // 0이면 빈 문자열로 시작 → "0" 뒤에 숫자가 붙는 현상 방지
    setLocalStr(value === 0 ? '' : String(value))
  }

  const handleBlur = () => {
    const num = localStr === '' ? 0 : Number(localStr)
    const clamped = (min !== undefined && !isNaN(num)) ? Math.max(min, num) : num
    onChange(isNaN(clamped) ? 0 : clamped)
    setLocalStr(null)
  }

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    setLocalStr(raw)
    const num = Number(raw)
    if (!isNaN(num) && raw !== '') {
      onChange(min !== undefined && num < min ? min : num)
    }
  }

  const handleWheel = (e) => {
    if (!editing) return
    e.preventDefault()
    const delta    = e.deltaY < 0 ? 1 : -1
    const newValue = Number(value) + delta * step
    const clamped  = min !== undefined ? Math.max(min, newValue) : newValue
    const rounded  = Number(clamped.toFixed(10))
    onChange(rounded)
    setLocalStr(String(rounded))
  }

  const displayValue = editing
    ? localStr
    : (value === 0 ? '' : Number(value).toLocaleString('ko-KR'))

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={displayValue}
      placeholder={placeholder ?? '0'}
      disabled={disabled}
      readOnly={readOnly}
      onFocus={readOnly ? undefined : handleFocus}
      onBlur={readOnly ? undefined : handleBlur}
      onChange={readOnly ? undefined : handleChange}
      onWheel={readOnly ? undefined : handleWheel}
    />
  )
}
