export default function Spinner({ size = 'md', label = '계산 중...' }) {
  const dim = {
    xs: 'w-3.5 h-3.5 border-2',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-[3px]',
  }[size] ?? 'w-6 h-6 border-2'
  return (
    <span className="inline-flex items-center gap-2 text-gray-400 text-sm" role="status" aria-live="polite">
      <span className={`${dim} border-gray-200 border-t-midblue rounded-full animate-spin`} />
      {label && <span>{label}</span>}
    </span>
  )
}
