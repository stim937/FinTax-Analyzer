import { useState } from 'react'

/**
 * 숫자 입력창 — 포커스 해제 시 천단위 쉼표 자동 표시
 * props: value(number), onChange(number => void), className, min, step, placeholder
 */
export default function FormattedInput({ value, onChange, className = '', min, step, placeholder, disabled }) {
  const [editing, setEditing] = useState(false)

  const display = editing
    ? (value === 0 ? '' : String(value))
    : (value === 0 ? '' : Number(value).toLocaleString('ko-KR'))

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.-]/g, '')
    const num = raw === '' ? 0 : Number(raw)
    if (!isNaN(num)) onChange(num)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      placeholder={placeholder ?? (editing ? '' : '0')}
      disabled={disabled}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={handleChange}
    />
  )
}
