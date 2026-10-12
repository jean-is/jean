// Maps (D291): <app-map> in a page, its GeoJSON as its text, which the page may change to move it (a
// form beside it, say); a place, a route or an area clicked tells the page (`pick`, with what it
// says of itself). Lent to a page that holds one, as a ```geojson block in an answer is a page made of
// one. Drawn by MapLibre GL, which Jean lends too, once, its worker a classic one (scripts/vendor.js). Its style, tiles, fonts and icons come from the map
// service Settings name, through Jean, which fetches them once the user has said yes to maps: the
// page itself reaches nothing. Until then, the map says where it would come from and asks. Its places
// in the room's accent, each named, its routes and areas too, the whole framed to fit.
// Self-contained, the DOM's own calls only: it runs in a page's frame.

/** Asks Jean, and waits for its answer. @param {Record<string, unknown>} message @returns {Promise<any>} */
const ask = (message) => new Promise((resolve) => {
  const id = Math.random()
  addEventListener('message', function heard({ data, source }) {
    if (source === parent && data?.id === id) removeEventListener('message', heard), resolve(data)
  })
  parent.postMessage({ ...message, id }, '*')
})

/** An address as MapLibre asks Jean for it, its scheme kept, and back. @param {string} url */
const routed = (url) => url.replace(/^(https?):\/\//, 'jean://$1/')
/** @param {string} url */
const direct = (url) => url.replace(/^jean:\/\/(https?)\//, '$1://')

/** MapLibre, made ready once: its worker classic, and every address it reaches fetched by Jean. @type {Promise<any> | undefined} */
let lent
const lend = () => (lent ??= ask({ need: 'maplibre' }).then(async (given) => {
  const maplibregl = await import(URL.createObjectURL(new Blob([given.library], { type: 'text/javascript' })))
  maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([given.worker], { type: 'text/javascript' })))
  maplibregl.addProtocol('jean', async (/** @type {{ url: string, type: string }} */ { url, type }) => {
    const { bytes, error } = await ask({ fetch: direct(url) })
    if (error) throw new Error(error)
    const text = () => new TextDecoder().decode(bytes)
    return { data: type === 'json' ? JSON.parse(text()) : type === 'string' ? text() : bytes.buffer }
  })
  return { ...given, maplibregl }
}))

// The map in its box, its consent card over it until maps are allowed.
const OWN = `:host { position: relative; display: block; block-size: 22rem; overflow: hidden; border-radius: var(--border-radius-md, 0.6rem); }
.box { position: absolute; inset: 0; }
.ask { position: absolute; inset: 0; display: grid; place-content: center; gap: 0.6rem; padding: 1rem; text-align: center; background: var(--color-background-secondary); color: var(--color-text-secondary); font: 0.9rem/1.4 var(--font-sans); }
.ask button { justify-self: center; padding: 0.45em 1em; border: 0; border-radius: 99px; background: var(--color-primary, #2a6fdb); color: var(--color-on-primary, white); font: inherit; font-weight: 600; cursor: pointer; }`

/** A colour of the page as MapLibre reads colours: rgba(). @param {string} colour */
function rgba(colour) {
  const pen = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d', { willReadFrequently: true }))
  pen.fillStyle = colour
  pen.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

/** Features of a kind, one or many (MultiPoint is points too). @param {string} type */
const kind = (type) => ['in', ['geometry-type'], ['literal', [type, `Multi${type}`]]]

/** Every position in some GeoJSON. @param {any} value @returns {number[][]} */
const positions = (value) => (Array.isArray(value) && typeof value[0] === 'number' ? [value] : Array.isArray(value) ? value.flatMap(positions)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => (key === 'properties' ? [] : positions(inner))) : [])

class AppMap extends HTMLElement {
  shown = this.attachShadow({ mode: 'open' })
  changed = new MutationObserver(() => this.update())
  /** @type {any} */
  map = null

  connectedCallback() {
    this.changed.observe(this, { childList: true, characterData: true, subtree: true })
    void this.start()
  }

  disconnectedCallback() {
    this.changed.disconnect()
    this.map?.remove()
    this.map = null
  }

  /** Its GeoJSON, from its text: null while it isn't whole. */
  get data() {
    try {
      const data = JSON.parse(this.textContent ?? '')
      return data && typeof data.type === 'string' ? data : null
    } catch {
      return null
    }
  }

  async start() {
    const given = await lend()
    const box = Object.assign(document.createElement('div'), { className: 'box' })
    this.shown.replaceChildren(Object.assign(document.createElement('style'), { textContent: given.css + OWN }), box)
    if (!given.allowed) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: given.strings.show })
      const card = Object.assign(document.createElement('div'), { className: 'ask' })
      card.append(Object.assign(document.createElement('p'), { textContent: given.strings.from }), button)
      this.shown.append(card)
      await new Promise((resolve) => button.addEventListener('click', () => ask({ allow: 'maps' }).then(({ allowed }) => allowed && resolve(card.remove()))))
    }
    const style = getComputedStyle(this)
    const accent = rgba(style.getPropertyValue('--color-primary').trim() || '#2a6fdb')
    const halo = rgba(style.colorScheme === 'dark' ? '#1b1b1d' : '#ffffff')
    const ink = rgba(style.getPropertyValue('--color-text-primary').trim() || '#222')
    const map = this.map = new given.maplibregl.Map({ container: box, style: routed(given.style), center: [0, 20], zoom: 1, attributionControl: { compact: true },
      transformRequest: (/** @type {string} */ url) => ({ url: routed(url) }) })
    map.addControl(new given.maplibregl.NavigationControl({ showCompass: false }))
    map.on('load', () => {
      // Its credits folded to their button, so that they hide no place.
      box.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
      map.addSource('own', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'areas', type: 'fill', source: 'own', filter: kind('Polygon'), paint: { 'fill-color': accent, 'fill-opacity': 0.18 } })
      map.addLayer({ id: 'edges', type: 'line', source: 'own', filter: kind('Polygon'), paint: { 'line-color': accent, 'line-width': 2 } })
      map.addLayer({ id: 'under', type: 'line', source: 'own', filter: kind('LineString'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': halo, 'line-width': 8 } })
      map.addLayer({ id: 'routes', type: 'line', source: 'own', filter: kind('LineString'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': 4 } })
      map.addLayer({ id: 'places', type: 'circle', source: 'own', filter: kind('Point'), paint: { 'circle-radius': 7, 'circle-color': accent, 'circle-stroke-width': 2.5, 'circle-stroke-color': halo } })
      map.addLayer({ id: 'names', type: 'symbol', source: 'own', filter: kind('Point'),
        layout: { 'text-field': ['coalesce', ['get', 'name'], ['get', 'title'], ''], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.6 } })
      for (const layer of ['areas', 'routes', 'places']) {
        map.on('click', layer, (/** @type {any} */ event) => this.dispatchEvent(new CustomEvent('pick', { bubbles: true, detail: { ...event.features[0]?.properties } })))
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      this.update(true)
    })
  }

  /** Its GeoJSON on the map, framed to fit, gently unless motion is better left out. @param {boolean} [first] */
  update(first = false) {
    const data = this.data
    const source = this.map?.getSource('own')
    if (!data || !source) return
    source.setData(data)
    const all = positions(data)
    if (!all.length) return
    const bounds = all.reduce(([west, south, east, north], [x, y]) => [Math.min(west, x), Math.min(south, y), Math.max(east, x), Math.max(north, y)], [180, 90, -180, -90])
    const still = first || matchMedia('(prefers-reduced-motion: reduce)').matches
    this.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 48, maxZoom: 13, duration: still ? 0 : 600 })
  }
}

if (!customElements.get('app-map')) customElements.define('app-map', AppMap)
