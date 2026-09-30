import { expect, test } from '@playwright/test'

test('local record changes roll back when their sync queue write fails', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/db/myrideDb.ts')
    const { repository } = await import('/src/repositories/localRepository.ts')
    const motorcycle = {
      manufacturer: 'Honda', model: 'CB350', nickname: 'Atomic test',
      currentOdometerKm: 100, active: true,
    }
    async function expectFailure(operation: () => Promise<unknown>, failOn = 1) {
      const originalPut = IDBObjectStore.prototype.put
      let queueWrites = 0
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'syncQueue' && ++queueWrites === failOn) throw new Error('Injected queue failure')
        return Reflect.apply(originalPut, this, args)
      }
      try {
        await operation()
        return false
      } catch {
        return true
      } finally {
        IDBObjectStore.prototype.put = originalPut
      }
    }

    const createFailed = await expectFailure(() => repository.motorcycles.create(motorcycle))
    const afterFailedCreate = await db.motorcycles.count()
    const afterFailedCreateQueueCount = await db.syncQueue.count()
    const saved = await repository.motorcycles.create(motorcycle)
    const updateFailed = await expectFailure(() => repository.motorcycles.update(saved.id, { currentOdometerKm: 200 }))
    const afterFailedUpdate = (await db.motorcycles.get(saved.id))?.currentOdometerKm
    const deleteFailed = await expectFailure(() => repository.motorcycles.remove(saved.id))
    const afterFailedDelete = (await db.motorcycles.get(saved.id))?.deletedAt
    const second = await repository.motorcycles.create({ ...motorcycle, nickname: 'Second', active: false })
    const activeSwitchFailed = await expectFailure(() => repository.motorcycles.setActive(second.id), 2)
    const afterFailedSwitch = [await db.motorcycles.get(saved.id), await db.motorcycles.get(second.id)].map((record) => record?.active)
    const tripCountBefore = await db.trips.count()
    const stopCountBefore = await db.plannedStops.count()
    const compositeFailed = await expectFailure(() => repository.trips.createWithStops({
      title: 'Atomic trip', startDate: '2026-09-29T08:00:00.000Z', origin: { label: 'Start' }, destination: { label: 'Finish' }, status: 'Planned',
    }, [
      { label: 'First stop' },
      { label: 'Second stop' },
    ]), 2)
    const afterFailedComposite = { trips: await db.trips.count() - tripCountBefore, stops: await db.plannedStops.count() - stopCountBefore }
    await repository.motorcycles.update(second.id, { notes: 'First pending edit' })
    await repository.motorcycles.update(second.id, { notes: 'Latest pending edit' })
    const queuedForSecond = await db.syncQueue.where('entityId').equals(second.id).count()
    const queueCount = await db.syncQueue.count()
    return { createFailed, afterFailedCreate, afterFailedCreateQueueCount, updateFailed, afterFailedUpdate, deleteFailed, afterFailedDelete, activeSwitchFailed, afterFailedSwitch, compositeFailed, afterFailedComposite, queuedForSecond, queueCount }
  })

  expect(result).toEqual({
    createFailed: true,
    afterFailedCreate: 0,
    afterFailedCreateQueueCount: 0,
    updateFailed: true,
    afterFailedUpdate: 100,
    deleteFailed: true,
    afterFailedDelete: undefined,
    activeSwitchFailed: true,
    afterFailedSwitch: [true, false],
    compositeFailed: true,
    afterFailedComposite: { trips: 0, stops: 0 },
    queuedForSecond: 1,
    queueCount: 2,
  })
})
