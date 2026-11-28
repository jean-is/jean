// SPDX-License-Identifier: MIT
// What names a place as the person knows it: the room's creations (ui/creations.js), for a step's line (ui/steps.js). Apart from
// both, since a demo draws steps over the copy's state (ui/reader-state.js), where no module of the room's loads: none is named there.
import { signal } from '@preact/signals-core'

/** A place's name, once the room lists what it holds. */
export const naming = signal(/** @type {((place: string) => string | undefined) | null} */ (null))
