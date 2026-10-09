// Trusted Types: the only script URLs Jean creates are its own files.
const policy = /** @type {any} */ (globalThis).trustedTypes?.createPolicy('app-urls', {
  createScriptURL: (/** @type {string} */ url) => {
    const parsed = new URL(url, location.href)
    if (parsed.origin !== location.origin) throw new TypeError(`Blocked script URL: ${parsed.href}`)
    return parsed.href
  },
})

/** @param {string | URL} url @returns {string} */
export function scriptURL(url) {
  return /** @type {string} */ (/** @type {unknown} */ (policy ? policy.createScriptURL(String(url)) : String(url)))
}
