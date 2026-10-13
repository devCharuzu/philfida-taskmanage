import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

const future = (id, type = 'travel') => ({ ID: id, Type: type, EmployeeName: 'Test Personnel', StartDate: '2099-11-02', EndDate: '2099-11-04' })

test('scheduling welcome, dismissal, new advance filings, and account isolation', async () => {
  const values = new Map()
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
  globalThis.window = new EventTarget()
  globalThis.document = { body: {} }
  const server = await createServer({
    configFile: false, cacheDir: '/tmp/taskflow-modal-tests',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
    plugins: [{ name: 'portal-test-target', enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('UpcomingAvailabilityPanel.jsx')) return code.replace("import { createPortal } from 'react-dom'", 'const createPortal = children => children')
      },
    }],
  })
  let view
  try {
    const { default: Panel } = await server.ssrLoadModule('/src/components/UpcomingAvailabilityPanel.jsx')
    const { useStore } = await server.ssrLoadModule('/src/store/useStore.js')
    const update = async schedules => act(async () => { view.update(createElement(Panel, { schedules })) })
    const dialogs = () => view.root.findAllByProps({ role: 'dialog' })
    const close = async () => act(async () => { view.root.findByProps({ 'aria-label': 'Close scheduled availability' }).props.onClick() })
    for (const role of ['Employee', 'Director', 'Records', 'Unit Head']) {
      await act(async () => { useStore.getState().setSession({ ID: role, Role: role, Name: 'Test' }); view = create(createElement(Panel, { schedules: [] })) })
      assert.equal(dialogs().length, 1, `${role}: welcome must open even before schedules arrive`)
      await update([future('first')])
      await close()
      await update([future('first')])
      assert.equal(dialogs().length, 0, 'unchanged polling must not reopen')
      await update([future('first'), future('advance-leave', 'leave')])
      assert.equal(dialogs().length, 1, 'new advance leave must open immediately')
      await close()
      await update([future('first'), future('advance-leave', 'leave'), future('advance-travel')])
      assert.equal(dialogs().length, 1, 'new advance travel must open immediately')
      await act(async () => { view.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }) })
      await close()
      await update([future('another')])
      assert.equal(dialogs().length, 0, 'opt-out must suppress automatic popups')
      await act(async () => { view.unmount(); useStore.getState().clearSession(); useStore.getState().setSession({ ID: role, Role: role }); view = create(createElement(Panel, { schedules: [future('another')] })) })
      assert.equal(dialogs().length, 0, 'opt-out must persist on next login')
      await act(async () => { window.dispatchEvent(new Event('open-availability-schedules')) })
      assert.equal(dialogs().length, 1, 'manual opening must remain available')
      await act(async () => { view.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: false } }) })
      await close()
      await act(async () => { view.unmount(); useStore.getState().clearSession(); useStore.getState().setSession({ ID: role, Role: role }); view = create(createElement(Panel, { schedules: [] })) })
      assert.equal(dialogs().length, 1, 'next login must show welcome again without opt-out')
      await act(async () => { view.unmount(); useStore.getState().clearSession() })
    }
  } finally {
    if (view) await act(async () => view.unmount())
    await server.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.localStorage
  }
})
