// Colleagues (D731): where the organisation's own relay lists the people its sign-in names (relay/colleagues.js), this person listed there
// under their profile's key and person mailbox, proved by the ID token the organisation's sign-in keeps, after each start at most daily and
// whenever the mailbox changes; and colleagues found there, by a few words, an account or a mailbox. Pure, no DOM and no app state: node
// --test runs it against the relay.
import { ask, open } from '../../ui/relay.js'

/** @typedef {import('./flow.js').Person} Person */
/** Someone listed, as a colleague sees them. @typedef {{ name: string, account: string, mailbox: string, key: JsonWebKey, chain?: string[], groups?: string[], guest?: true }} Listed */

/** Whether the relay lists the people of the organisation's sign-in. @param {string} base @param {string} issuer */
export const lists = (base, issuer) => fetch(base).then((response) => response.json()).then(({ issuers }) => Array.isArray(issuers) && issuers.includes(issuer), () => false)

/**
 * This person listed, under their key and person mailbox, opened first: what the list says of them.
 * @param {string} base @param {Person} person @param {string} proof the ID token @returns {Promise<{ name: string, account: string }>}
 */
export async function listed(base, person, proof) {
  await open(base, person.token)
  const { kty, crv, x, y } = person.public
  return (await ask(`${base}v1/people/${person.mailbox}`, { method: 'PUT', headers: { authorization: `Bearer ${person.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ proof, key: { kty, crv, x, y } }) })).json()
}
