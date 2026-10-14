// The sounds package, @codename/jean-sounds (D338): the instruments a score plays, MS Basic,
// MuseScore's General MIDI bank (MIT), as a file for each group of its presets that share samples,
// so that a score downloads only what it plays. Its 128 instruments and its standard drum kit; the
// bank's other variations and kits are left out. A file is named by its hash, so a new version
// never meets an old one in a cache; `sounds.json` says which file holds each instrument.
// `npm run sounds` reads the bank and its licence as they are in MuseScore's repository, at the
// commit below, checks they are those, and puts the package in dist/sounds/, ready for
// `npm publish ./dist/sounds`; `npm run vendor` copies it into app/vendor/sounds/.
// Usage: npm run sounds -- <MuseScore's share/sound folder, at that commit>
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const NAME = '@codename/jean-sounds'
const VERSION = '1.0.0'
/** musescore/MuseScore at 37128c5ac8f9af804b63650610952414421828b8, share/sound/. */
const SOURCE = {
  bank: ['MS Basic.sf3', '5ea2375e8bd7d8e71def1036978c1621e85b66934169b6a2744b27b9b3c2d99c'],
  license: ['MS Basic_License.md', '5ad8d737e13c7f01f5b9674872a82a92b4ba253603e8ed14b9db12293550b4b9'],
}

/** @param {Uint8Array} data */
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** A file of the source, checked. @param {string} folder @param {[string, string]} file */
async function read(folder, [name, hash]) {
  const data = await readFile(join(folder, name))
  if (sha256(data) !== hash) throw new Error(`${name} is not the one pinned (SHA-256 ${sha256(data)})`)
  return data
}

/** The bank, parsed afresh: making a file of some presets takes them from the bank they were in. @param {Buffer} data */
const parse = (data) => SoundBankLoader.fromArrayBuffer(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))

/**
 * The presets a score may play, by groups that share samples: each group is a file. Each holds the
 * indices, in the bank's presets, of its own; `programs` gives each instrument's group, `drums` the kit's.
 * @param {import('spessasynth_core').BasicSoundBank} bank
 */
export function groupsOf(bank) {
  const chosen = bank.presets.flatMap((preset, i) => (preset.bankMSB === 0 && preset.bankLSB === 0 && (!preset.isGMGSDrum || preset.program === 0) ? [i] : []))
  const parent = new Map(chosen.map((i) => [i, i]))
  /** @param {number} i @returns {number} */
  const root = (i) => (parent.get(i) === i ? i : root(/** @type {number} */ (parent.get(i))))
  const owner = new Map()
  for (const i of chosen) {
    for (const zone of bank.presets[i].zones) {
      for (const { sample } of zone.instrument.zones) {
        for (const each of [sample, sample.linkedSample].filter(Boolean)) {
          if (owner.has(each)) parent.set(root(i), root(owner.get(each)))
          else owner.set(each, i)
        }
      }
    }
  }
  const roots = [...new Set(chosen.map(root))]
  const groups = roots.map((r) => chosen.filter((i) => root(i) === r))
  const at = (/** @type {(preset: import('spessasynth_core').BasicPreset) => boolean} */ is) => groups.findIndex((group) => group.some((i) => is(bank.presets[i])))
  return {
    groups,
    programs: Array.from({ length: 128 }, (_, program) => at((preset) => !preset.isGMGSDrum && preset.program === program)),
    drums: at((preset) => preset.isGMGSDrum),
  }
}

async function main() {
  const folder = process.argv[2]
  if (!folder) throw new Error('usage: npm run sounds -- <MuseScore\'s share/sound folder>')
  const [data, license] = await Promise.all([read(folder, SOURCE.bank), read(folder, SOURCE.license)])
  const { groups, programs, drums } = groupsOf(parse(data))
  if (programs.includes(-1) || drums < 0) throw new Error('an instrument or the drum kit is missing')
  const out = join(ROOT, 'dist', 'sounds')
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  const files = []
  for (const group of groups) {
    const bank = parse(data)
    const presets = group.map((i) => bank.presets[i])
    const part = new BasicSoundBank()
    part.addCompletePresets(presets)
    part.soundBankInfo = { ...bank.soundBankInfo, name: `MS Basic: ${presets[0].name}`, creationDate: new Date(Date.UTC(2022, 6, 25)) }
    const bytes = new Uint8Array(part.writeSF2({ software: NAME }))
    const hash = sha256(bytes)
    const path = `${presets[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${hash.slice(0, 12)}.sf3`
    await writeFile(join(out, path), bytes)
    files.push({ path, sha256: hash, bytes: bytes.length })
  }
  await writeFile(join(out, 'sounds.json'), `${JSON.stringify({ format: '1', name: 'MS Basic', files, programs, drums })}\n`)
  await writeFile(join(out, 'LICENSE'), license)
  const { repository } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  await writeFile(join(out, 'package.json'), `${JSON.stringify({
    name: NAME, version: VERSION, description: 'The instruments Jean plays scores with: MS Basic, MuseScore\'s General MIDI bank, a file for each group of instruments that share samples.',
    license: 'MIT', repository, files: ['*.sf3', 'sounds.json'],
  }, null, 2)}\n`)
  await writeFile(join(out, 'README.md'), `# ${NAME}\n\nThe instruments with which Jean plays a score: MS Basic, the General MIDI bank of MuseScore, by S. Christian Collins and others, from musescore/MuseScore at 37128c5, \`share/sound/MS Basic.sf3\`. Its 128 instruments and its standard drum kit, as SoundFont 3 files, one for each group of instruments that share samples; \`sounds.json\` lists the files, with their SHA-256 and size, and gives the index of the one that holds each instrument (\`programs\`) and the drums. Under the MIT license, with the notices in LICENSE.\n`)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  console.log(`sounds: ${NAME}@${VERSION}, ${files.length} files, ${(total / 1048576).toFixed(1)} MB in dist/sounds; publish with npm publish ./dist/sounds`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`sounds: ${error.message}`)
    process.exit(1)
  })
}
