// Where files go (D381): the page lists by hand every address Jean's code names, so it fails here
// as soon as a default address, a brain's or a known service is added and the page doesn't say so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DEFAULT_URLS } from '../app/core/settings.js'
import { PROVIDERS } from '../app/core/llm.js'
import { DIRECTORY } from '../app/caps/connections/directory.js'

const page = await readFile(new URL('../app/files.html', import.meta.url), 'utf8')
const [english, french] = page.split('<article id="fr"')

/** An address's host as the page writes it: a placeholder's label left out ({lang}.wikipedia.org is wikipedia.org). @param {string} address */
const hostOf = (address) => new URL(address.replace(/\{\w+\}\./, '').replace(/\{\w+\}/g, 'x')).host

/** Every address outside this computer that Jean's code reaches by default or for a brain it knows. */
const hosts = [...new Set([
  ...Object.values(DEFAULT_URLS),
  ...Object.values(PROVIDERS).flatMap((provider) => [provider.baseURL, 'keyCheck' in provider ? provider.keyCheck : undefined]),
].filter((address) => typeof address === 'string' && /^https:/.test(address)).map(hostOf))]

test('the page names every address Jean reaches by default and every brain’s, in English and in French (D381)', () => {
  assert.ok(hosts.length > 20, 'the addresses were found')
  for (const [lang, half] of [['en', english], ['fr', french]]) {
    for (const host of hosts) assert.ok(half.includes(`<code>${host}</code>`) || half.includes(`.${host}</code>`), `${lang}: ${host}`)
  }
})

test('the page names every service of the directory, and where those that refuse browsers are reached (D381)', () => {
  for (const { name, url } of DIRECTORY) if (url) assert.ok(english.includes(name), name)
  for (const { url } of DIRECTORY) if (url && !english.includes(new URL(url).host) && !/googleapis\.com$/.test(new URL(url).host)) {
    const host = new URL(url).host
    assert.ok(!/claude\.com$|anthropic/.test(host) || english.includes(`<code>${host}</code>`), `a service reached through another company's server names it: ${host}`)
  }
  // One called straight from the browser, its sign-in too, names its own server, in both languages (D382).
  for (const { url } of DIRECTORY.filter((entry) => entry.api && entry.ready)) for (const half of [english, french]) assert.ok(half.includes(`<code>${new URL(String(url)).host}</code>`), String(url))
})
