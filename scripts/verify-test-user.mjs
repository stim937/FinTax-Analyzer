import assert from 'node:assert/strict'

import {
  TEST_USER_EMAIL,
  TEST_USER_ID,
  clearTestUserSession,
  createTestUser,
  isTestUser,
  loadTestUserSession,
  saveTestUserSession,
  shouldEnableTestUser,
} from '../src/lib/testUser.js'

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

const testUser = createTestUser()
assert.equal(testUser.id, TEST_USER_ID)
assert.equal(testUser.email, TEST_USER_EMAIL)
assert.equal(testUser.isTestUser, true)
assert.equal(isTestUser(testUser), true)
assert.equal(isTestUser({ id: 'real-user' }), false)

const storage = createMemoryStorage()
assert.equal(loadTestUserSession(storage), null)
assert.equal(saveTestUserSession(storage), true)
assert.deepEqual(loadTestUserSession(storage), testUser)
assert.equal(clearTestUserSession(storage), true)
assert.equal(loadTestUserSession(storage), null)

assert.equal(shouldEnableTestUser({ DEV: true }), true)
assert.equal(shouldEnableTestUser({ VITE_ENABLE_TEST_USER: 'true' }), true)
assert.equal(shouldEnableTestUser({ DEV: false }), false)

console.log('verify-test-user: ok')
