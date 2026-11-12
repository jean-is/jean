// SPDX-License-Identifier: MIT
// A part of Settings drawn from a module of its own, loaded the first time it shows.
import { signal } from '@preact/signals-core'
import { nothing } from 'lit-html'

/** @param {() => Promise<{ section: () => unknown }>} load */
export const lazyPage = (load, page = signal(/** @type {(() => unknown) | null} */ (null)), paging = false) => () => {
  if (!paging) { paging = true; load().then((module) => { page.value = module.section }) }
  return page.value?.() ?? nothing
}
