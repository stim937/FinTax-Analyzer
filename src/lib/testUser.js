const runtimeEnv = import.meta.env ?? {}

const TEST_USER_SESSION_KEY = 'fintax:test-user-session'

export const TEST_USER_ID = 'local-test-user'
export const TEST_USER_EMAIL = 'test@fintax.local'

export function createTestUser() {
  return {
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    isTestUser: true,
    app_metadata: {},
    user_metadata: {
      name: '테스트 회원',
    },
  }
}

export function isTestUser(user) {
  return Boolean(user?.isTestUser || user?.id === TEST_USER_ID)
}

export function shouldEnableTestUser(env = runtimeEnv) {
  return Boolean(env?.DEV || env?.VITE_ENABLE_TEST_USER === 'true')
}

export const isTestUserEnabled = shouldEnableTestUser()

export function loadTestUserSession(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(TEST_USER_SESSION_KEY) === 'active'
      ? createTestUser()
      : null
  } catch {
    return null
  }
}

export function saveTestUserSession(storage = globalThis.localStorage) {
  try {
    storage?.setItem(TEST_USER_SESSION_KEY, 'active')
    return true
  } catch {
    return false
  }
}

export function clearTestUserSession(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(TEST_USER_SESSION_KEY)
    return true
  } catch {
    return false
  }
}
