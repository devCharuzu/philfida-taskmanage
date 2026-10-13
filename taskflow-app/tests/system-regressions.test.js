import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { after, test } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, resolveConfig } from 'vite'

let regressionServerIndex = 0
const regressionCacheRoot = join(tmpdir(), `taskflow-app-regression-vite-cache-${process.pid}`)
const nextRegressionCacheDir = () => join(
  regressionCacheRoot,
  `server-${regressionServerIndex++}`,
)

const originalLocalStorage = globalThis.localStorage
const originalSessionStorage = globalThis.sessionStorage

function installMemoryStorage(getInitialValue = () => null) {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : getInitialValue(key),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
}

after(async () => {
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
  if (originalSessionStorage === undefined) delete globalThis.sessionStorage
  else globalThis.sessionStorage = originalSessionStorage
  await rm(regressionCacheRoot, { recursive: true, force: true })
})

test('store hydration never logs persisted credentials', async () => {
  const passwordSentinel = 'fixture-only-secret-9d7a'
  const persistedState = JSON.stringify({
    state: { session: { ID: 'TEST-ID', Password: passwordSentinel } },
    version: 2,
  })
  installMemoryStorage((key) => key === 'philfida_session' ? persistedState : null)

  const logs = []
  const originalLog = console.log
  console.log = (...args) => logs.push(args)
  try {
    await import(`../src/store/useStore.js?credential-regression=${Date.now()}`)
  } finally {
    console.log = originalLog
  }

  assert.equal(
    logs.some((args) => JSON.stringify(args).includes(passwordSentinel)),
    false,
    'the persisted session password must not appear in console output',
  )
})

test('getData rejects a partial snapshot when any Supabase read fails', async () => {
  installMemoryStorage()
  const failure = new Error('fixture permission failure')
  const fakeSupabase = {
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      const result = table === 'Tasks'
        ? { data: null, error: failure }
        : { data: [], error: null }
      const query = {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return this },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
      }
      return query
    },
  }
  const mockSupabasePlugin = {
    name: 'system-regression-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) {
        return '\0system-regression-supabase'
      }
    },
    load(id) {
      if (id === '\0system-regression-supabase') {
        return 'export const supabase = globalThis.__systemRegressionSupabase'
      }
    },
  }
  globalThis.__systemRegressionSupabase = fakeSupabase

  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { getData } = await server.ssrLoadModule('/src/lib/api.js')
    await assert.rejects(
      getData('TEST-ID', 'Region I'),
      /fixture permission failure/,
    )
  } finally {
    delete globalThis.__systemRegressionSupabase
    await server.close()
  }
})

test('getData remains available before the shared availability migration is installed', async () => {
  installMemoryStorage()
  const fakeSupabase = {
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.user_get_presence_schedules in the schema cache' },
    }),
    from() {
      const query = {
        select() { return this },
        eq() { return this },
        order() { return this },
        limit() { return this },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
      }
      return query
    },
  }
  globalThis.__systemRegressionSupabase = fakeSupabase
  const mockSupabasePlugin = {
    name: 'missing-availability-rpc-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) return '\0missing-availability-rpc-supabase'
    },
    load(id) {
      if (id === '\0missing-availability-rpc-supabase') return 'export const supabase = globalThis.__systemRegressionSupabase'
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { getData } = await server.ssrLoadModule('/src/lib/api.js')
    const data = await getData('VIEWER-1', 'Region I')
    assert.deepEqual(data.availabilitySchedules, [])
  } finally {
    delete globalThis.__systemRegressionSupabase
    await server.close()
  }
})

test('travel and leave schedule writes explain a missing shared RPC and never hide failed cancellation', async () => {
  installMemoryStorage()
  const rpcCalls = []
  globalThis.__systemRegressionSupabase = {
    rpc(name, args) {
      rpcCalls.push({ name, args })
      return Promise.resolve({
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${name}(p_schedule, p_user_id, p_verify_password) in the schema cache`,
        },
      })
    },
  }
  const mockSupabasePlugin = {
    name: 'missing-shared-schedule-write-rpcs-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) {
        return '\0missing-shared-schedule-write-rpcs-supabase'
      }
    },
    load(id) {
      if (id === '\0missing-shared-schedule-write-rpcs-supabase') {
        return 'export const supabase = globalThis.__systemRegressionSupabase'
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { savePresenceSchedule, cancelPresenceSchedule } = await server.ssrLoadModule('/src/lib/api.js')
    const migrationSql = await readFile(new URL('../../supabase/migrations/20261013040000_shared_presence_schedules.sql', import.meta.url), 'utf8')
    const travelSchedule = { ID: 'TRAVEL-1', Type: 'travel' }
    const leaveSchedule = { ID: 'LEAVE-1', Type: 'leave' }
    const travelSaveError = await savePresenceSchedule('STAFF-1', travelSchedule).then(() => null, error => error)
    const leaveSaveError = await savePresenceSchedule('STAFF-1', leaveSchedule).then(() => null, error => error)
    const cancelError = await cancelPresenceSchedule('STAFF-1', 'TRAVEL-1').then(() => null, error => error)

    assert.match(travelSaveError?.message || '', /shared schedule database update is missing/i)
    assert.match(leaveSaveError?.message || '', /shared schedule database update is missing/i)
    assert.match(cancelError?.message || '', /shared schedule database update is missing/i)
    assert.match(migrationSql, /user_save_presence_schedule\(\s*p_user_id text,\s*p_verify_password text,\s*p_schedule jsonb/is)
    assert.match(migrationSql, /NOTIFY pgrst, 'reload schema'/i)
    assert.deepEqual(rpcCalls, [
      {
        name: 'user_save_presence_schedule',
        args: { p_user_id: 'STAFF-1', p_verify_password: '', p_schedule: travelSchedule },
      },
      {
        name: 'user_save_presence_schedule',
        args: { p_user_id: 'STAFF-1', p_verify_password: '', p_schedule: leaveSchedule },
      },
      {
        name: 'user_cancel_presence_schedule',
        args: { p_user_id: 'STAFF-1', p_verify_password: '', p_schedule_id: 'TRAVEL-1' },
      },
    ])
  } finally {
    delete globalThis.__systemRegressionSupabase
    await server.close()
  }
})

test('unread tracking matches HiddenBy names as complete tokens', async () => {
  installMemoryStorage()
  globalThis.__systemRegressionSupabase = { from: () => { throw new Error('unexpected query') } }
  const mockSupabasePlugin = {
    name: 'system-regression-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) {
        return '\0system-regression-supabase'
      }
    },
    load(id) {
      if (id === '\0system-regression-supabase') {
        return 'export const supabase = globalThis.__systemRegressionSupabase'
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { getUnreadCommentCount } = await server.ssrLoadModule('/src/lib/api.js')
    const count = getUnreadCommentCount([
      { TaskID: 'T-1', SenderName: 'Jordan', HiddenBy: 'Anna' },
    ], 'T-1', 'Ann')
    assert.equal(count, 1, 'Anna having read a message must not mark it read for Ann')
  } finally {
    delete globalThis.__systemRegressionSupabase
    await server.close()
  }
})

test('Director dispatch drawer does not reference removed personnel modal setters', async () => {
  const directorPage = await readFile(new URL('../src/pages/DirectorPage.jsx', import.meta.url), 'utf8')
  const createTaskForm = directorPage.match(/<CreateTaskForm\b[\s\S]*?\/>/)?.[0]

  assert.ok(createTaskForm, 'DirectorPage should render the shared dispatch form')
  assert.doesNotMatch(
    createTaskForm,
    /setPersonnelModalOpen|setSelectedPersonnel/,
    'the Director personnel modal is owned by PersonnelStatusPanel, not the old RecordsPage state',
  )
  assert.match(
    directorPage,
    /personnelPanelRef\.current\?\.close\(\)/,
    'opening the dispatch drawer should close the extracted personnel panel',
  )
})

test('Leaflet is pre-optimized before the lazy LocationPicker is opened', async () => {
  const config = await resolveConfig({
    configFile: new URL('../vite.config.js', import.meta.url).pathname,
  }, 'serve')

  assert.ok(
    config.optimizeDeps.include?.includes('leaflet'),
    'opening LocationPicker must not discover Leaflet after the page has loaded',
  )
})

test('concurrent startup effects share one push subscription request', async () => {
  const originalWindow = globalThis.window
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalVapidKey = process.env.VITE_VAPID_PUBLIC_KEY
  let subscribeCalls = 0
  const subscription = { toJSON: () => ({ endpoint: 'https://push.invalid/subscription' }) }
  const registration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => {
        subscribeCalls += 1
        await new Promise(resolve => setTimeout(resolve, 10))
        return subscription
      },
    },
  }

  globalThis.window = {
    PushManager: class PushManager {},
    Notification: class Notification {},
    atob: () => '\u0001\u0002\u0003',
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        register: async () => ({}),
        ready: Promise.resolve(registration),
      },
    },
  })
  process.env.VITE_VAPID_PUBLIC_KEY = 'AQID'

  const server = await createServer({
    configFile: false,
    envFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { subscribeToPush } = await server.ssrLoadModule('/src/lib/notifications.js')
    const subscriptions = await Promise.all([subscribeToPush(), subscribeToPush()])

    assert.equal(subscribeCalls, 1, 'StrictMode startup replay must not race two browser subscriptions')
    assert.deepEqual(subscriptions, [subscription.toJSON(), subscription.toJSON()])
  } finally {
    await server.close()
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalNavigator === undefined) delete globalThis.navigator
    else Object.defineProperty(globalThis, 'navigator', originalNavigator)
    if (originalVapidKey === undefined) delete process.env.VITE_VAPID_PUBLIC_KEY
    else process.env.VITE_VAPID_PUBLIC_KEY = originalVapidKey
  }
})

test('getData includes future availability schedules across account regions', async () => {
  const sessionPassword = 'fixture-only-password'
  installMemoryStorage(key => key === 'philfida_session'
    ? JSON.stringify({ state: { session: { ID: 'VIEWER-REGION-I', Password: sessionPassword } }, version: 2 })
    : null)
  const upcomingSchedule = {
    ID: 'schedule-1',
    UserID: 'EMP-OTHER-REGION',
    EmployeeName: 'Taylor Example',
    Region: 'Region XI',
    Type: 'travel',
    StartDate: '2026-11-02',
    EndDate: '2026-11-04',
  }
  const requestedFilters = new Map()
  const rpcCalls = []
  const fakeSupabase = {
    rpc(name, args) {
      rpcCalls.push({ name, args })
      return Promise.resolve({ data: [upcomingSchedule], error: null })
    },
    from(table) {
      const filters = []
      requestedFilters.set(table, filters)
      const query = {
        select() { return this },
        eq(column, value) { filters.push([column, value]); return this },
        order() { return this },
        limit() { return this },
        then(resolve, reject) {
          const data = table === 'Users'
              ? [{ ID: 'EMP-LOCAL-REGION', Region: 'Region I' }]
              : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  globalThis.__systemRegressionSupabase = fakeSupabase
  const mockSupabasePlugin = {
    name: 'shared-availability-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) {
        return '\0shared-availability-supabase'
      }
    },
    load(id) {
      if (id === '\0shared-availability-supabase') {
        return 'export const supabase = globalThis.__systemRegressionSupabase'
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { getData } = await server.ssrLoadModule('/src/lib/api.js')
    const data = await getData('VIEWER-REGION-I', 'Region I')

    assert.deepEqual(data.availabilitySchedules, [upcomingSchedule])
    assert.deepEqual(rpcCalls, [{
      name: 'user_get_presence_schedules',
      args: { p_user_id: 'VIEWER-REGION-I', p_verify_password: sessionPassword },
    }], 'the current account should authenticate before receiving the global schedule list')
    assert.equal(requestedFilters.has('PresenceSchedules'), false, 'the public client must not read schedule details directly')
  } finally {
    delete globalThis.__systemRegressionSupabase
    await server.close()
  }
})

test('dispatch creates one distinct task and notification per selected person', async () => {
  installMemoryStorage()
  const inserts = []
  let notificationId = 0
  let failHistoryWrites = false
  const fakeSupabase = {
    from(table) {
      const query = {
        payload: null,
        insert(payload) {
          this.payload = payload
          inserts.push({ table, payload })
          return this
        },
        select() { return this },
        single() {
          return Promise.resolve({ data: { ID: ++notificationId }, error: null })
        },
        then(resolve, reject) {
          const error = failHistoryWrites && table === 'TaskHistory'
            ? new Error('fixture history write failure')
            : null
          return Promise.resolve({ data: null, error }).then(resolve, reject)
        },
      }
      return query
    },
  }
  globalThis.__systemRegressionSupabase = fakeSupabase
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true })
  const mockSupabasePlugin = {
    name: 'multi-dispatch-supabase-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './supabase' && importer?.endsWith('/src/lib/api.js')) {
        return '\0multi-dispatch-supabase'
      }
    },
    load(id) {
      if (id === '\0multi-dispatch-supabase') {
        return 'export const supabase = globalThis.__systemRegressionSupabase'
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockSupabasePlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { createTasks } = await server.ssrLoadModule('/src/lib/api.js')
    await createTasks({
      recipients: [
        { empId: 'EMP-1', empName: 'Alex One' },
        { empId: 'EMP-2', empName: 'Bailey Two' },
      ],
      title: 'Prepare the field report',
      instructions: 'Please draft reply',
      actorName: 'Unit Head',
    })

    const tasks = inserts.find(entry => entry.table === 'Tasks')?.payload
    const notifications = inserts.filter(entry => entry.table === 'Notifications')
    const history = inserts.filter(entry => entry.table === 'TaskHistory')
    assert.equal(tasks?.length, 2)
    assert.deepEqual(tasks.map(task => task.EmployeeID), ['EMP-1', 'EMP-2'])
    assert.equal(new Set(tasks.map(task => task.TaskID)).size, 2, 'each recipient needs a distinct task id')
    assert.equal(notifications.length, 2, 'each recipient should receive a task notification')
    assert.equal(history.length, 2, 'each task should get a dispatch history entry')

    failHistoryWrites = true
    const previousConsoleError = console.error
    const dispatchErrors = []
    console.error = (...args) => dispatchErrors.push(args)
    let taskIds
    try {
      taskIds = await createTasks({
        recipients: [{ empId: 'EMP-3', empName: 'Casey Three' }],
        title: 'Do not duplicate on a history failure',
      })
    } finally {
      console.error = previousConsoleError
    }
    assert.equal(taskIds.length, 1, 'ancillary history logging must not report an already-created task as failed')
    assert.equal(dispatchErrors.length, 1, 'the failed history write should be visible for diagnosis')
  } finally {
    delete globalThis.__systemRegressionSupabase
    globalThis.fetch = originalFetch
    await server.close()
  }
})

test('scheduled presence activates from shared data during its scheduled window', async () => {
  installMemoryStorage()
  const updates = []
  globalThis.__systemRegressionStore = {
    session: { ID: 'EMP-1', Status: 'Available' },
    globalData: { users: [{ ID: 'EMP-1', Status: 'Available' }] },
  }
  globalThis.__systemRegressionAvailability = {
    getPresenceSchedules: async userId => {
      assert.equal(userId, 'EMP-1')
      return [{
        ID: 'schedule-today',
        UserID: 'EMP-1',
        Type: 'leave',
        StartDate: '2026-10-13',
        StartTime: '08:00:00',
        EndDate: '2026-10-13',
        EndTime: '17:00:00',
        LeaveType: 'Vacation Leave',
        LeaveReason: 'Fixture only',
      }, {
        ID: 'someone-elses-trip', UserID: 'EMP-OTHER', Type: 'travel',
        StartDate: '2026-10-13', StartTime: '09:00:00',
        EndDate: '2026-10-13', EndTime: '17:00:00',
      }]
    },
    updatePresence: async (userId, status) => {
      updates.push({ userId, status })
      globalThis.__systemRegressionStore.session.Status = status
    },
    uploadFiles: async () => '',
    getSignedFileUrl: async () => '',
    buildTravelStatus: () => 'Official Travel',
  }
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent
  globalThis.window = { dispatchEvent: () => true }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail }
  }
  const mockApiPlugin = {
    name: 'shared-presence-scheduler-api-mock',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../store/useStore' && importer?.endsWith('/src/components/PersonalCalendarTab.jsx')) {
        return '\0shared-presence-scheduler-store'
      }
      if (source === '../lib/api' && importer?.endsWith('/src/components/PersonalCalendarTab.jsx')) {
        return '\0shared-presence-scheduler-api'
      }
    },
    load(id) {
      if (id === '\0shared-presence-scheduler-store') {
        return 'export const useStore = { getState: () => globalThis.__systemRegressionStore }'
      }
      if (id === '\0shared-presence-scheduler-api') {
        return `
          export const getPresenceSchedules = (...args) => globalThis.__systemRegressionAvailability.getPresenceSchedules(...args)
          export const updatePresence = (...args) => globalThis.__systemRegressionAvailability.updatePresence(...args)
          export const uploadFiles = (...args) => globalThis.__systemRegressionAvailability.uploadFiles(...args)
          export const getSignedFileUrl = (...args) => globalThis.__systemRegressionAvailability.getSignedFileUrl(...args)
          export const buildTravelStatus = (...args) => globalThis.__systemRegressionAvailability.buildTravelStatus(...args)
        `
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockApiPlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { checkAndApplyScheduledPresence } = await server.ssrLoadModule('/src/components/PersonalCalendarTab.jsx')
    await checkAndApplyScheduledPresence('EMP-1', null, new Date('2026-10-13T04:00:00.000Z'))
    await checkAndApplyScheduledPresence('EMP-1', null, new Date('2026-10-13T04:00:30.000Z'))
    assert.deepEqual(updates, [{
      userId: 'EMP-1',
      status: 'On Leave — Vacation Leave: Fixture only (2026-10-13 to 2026-10-13)',
    }])
  } finally {
    delete globalThis.__systemRegressionAvailability
    delete globalThis.__systemRegressionStore
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = originalCustomEvent
    await server.close()
  }
})

test('dispatch selection flags current and future availability for selected recipients', async () => {
  const { getDispatchRecipients } = await import('../src/lib/dispatch.js')
  const users = [
    { ID: 'EMP-1', Name: 'Alex One', AccountStatus: 'Active', Role: 'Employee', Status: 'Available' },
    { ID: 'EMP-2', Name: 'Bailey Two', AccountStatus: 'Active', Role: 'Employee', Status: 'Official Travel — Current' },
    { ID: 'EMP-3', Name: 'Casey Three', AccountStatus: 'Active', Role: 'Employee', Status: 'Available' },
    { ID: 'EMP-4', Name: 'Inactive Four', AccountStatus: 'Deactivated', Role: 'Employee', Status: 'Available' },
  ]
  const schedules = [{
    ID: 'future-leave', UserID: 'EMP-3', Type: 'leave',
    StartDate: '2026-11-03', StartTime: '08:00:00',
    EndDate: '2026-11-04', EndTime: '17:00:00',
  }]

  const result = getDispatchRecipients(users, ['EMP-1', 'EMP-2', 'EMP-3', 'EMP-4'], schedules, new Date('2026-10-13T04:00:00.000Z'))
  assert.deepEqual(result.recipients.map(person => person.ID), ['EMP-1', 'EMP-2', 'EMP-3'])
  assert.deepEqual(result.warnings.map(person => person.ID), ['EMP-2', 'EMP-3'])
  assert.equal(result.warnings[1].upcomingSchedules[0].ID, 'future-leave')
})

test('dispatch form renders accessible multi-select recipients and advance availability', async () => {
  installMemoryStorage()
  const mockUiPlugin = {
    name: 'dispatch-form-render-mocks',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../lib/api' && importer?.endsWith('/src/components/CreateTaskForm.jsx')) {
        return '\0dispatch-form-api'
      }
      if (source === '../store/useStore' && importer?.endsWith('/src/components/CreateTaskForm.jsx')) {
        return '\0dispatch-form-store'
      }
    },
    load(id) {
      if (id === '\0dispatch-form-api') return 'export const createTasks = async () => []'
      if (id === '\0dispatch-form-store') {
        return `
          const state = { session: { Name: 'Unit Head' } }
          export const useStore = Object.assign(selector => selector(state), { getState: () => state })
        `
      }
    },
  }
  const server = await createServer({
    configFile: false,
    cacheDir: nextRegressionCacheDir(),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [mockUiPlugin],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    const { default: CreateTaskForm } = await server.ssrLoadModule('/src/components/CreateTaskForm.jsx')
    const markup = renderToStaticMarkup(createElement(CreateTaskForm, {
      users: [
        { ID: 'EMP-1', Name: 'Alex One', Unit: 'Planning', Role: 'Employee', AccountStatus: 'Active', Status: 'Available' },
        { ID: 'EMP-2', Name: 'Bailey Two', Unit: 'Research', Role: 'Employee', AccountStatus: 'Active', Status: 'Available' },
      ],
      availabilitySchedules: [{
        ID: 'future-trip', UserID: 'EMP-2', EmployeeName: 'Bailey Two', Region: 'Region XI',
        Type: 'travel', StartDate: '2026-11-02', StartTime: '08:00:00', EndDate: '2026-11-04', EndTime: '17:00:00',
        TravelActivity: 'Field visit', TravelLocation: 'Manila',
      }],
      onSync: async () => {},
      dispatchConfirm: null,
      setDispatchConfirm: () => {},
      pendingDispatch: null,
      setPendingDispatch: () => {},
    }))

    assert.match(markup, /type="checkbox"[^>]*aria-label="Assign task to Alex One"/)
    assert.match(markup, /type="checkbox"[^>]*aria-label="Assign task to Bailey Two"/)
    assert.match(markup, /Select available/)
    assert.match(markup, /Upcoming Official Travel/)
    assert.match(markup, /Dispatch to 0 people/)
    const { default: DispatchAvailabilityConfirm } = await server.ssrLoadModule('/src/components/DispatchAvailabilityConfirm.jsx')
    const schedule = {
      ID: 'future-trip', Type: 'travel', StartDate: '2026-11-02', StartTime: '08:00:00',
      EndDate: '2026-11-04', EndTime: '17:00:00', TravelActivity: 'Field visit', TravelLocation: 'Manila',
    }
    const confirmationMarkup = renderToStaticMarkup(createElement(DispatchAvailabilityConfirm, {
      dispatchConfirm: {
        recipients: [
          { ID: 'EMP-1', Name: 'Alex One', Unit: 'Planning', Status: 'Available' },
          { ID: 'EMP-2', Name: 'Bailey Two', Unit: 'Research', Status: 'Available' },
        ],
        warnings: [{ ID: 'EMP-2', Name: 'Bailey Two', Status: 'Available', upcomingSchedules: [schedule] }],
      },
      pendingDispatch: { title: '[004] Prepare the field report' },
      onCancel: () => {},
      onConfirm: async () => {},
    }))

    assert.match(confirmationMarkup, /Availability notice/)
    assert.match(confirmationMarkup, /Alex One/)
    assert.match(confirmationMarkup, /Bailey Two/)
    assert.match(confirmationMarkup, /Scheduled Official Travel/)
    assert.match(confirmationMarkup, /Nov 2 – Nov 4/)
    assert.match(confirmationMarkup, /Dispatch to 2 people/)
  } finally {
    await server.close()
  }
})
