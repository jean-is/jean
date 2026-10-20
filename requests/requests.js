// Where an organisation asks Warehouse SAS for a key (D446): the form of jean.is's page for it (site/enterprise-key/)
// sends here, at /keys on the site's own address. It keeps each request and mails it to Warehouse SAS, who signs
// the key by hand, where its private half lives offline, and answers by email; Jean itself never calls it, and checks
// keys offline (app/ee/key.js). It mails no one but Warehouse SAS, so no one can make it write to anyone else.
//
//   GET  <service>   what it is: { format: 1 }
//   POST <service>   a request, as the page's form sends it (application/x-www-form-urlencoded): kind (trial, free or
//                    subscription), organisation, origins (the addresses Jean is served from), people, name, email;
//                    for a free key `for` (small, school or nonprofit); for a subscription country (fr, eu or world),
//                    vat, address, trial (a trial key meanwhile) and quote (the number of the quote the page showed);
//                    message, lang, and back, the page's address from the site's root, which it answers with: back#sent,
//                    or back#again when it couldn't pass the request on, or an address has asked too often this hour
//
// Web-standard (fetch, Request, Response): where a request goes is its store's, a file and a mail on Node (serve.js).

export const LIMIT = 20_000
/** Requests an address may make in an hour, and all addresses together. */
const ASKS = 5
const ALL = 60
const HOUR = 3_600_000
const DAY = 86_400_000
export const KINDS = ['trial', 'free', 'subscription']
export const FREE = ['small', 'school', 'nonprofit']
export const PLACES = ['fr', 'eu', 'world']
const EMAIL = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]+$/
const LINE = /[\0-\x1f\x7f]/
const TEXT = /[\0-\x08\x0b-\x1f\x7f]/

/**
 * @typedef {{ kind: string, organisation: string, origins: string[], people: number, name: string, email: string, for: string,
 *   country: string, vat: string, address: string, trial: boolean, quote: string, message: string, lang: string }} Asked
 * @typedef {{ keep: (line: string) => Promise<void>, mail: (mail: { subject: string, text: string, replyTo: string }) => Promise<void> }} Store
 */

/** A field as one line, or as text, at most `max` characters; null when it can't be. @param {FormData | URLSearchParams} form @param {string} name */
const field = (form, name, max = 200, text = false) => {
  const value = String(form.get(name) ?? '').replace(/\r\n?/g, '\n').trim()
  return value.length <= max && !(text ? TEXT : LINE).test(value) ? value : null
}

/** The addresses Jean is served from, as origins, https:// added where none is said. @param {string} text */
export function originsOf(text) {
  const origins = text.split(/[\s,]+/).filter(Boolean).map((part) => {
    try {
      const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(part) ? part : `https://${part}`)
      return url.protocol === 'https:' && !url.username && !url.password ? url.origin : ''
    } catch { return '' }
  })
  return origins.length && origins.length <= 10 && !origins.includes('') ? [...new Set(origins)] : null
}

/** A request as the form sent it, or null when it isn't one. @param {URLSearchParams} form @returns {Asked | null} */
export function read(form) {
  const [kind, organisation, name, email, place, free, vat, quote, lang] = ['kind', 'organisation', 'name', 'email', 'country', 'for', 'vat', 'quote', 'lang'].map((key) => field(form, key))
  const [address, message, origins] = [field(form, 'address', 500, true), field(form, 'message', 2000, true), originsOf(field(form, 'origins', 1000, true) ?? '')]
  const people = Number(form.get('people'))
  if (!kind || !KINDS.includes(kind) || !organisation || !name || !email || email.length > 254 || !EMAIL.test(email) || !origins || !Number.isSafeInteger(people) || people < 1) return null
  if (place === null || free === null || vat === null || quote === null || lang === null || address === null || message === null) return null
  if ((place && !PLACES.includes(place)) || (free && !FREE.includes(free)) || !/^[\w -]{0,20}$/.test(vat) || !/^[\w-]{0,20}$/.test(quote) || !/^([a-z]{2,3}(-[A-Z]{2})?)?$/.test(lang)) return null
  return { kind, organisation, origins, people, name, email, for: free, country: place, vat, address, trial: kind === 'subscription' && form.get('trial') === 'on', quote, message, lang }
}

/** A word for the shell, as it is. @param {string} text */
const shell = (text) => `'${text.replaceAll("'", `'\\''`)}'`

/** The mail Warehouse SAS gets for a request, with the lines that sign its keys. @param {Asked} asked @param {number} now */
export function mailOf(asked, now) {
  const day = (/** @type {number} */ at) => new Date(at).toISOString().slice(0, 10)
  const year = new Date(now)
  year.setUTCFullYear(year.getUTCFullYear() + 1)
  const sign = (/** @type {string} */ until, trial = false) => `node sign.mjs --org ${shell(asked.organisation)} ${asked.origins.map((origin) => `--origin ${shell(origin)}`).join(' ')} --until ${until}${trial ? ' --trial' : ''}`
  const what = { trial: 'a 30-day trial key', free: 'a free key', subscription: 'a subscription' }[asked.kind]
  const lines = [
    `${asked.organisation} asks for ${what}.`,
    '',
    `From: ${asked.name} <${asked.email}>`,
    `Addresses: ${asked.origins.join(' ')}`,
    `People: ${asked.people}`,
    ...(asked.kind === 'free' ? [`Free as: ${{ small: 'up to 50 people', school: 'a school', nonprofit: 'a non-profit', '': 'not said' }[asked.for]}`] : []),
    ...(asked.kind === 'subscription' ? [
      `Quote: ${asked.quote || 'none shown'}`,
      `Where: ${{ fr: 'France', eu: 'another EU country', world: 'outside the EU', '': 'not said' }[asked.country]}${asked.vat ? `, VAT ${asked.vat}` : ''}`,
      ...(asked.address ? ['Billing address:', asked.address] : []),
      `A trial key meanwhile: ${asked.trial ? 'yes' : 'no'}`,
    ] : []),
    ...(asked.lang ? [`Language: ${asked.lang}`] : []),
    ...(asked.message ? ['', 'Message:', asked.message] : []),
    '',
    'To sign, beside the private key:',
    ...(asked.kind === 'trial' || asked.trial ? [sign(day(now + 30 * DAY), true)] : []),
    ...(asked.kind === 'trial' ? [] : [sign(day(year.getTime()))]),
    '',
    `Answering this mail answers ${asked.email}.`,
  ]
  return { subject: `${asked.organisation}: ${what}`, text: lines.join('\n'), replyTo: asked.email }
}

/** @param {Store} store @param {{ now?: () => number }} [at] @returns {(request: Request, client?: { address: string }) => Promise<Response>} */
export function requests(store, { now = Date.now } = {}) {
  /** What each address asked this hour, and all of them. @type {Map<string, { from: number, asks: number }>} */
  const seen = new Map()
  let all = { from: 0, asks: 0 }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }

  return async (request, client = { address: '' }) => {
    if (request.method === 'GET' || request.method === 'HEAD') return Response.json({ format: 1 }, { headers })
    if (request.method !== 'POST') return new Response('Send the form.\n', { status: 405, headers: { ...headers, allow: 'GET, POST' } })
    if (!/^application\/x-www-form-urlencoded\b/.test(request.headers.get('content-type') ?? '')) return new Response('Send the form.\n', { status: 415, headers })
    if (!(Number(request.headers.get('content-length')) <= LIMIT)) return new Response('The form is too long.\n', { status: 413, headers })
    const body = await request.text()
    if (body.length > LIMIT) return new Response('The form is too long.\n', { status: 413, headers })
    const form = new URLSearchParams(body)
    const back = String(form.get('back') ?? '')
    if (!/^[a-z0-9][a-z0-9/-]{0,99}$/.test(back)) return new Response('The form came from no page of the site.\n', { status: 400, headers })
    const answer = (/** @type {string} */ state) => new Response(null, { status: 303, headers: { ...headers, location: `/${back}#${state}` } })
    // A field people never see, which only a robot fills: it is told what a person is, and nothing is kept.
    if (form.get('website')) return answer('sent')

    const at = now()
    const by = seen.get(client.address)
    const mine = by && at - by.from < HOUR ? by : { from: at, asks: 0 }
    seen.set(client.address, mine)
    if (seen.size > 100_000) seen.clear()
    if (at - all.from >= HOUR) all = { from: at, asks: 0 }
    if (++mine.asks > ASKS || ++all.asks > ALL) return answer('again')
    const asked = read(form)
    if (!asked) return new Response('The form is missing something, or holds something it can’t.\n', { status: 400, headers })
    await store.keep(JSON.stringify({ format: 1, at: new Date(at).toISOString(), ...asked })).catch((error) => console.error('A request was not kept:', error))
    // Sent once Warehouse SAS has it: kept alone, it would wait unread.
    return store.mail(mailOf(asked, at)).then(() => answer('sent'), (error) => {
      console.error('A request was not mailed:', error)
      return answer('again')
    })
  }
}
