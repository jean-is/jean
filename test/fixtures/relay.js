// What the fakes of Microsoft and Google share (fake-microsoft.js, fake-google.js): a page's request
// as a server receives it, a server's answer given back to the page, and the organisation's gateway
// (D191), gateway/gateway.js itself behind a route, its own requests reaching only the services given,
// while the page is open.
import { gateway } from '../../gateway/gateway.js'
import { redirect } from './fake-issuer.js'

/** @import { Config } from '../../gateway/gateway.js' */

/** The browser's request, as a server receives it. @param {import('@playwright/test').Request} request */
export const received = async (request) => new Request(request.url(), { method: request.method(), headers: await request.allHeaders(),
  body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer() })

/** A server's answer, given to the browser; a redirect as a page that goes on, which WebKit's routes need. @param {import('@playwright/test').Route} route @param {Response} response */
export const answer = async (route, response) => {
  const location = response.headers.get('location')
  if (location) return redirect(route, location)
  return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
}

/**
 * The organisation's gateway at an address, as `config` sets it up, its requests answered by `reach`
 * (undefined: out of the test's reach, as an address the network can't reach).
 * @param {import('@playwright/test').Page} page @param {string} at @param {Config} config
 * @param {(request: Request) => Promise<Response> | undefined} reach
 * @returns {Promise<string[]>} each address it relayed to
 */
export async function organisationGateway(page, at, config, reach) {
  /** @type {string[]} */
  const relayed = []
  const relay = gateway(config)
  const fetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    relayed.push(request.url)
    const answered = reach(request)
    if (!answered) throw new TypeError(`${request.url} is out of this test’s reach.`)
    return answered
  }
  page.once('close', () => { globalThis.fetch = fetch })
  await page.route((url) => url.origin === new URL(at).origin, async (route) => answer(route, await relay(await received(route.request()))))
  return relayed
}
