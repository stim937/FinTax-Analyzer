export default function Tooltip({ text, position = 'top', children }) {
  const posClass = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  }[position]

  const arrowClass = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-gray-800',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-gray-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-gray-800',
  }[position]

  return (
    <span className="relative inline-flex items-center group">
      {children}
      <button
        type="button"
        tabIndex={-1}
        aria-label="도움말"
        className="ml-1 w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold
                   inline-flex items-center justify-center flex-shrink-0
                   hover:bg-midblue hover:text-white transition-colors cursor-help"
      >
        ?
      </button>
      <div className={`absolute ${posClass} z-50 pointer-events-none
                       opacity-0 group-hover:opacity-100 transition-opacity duration-150`}>
        <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 w-56 shadow-xl leading-relaxed whitespace-normal">
          {text}
          <span className={`absolute border-4 border-transparent ${arrowClass}`} />
        </div>
      </div>
    </span>
  )
}
