// Use Jean on all your devices: Settings › Your devices › Add a device, its QR code or link opened on the other
// device (or pasted after Bring it here on its first screen), the six digits that device shows typed back here,
// then Is this yours? there; what follows (brains, keys, settings, projects, then tasks and files, sealed), what each
// device keeps for itself, Safari's Home Screen, the desktop app's link, and removing a device, erasing Jean from it
// (D700, D721).
import { helpArticle } from '../help.js'

export default helpArticle({
  addresses: { en: 'help/on-all-your-devices', fr: 'fr/aide/sur-tous-vos-appareils' },
  kind: 'howto',
  moment: 'safe',
  minutes: 3,
  names: {
    settings: 'settings.title', devices: 'cap.devices.name', capabilities: 'settings.capabilities', add: 'devices.add', bring: 'welcome.bring', join: 'devices.join',
    yours: 'devices.yours', mine: 'devices.mine', stop: 'devices.stop', remove: 'action.remove', erase: 'devices.erase', safari: 'devices.inSafari', other: 'devices.joinOther',
  },
  steps: [{}, {}, {}, {}, {}],
  also: ['where-kept', 'back-up', 'together'],
})
