// Builds the desktop version (D155): Jean's own files, as `npm run build` leaves them, in a window
// of the system's web view, served from inside the app on 127.0.0.1 by Neutralino. In dist/desktop/:
// <name>.app for macOS 13.3 and later (Intel and Apple silicon), jean-win_x64.exe for Windows 10 and
// later (WebView2), jean-linux_x64, jean-linux_arm64 and jean-linux_armhf (WebKitGTK). Each is one
// file, or one bundle, with Jean's files inside. Neutralino's CLI downloads its binaries once per
// version into dist/neutralino/bin/; its notices ship inside each app, beside the other runtimes'.
// With `dmg`, on a Mac, the app also goes into a disk image to hand out: <name>-<version>.dmg.
// Usage: npm run build:desktop     (runs npm run build first)
//        npm run build:dmg         (the same, then the disk image)
import { spawn } from 'node:child_process'
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isShipped, walk } from './manifest.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** Neutralino's project: its configuration, its binaries (bin/, kept between builds), Jean's files (app/), what it builds (build/). */
const WORK = join(ROOT, 'dist', 'neutralino')
const OUT = join(ROOT, 'dist', 'desktop')
const NEU = join(ROOT, 'node_modules', '@neutralinojs', 'neu', 'bin', 'neu.js')

/** The Neutralino release the apps run on: its binaries are downloaded again when this changes. */
export const NEUTRALINO = '6.9.0'

/**
 * What each system keeps the app's data under: its address everywhere (the host is always
 * 127.0.0.1, so the port), the bundle identifier on macOS, the executable's name on Windows and
 * Linux. None of them comes from BRAND, and none may change once people use the app: their
 * conversations and files would stay behind, under the old one.
 */
export const DESKTOP = Object.freeze({ id: 'cx.jean.desktop', binary: 'jean', port: 24601 })

/**
 * The disk image's window, in points: desktop/dmg-background.svg's size, the icons' size, and
 * where the centre of each sits, the app on the left and Applications on the right.
 */
export const DMG = Object.freeze({ width: 600, height: 360, iconSize: 128, app: [150, 160], applications: [450, 160] })

/** What a web deploy serves: the pages and what they load, never the tooling, the tests or the docs. */
export const TOP = ['index.html', 'sandbox.html', 'preview.html', 'manifesto.html', 'manifesto.css', 'brand.js', 'sw.js', 'capabilities.json', 'manifest.webmanifest', 'LICENSE']
export const DIRS = ['core', 'ui', 'caps', 'locales', 'vendor', 'fonts', 'icons', 'ee']

/** The host's calls the page may make (ui/host.js), and no other. */
export const NATIVE = ['computer.getMemoryInfo', 'os.showFolderDialog', 'os.open', 'filesystem.getStats', 'filesystem.readDirectory', 'filesystem.readBinaryFile', 'filesystem.writeBinaryFile', 'filesystem.createDirectory', 'filesystem.remove']

/**
 * Neutralino's configuration: a window on Jean's files. Of the native API, only what Sync needs
 * (D169): the system's dialog for a folder, the folder opened in the system's file manager, and the
 * files there; nothing that runs a program. A link that opens elsewhere opens in the system's
 * browser; nothing is written beside the app (no log; the window's size and place go to the
 * system's folder for app data).
 * @param {{ name: string }} brand
 * @param {{ version: string, description?: string, copyright?: string }} about
 */
export function neutralinoConfig (brand, { version, description, copyright }) {
  return {
    applicationId: DESKTOP.id,
    applicationName: brand.name,
    version,
    ...(description ? { description } : {}),
    ...(copyright ? { copyright } : {}),
    defaultMode: 'window',
    port: DESKTOP.port,
    url: '/',
    documentRoot: '/app/',
    enableServer: true,
    enableNativeAPI: true,
    enableExtensions: false,
    exportAuthInfo: false,
    tokenSecurity: 'one-time',
    nativeAllowList: NATIVE,
    dataLocation: 'system',
    logging: { enabled: false, writeToLogFile: false },
    modes: {
      window: {
        title: brand.name,
        icon: '/app/icons/icon-512.png',
        width: 1200,
        height: 800,
        minWidth: 360,
        minHeight: 480,
        useLogicalPixels: true,
        center: true,
        useSavedState: true,
        exitProcessOnClose: true,
        newWindowPolicy: 'browser',
      },
    },
    cli: {
      binaryName: DESKTOP.binary,
      resourcesPath: '/app/',
      binaryVersion: NEUTRALINO,
      distributionPath: '/build',
    },
  }
}

/** @param {string} text */
const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The macOS bundle's Info.plist. The system asks before the web view first uses the microphone,
 * for dictation and live conversation, and shows the purpose given here under its question.
 * @param {{ name: string }} brand
 * @param {string} version
 */
export function infoPlist (brand, version) {
  /** @type {Array<[string, string | boolean]>} */
  const entries = [
    ['CFBundleDevelopmentRegion', 'en'],
    ['CFBundleDisplayName', brand.name],
    ['CFBundleExecutable', DESKTOP.binary],
    ['CFBundleIconFile', 'icon.icns'],
    ['CFBundleIdentifier', DESKTOP.id],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundleName', brand.name],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleShortVersionString', version],
    ['CFBundleVersion', version],
    ['LSApplicationCategoryType', 'public.app-category.productivity'],
    // Safari 16.4's engine, Jean's floor (D40).
    ['LSMinimumSystemVersion', '13.3'],
    ['NSHighResolutionCapable', true],
    ['NSMicrophoneUsageDescription', 'For dictation and live conversation.'],
    ['NSSpeechRecognitionUsageDescription', 'For dictation.'],
  ]
  const body = entries.map(([key, value]) => `  <key>${key}</key>\n  ${typeof value === 'boolean' ? `<${value}/>` : `<string>${xml(value)}</string>`}`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`
}

/**
 * An Apple icon file holding the PNG as it is: `ic09` is 512 pixels, `ic14` 256 points at twice
 * the density, so the 512 pixel PNG serves both, and the system scales it for the smaller sizes.
 * @param {Uint8Array} png
 */
export function icns (png) {
  /** @param {string} type @param {number} length */
  const header = (type, length) => {
    const bytes = Buffer.alloc(8)
    bytes.write(type, 0, 'latin1')
    bytes.writeUInt32BE(length, 4)
    return bytes
  }
  const entries = ['ic09', 'ic14'].map((type) => Buffer.concat([header(type, 8 + png.length), png]))
  return Buffer.concat([header('icns', 8 + entries.reduce((sum, entry) => sum + entry.length, 0)), ...entries])
}

/** @param {string} text */
const appleString = (text) => `"${text.replace(/[\\"]/g, '\\$&')}"`

/**
 * What Finder is asked to do with the disk image, mounted: show its window as DMG says, which
 * Finder then keeps in the image (.DS_Store), with the background and each icon's place.
 * @param {string} mount  where the image is mounted
 * @param {string} app  the app's file name
 */
export function finderScript (mount, app) {
  return `tell application "Finder"
  set theDisk to disk of (POSIX file ${appleString(mount)} as alias)
  open theDisk
  set theWindow to container window of theDisk
  set current view of theWindow to icon view
  set toolbar visible of theWindow to false
  set statusbar visible of theWindow to false
  set bounds of theWindow to {160, 120, ${160 + DMG.width}, ${120 + DMG.height}}
  set viewOptions to icon view options of theWindow
  set arrangement of viewOptions to not arranged
  set icon size of viewOptions to ${DMG.iconSize}
  set text size of viewOptions to 12
  set background picture of viewOptions to file ".background:background.tiff" of theDisk
  set position of item ${appleString(app)} of theDisk to {${DMG.app.join(', ')}}
  set position of item "Applications" of theDisk to {${DMG.applications.join(', ')}}
  close theWindow
  open theDisk
  update theDisk without registering applications
  delay 1
  close container window of theDisk
end tell`
}

/** @param {string} root */
export async function shippedFiles (root) {
  const nested = (await Promise.all(DIRS.map((dir) => walk(root, dir)))).flat()
  return [...TOP, ...nested].filter(isShipped)
}

/** @param {string} command @param {string[]} args @param {string} [cwd] */
function run (command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    spawn(command, args, { cwd, stdio: 'inherit' })
      .on('error', reject)
      .on('exit', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`${command} ${args[0]}: exit code ${code}`))))
  })
}

/** @param {string} command @param {string[]} args @returns {Promise<string>} what it printed */
function output (command, args) {
  return new Promise((resolve, reject) => {
    let text = ''
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (chunk) => { text += chunk })
    child.on('error', reject).on('exit', (code) => (code === 0 ? resolve(text) : reject(new Error(`${command} ${args[0]}: exit code ${code}`))))
  })
}

/** @param {string[]} args */
const neu = (...args) => run(process.execPath, [NEU, ...args], WORK)

/** Neutralino's binaries for every system, and its notices, once per version. */
async function binaries () {
  const bin = join(WORK, 'bin')
  if (await readFile(join(bin, 'VERSION'), 'utf8').catch(() => '') === NEUTRALINO) return
  await rm(bin, { recursive: true, force: true })
  await neu('update')
  // The universal binary runs on both kinds of Mac, so the other two stay out of the build.
  for (const arch of ['x64', 'arm64']) await rm(join(bin, `neutralino-mac_${arch}`), { force: true })
  const notices = await fetch(`https://raw.githubusercontent.com/neutralinojs/neutralinojs/v${NEUTRALINO}/LICENSE`)
  if (!notices.ok) throw new Error(`Neutralino's notices: HTTP ${notices.status}`)
  await writeFile(join(bin, 'LICENSE'), await notices.text())
  await writeFile(join(bin, 'VERSION'), NEUTRALINO)
}

/** Copies what a web deploy serves into Neutralino's resources, and Neutralino's notices beside the other runtimes'. */
async function stage () {
  const app = join(WORK, 'app')
  await rm(app, { recursive: true, force: true })
  const copies = [...(await shippedFiles(ROOT)).map((path) => [join(ROOT, path), join(app, path)]), [join(WORK, 'bin', 'LICENSE'), join(app, 'vendor', 'LICENSES', 'neutralinojs.txt')]]
  for (const [from, to] of copies) {
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }
}

/**
 * Makes the embedded universal binary an app the system can open, named for display: the system
 * keeps its data under the identifier (DESKTOP), never the name. The fallback used when the build
 * doesn't run on a Mac, so the X-Frame-Options patch (bundlePatched, D160) can't be compiled or
 * signed; this app has no patch and opens a plain embedded window.
 * @param {string} binary @param {{ name: string }} brand @param {string} version
 */
async function bundle (binary, brand, version) {
  const app = join(OUT, `${brand.name}.app`)
  await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true })
  await mkdir(join(app, 'Contents', 'Resources'), { recursive: true })
  await rename(binary, join(app, 'Contents', 'MacOS', DESKTOP.binary))
  await writeFile(join(app, 'Contents', 'Info.plist'), infoPlist(brand, version))
  await writeFile(join(app, 'Contents', 'Resources', 'icon.icns'), icns(await readFile(join(ROOT, 'icons', 'icon-512.png'))))
  console.warn(`${relative(ROOT, app)}: built off a Mac, so without the browser pane's X-Frame-Options patch and unsigned; build on a Mac for the patched, signed app`)
}

/**
 * Compiles the two tiny native pieces of the patched Mac app (D160), universal for both kinds of
 * Mac: the launcher that becomes the bundle's executable, and the library it inserts to turn on
 * WebKit's iframe-embedding feature. From source in desktop/, never committed binaries, like the
 * disk image's background. On a Mac only (clang needs the macOS SDK).
 * @returns {Promise<{ launcher: string, dylib: string }>}
 */
async function compileNative () {
  const launcher = join(WORK, DESKTOP.binary)
  const dylib = join(WORK, 'libjeanframe.dylib')
  const arch = ['-arch', 'x86_64', '-arch', 'arm64']
  await run('clang', [...arch, '-O2', '-o', launcher, join(ROOT, 'desktop', 'launcher.c')])
  await run('clang', [...arch, '-O2', '-dynamiclib', '-framework', 'Foundation', '-framework', 'CoreGraphics', '-o', dylib, join(ROOT, 'desktop', 'jeanframe.m')])
  return { launcher, dylib }
}

/**
 * The patched Mac app (D160): bundle mode, so Neutralino reads resources.neu from disk and its
 * embedded-resource reader (fragile to a changed load address) is out of the way. Contents/MacOS
 * holds only code — the launcher (the bundle's executable, DESKTOP.binary) and the real Neutralino
 * binary (jean-bin) — so code signing is happy; resources.neu and the config go in Resources/,
 * where the launcher points Neutralino with --path. The launcher inserts libjeanframe.dylib, which
 * lets a framed site that refuses embedding show in the browser pane. Signed once each, from
 * unsigned (re-signing over a signature corrupts the embedded resources), the real binary as plain
 * nested code so it carries no Info.plist binding of its own.
 * @param {string} binary  the bundle-mode (not embedded) Neutralino universal binary
 * @param {string} resourcesNeu  the bundle's resources.neu
 * @param {string} configFile  the neutralino.config.json to read at runtime
 * @param {{ name: string }} brand @param {string} version
 */
async function bundlePatched (binary, resourcesNeu, configFile, brand, version) {
  const app = join(OUT, `${brand.name}.app`)
  const contents = join(app, 'Contents')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await mkdir(join(contents, 'Resources'), { recursive: true })
  await mkdir(join(contents, 'Frameworks'), { recursive: true })
  const { launcher, dylib } = await compileNative()
  await copyFile(launcher, join(contents, 'MacOS', DESKTOP.binary))
  await copyFile(binary, join(contents, 'MacOS', `${DESKTOP.binary}-bin`))
  await copyFile(dylib, join(contents, 'Frameworks', 'libjeanframe.dylib'))
  await copyFile(resourcesNeu, join(contents, 'Resources', 'resources.neu'))
  await copyFile(configFile, join(contents, 'Resources', 'neutralino.config.json'))
  await writeFile(join(contents, 'Info.plist'), infoPlist(brand, version))
  await writeFile(join(contents, 'Resources', 'icon.icns'), icns(await readFile(join(ROOT, 'icons', 'icon-512.png'))))
  await run('codesign', ['--remove-signature', join(contents, 'MacOS', `${DESKTOP.binary}-bin`)])
  for (const path of [join(contents, 'MacOS', `${DESKTOP.binary}-bin`), join(contents, 'Frameworks', 'libjeanframe.dylib'), join(contents, 'MacOS', DESKTOP.binary), app]) {
    await run('codesign', ['--force', '--sign', '-', path])
  }
}

/**
 * The disk image to hand out on macOS: the app beside a link to Applications, over
 * desktop/dmg-background.svg, with the app's icon for the disk. Made with the system's own tools
 * (hdiutil, sips, tiffutil, Finder), so on a Mac only. Finder lays the window out and keeps it in
 * the image; when it can't (no permission to control it, no screen), the image still holds the
 * app and the link, unarranged, and the build says so.
 * @param {{ name: string }} brand @param {string} version
 */
async function diskImage (brand, version) {
  const app = `${brand.name}.app`
  const stage = join(WORK, 'dmg')
  const image = join(WORK, 'dmg-writable.dmg')
  await rm(stage, { recursive: true, force: true })
  await mkdir(join(stage, '.background'), { recursive: true })
  await run('ditto', [join(OUT, app), join(stage, app)])
  await symlink('/Applications', join(stage, 'Applications'))
  // Drawn at both densities into one TIFF, so a Retina screen shows the sharp one.
  const drawn = [1, 2].map((scale) => join(WORK, `dmg-background@${scale}x.png`))
  for (const [index, path] of drawn.entries()) {
    const scale = index + 1
    await output('sips', ['-s', 'format', 'png', '-z', String(DMG.height * scale), String(DMG.width * scale), join(ROOT, 'desktop', 'dmg-background.svg'), '--out', path])
  }
  await run('tiffutil', ['-cathidpicheck', ...drawn, '-out', join(stage, '.background', 'background.tiff')])
  await rm(image, { force: true })
  // A tenth more than the files, for what Finder writes.
  const megabytes = Math.ceil(((await size(stage)) / 1024 / 1024) * 1.1) + 16
  await run('hdiutil', ['create', '-quiet', '-volname', brand.name, '-srcfolder', stage, '-fs', 'HFS+', '-format', 'UDRW', '-size', `${megabytes}m`, image])
  // Mounted where the system puts disks, under the volume's own name, which Finder's settings refer to.
  const attached = await output('hdiutil', ['attach', '-readwrite', '-noverify', '-noautoopen', '-plist', image])
  const mount = /<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/.exec(attached)?.[1]
  if (!mount) throw new Error('hdiutil attach: no mount point')
  try {
    try {
      await output('osascript', ['-e', finderScript(mount, app)])
      for (let wait = 0; wait < 20 && !await stat(join(mount, '.DS_Store')).catch(() => null); wait++) await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      console.warn(`desktop: Finder didn't lay the disk image's window out (${/** @type {Error} */ (error).message}): allow this terminal to control Finder, in System Settings, Privacy & Security, Automation`)
    }
    // The disk's own icon, which Finder deletes as it lays the window out, so it comes after; the disk
    // shows it once its folder says it has an icon of its own (kHasCustomIcon).
    await copyFile(join(OUT, app, 'Contents', 'Resources', 'icon.icns'), join(mount, '.VolumeIcon.icns'))
    await run('xattr', ['-wx', 'com.apple.FinderInfo', `${'0'.repeat(16)}0400${'0'.repeat(44)}`, mount])
    await rm(join(mount, '.fseventsd'), { recursive: true, force: true })
  } finally {
    await run('hdiutil', ['detach', '-quiet', mount]).catch(() => run('hdiutil', ['detach', '-quiet', '-force', mount]))
  }
  // Compressed with LZFSE, which every Mac Jean runs on opens (macOS 10.11 and later).
  await run('hdiutil', ['convert', '-quiet', image, '-format', 'ULFO', '-ov', '-o', join(OUT, `${brand.name}-${version}.dmg`)])
  for (const path of [image, stage, ...drawn]) await rm(path, { recursive: true, force: true })
}

/** @param {string} path */
async function size (path) {
  const info = await lstat(path)
  if (!info.isDirectory()) return info.size
  let total = 0
  for (const name of await readdir(path)) total += await size(join(path, name))
  return total
}

/** @param {string[]} argv */
async function main (argv) {
  const target = argv[0]
  if (target && target !== 'dmg') throw new Error(`unknown target ${target}: the one there is is dmg`)
  if (target === 'dmg' && process.platform !== 'darwin') throw new Error('a disk image is made on a Mac, with its own tools')
  const { BRAND } = await import(pathToFileURL(join(ROOT, 'brand.js')).href)
  const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const description = /<meta name="description" content="([^"]*)">/.exec(await readFile(join(ROOT, 'index.html'), 'utf8'))?.[1]
  const copyright = /^Copyright .+$/m.exec(await readFile(join(ROOT, 'LICENSE'), 'utf8'))?.[0]
  await mkdir(WORK, { recursive: true })
  await writeFile(join(WORK, 'neutralino.config.json'), `${JSON.stringify(neutralinoConfig(BRAND, { version, description, copyright }), null, 2)}\n`)
  await binaries()
  await stage()
  const built = join(WORK, 'build', DESKTOP.binary)
  const mac = `${DESKTOP.binary}-mac_universal`
  // The patched Mac app (D160) runs in bundle mode, so on a Mac we build that way first and keep its
  // Neutralino binary and resources.neu, which the embedded pass that follows would overwrite. The
  // patch is Mac-only (WebKit, a dylib), so off a Mac this pass is skipped and the Mac app is the
  // plain embedded one.
  const patched = process.platform === 'darwin'
  let macMaterials
  if (patched) {
    await neu('build')
    const stash = join(WORK, 'mac-bundle')
    await rm(stash, { recursive: true, force: true })
    await mkdir(stash, { recursive: true })
    macMaterials = { binary: join(stash, mac), resources: join(stash, 'resources.neu') }
    await copyFile(join(built, mac), macMaterials.binary)
    await copyFile(join(built, 'resources.neu'), macMaterials.resources)
  }
  // Embedded single files for Windows and Linux (D155). On a Mac its own embedded binary is unused:
  // the patched app replaces it.
  await neu('build', '--embed-resources', '--clean')
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  for (const name of await readdir(built)) {
    if (name === mac) { if (!patched) await bundle(join(built, name), BRAND, version) }
    else await rename(join(built, name), join(OUT, name))
  }
  if (macMaterials) await bundlePatched(macMaterials.binary, macMaterials.resources, join(WORK, 'neutralino.config.json'), BRAND, version)
  if (target === 'dmg') await diskImage(BRAND, version)
  for (const name of (await readdir(OUT)).sort()) {
    console.log(`${relative(ROOT, join(OUT, name)).padEnd(40)} ${`${((await size(join(OUT, name))) / 1024 / 1024).toFixed(1)} MB`.padStart(9)}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`desktop: ${error.message}`)
    process.exit(1)
  })
}
