import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginForm() {
  const [mode,     setMode]     = useState('login')   // 'login' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [message,  setMessage]  = useState('')
  const [capsLockOn, setCapsLockOn] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('확인 이메일이 발송되었습니다. 이메일을 확인해 주세요.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message ?? '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent transition'

  const handlePasswordKeyEvent = (event) => {
    setCapsLockOn(Boolean(event.getModifierState?.('CapsLock')))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 leading-none">
            <img
              src="/fintax-icon.png"
              alt=""
              className="h-20 w-20 object-cover"
            />
            <div className="text-left -ml-1">
              <div className="text-[4.25rem] font-black tracking-[-0.02em] text-[#132c7a]">
                fintax
              </div>
              <div className="text-[1.1rem] font-semibold tracking-[0.32em] text-[#1f67e0] text-center mt-1">
                ANALYZER
              </div>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-sm text-gray-500">금융자산 평가 &amp; 세무자동화</p>
          </div>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-800 mb-6 text-center">
            {mode === 'login' ? '로그인' : '회원가입'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                이메일
              </label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                비밀번호
              </label>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setCapsLockOn(Boolean(e.getModifierState?.('CapsLock')))
                }}
                onKeyDown={handlePasswordKeyEvent}
                onKeyUp={handlePasswordKeyEvent}
                onFocus={handlePasswordKeyEvent}
                onBlur={() => setCapsLockOn(false)}
                placeholder={mode === 'signup' ? '8자 이상 입력' : '비밀번호 입력'}
                minLength={mode === 'signup' ? 8 : undefined}
                required
              />
              {capsLockOn && (
                <p className="mt-1.5 text-xs font-medium text-amber-600">
                  Caps Lock이 켜져 있습니다.
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            {message && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-navy text-white font-bold text-sm
                         hover:bg-midblue transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-500">
            {mode === 'login' ? (
              <>
                계정이 없으신가요?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); setMessage('') }}
                  className="text-navy font-semibold hover:underline"
                >
                  회원가입
                </button>
              </>
            ) : (
              <>
                이미 계정이 있으신가요?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); setMessage('') }}
                  className="text-navy font-semibold hover:underline"
                >
                  로그인
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          법인세법 §42③ 기준 · 참고용 계산서
        </p>
      </div>
    </div>
  )
}
