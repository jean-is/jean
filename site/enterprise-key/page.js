// Where an organisation asks for a key (D446), at /enterprise/key in English and /fr/entreprise/cle in French: a
// 30-day trial, a free key, or a subscription, whose quote the page makes as the form is filled, to print. The form
// sends to the request service at /keys on the site's own address (requests/), which mails the request to Warehouse SAS,
// who signs the key by hand and answers by email, and comes back here at #sent, or #again when it couldn't. Without
// its script the form still sends, and no quote is made. Its words are <lang>.json; its look enterprise-key.css.
import { FREE, KINDS, PLACES } from '../../requests/requests.js'
import { underline, xml } from '../site.js'
import { BANDS, CONTACT, SMALL } from '../enterprise/page.js'

/** @type {Record<string, string>} */
const ADDRESSES = { en: 'enterprise/key', fr: 'fr/entreprise/cle' }

/** Who sells the key, as the quote names them, as the terms' legal notice does; `capital` is the share capital, in euros. */
export const SELLER = { name: 'Warehouse SAS', capital: 1000, address: '66 avenue des Champs-Élysées, 75008 Paris, France', siren: '949 551 618', vat: 'FR91949551618' }
/** How long a quote holds, in days, and the VAT France adds. */
export const VALID = 90
const TAX = 0.2

// What the page runs besides the theme line, the same in every language (no "<", which a page's scripts are read
// without): the fields of the key chosen, those for another disabled; the quote, its number sent with the request.
const SCRIPT = `{
const form = document.getElementById('key-form')
const lang = document.documentElement.lang
const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' })
const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long' })
const { bands, small, valid, tax } = JSON.parse(form.dataset.quote)
const today = new Date()
const number = today.toISOString().slice(0, 10).replaceAll('-', '') + '-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-4).toUpperCase()
const fill = (name, text) => { for (const slot of form.querySelectorAll('[data-fill="' + name + '"]')) slot.textContent = text }
const show = (name, shown) => { for (const part of form.querySelectorAll('[data-when="' + name + '"]')) part.hidden = !shown }
const asked = document.getElementById(location.hash.slice(1))
if (asked && asked.name === 'kind') asked.checked = true
const update = () => {
  const data = new FormData(form)
  const kind = data.get('kind')
  for (const part of form.querySelectorAll('[data-kind]')) {
    part.hidden = part.disabled = part.dataset.kind !== kind
    for (const choice of part.querySelectorAll('[data-required]')) choice.required = !part.disabled
  }
  const people = Number(data.get('people'))
  const band = bands.find((one) => one.people >= people)
  const ready = kind === 'subscription' && people > small && Boolean(band)
  show('small', kind === 'subscription' && people >= 1 && !(people > small))
  show('large', kind === 'subscription' && !band)
  form.elements.namedItem('quote').value = ready ? number : ''
  show('quote', ready)
  if (!ready) return
  const place = data.get('country')
  const vat = String(data.get('vat')).trim()
  const rate = place === 'fr' || (place === 'eu' && !vat) ? tax : 0
  fill('number', number)
  fill('date', date.format(today))
  fill('until', date.format(new Date(today.getTime() + valid * 86400000)))
  fill('organisation', String(data.get('organisation')).trim())
  fill('address', String(data.get('address')).trim())
  fill('vat', vat)
  show('vat', Boolean(vat))
  fill('band', new Intl.NumberFormat(lang).format(band.people))
  fill('origins', String(data.get('origins')).split(/[\\s,]+/).filter(Boolean).map((part) => /^[a-z][\\w+.-]*:\\/\\//i.test(part) ? part : 'https://' + part).join(', '))
  fill('price', money.format(band.price))
  fill('tax', money.format(band.price * rate))
  fill('total', money.format(band.price * (1 + rate)))
  show('taxed', rate > 0)
  show('reverse', place === 'eu' && Boolean(vat))
  show('outside', place === 'world')
}
form.addEventListener('input', update)
form.addEventListener('change', update)
form.querySelector('.key-print').addEventListener('click', () => print())
update()
}`

/** @type {import('../site.js').Page} */
export default {
  addresses: ADDRESSES,
  title: (kit) => `${kit.say('h1')} · ${kit.from('enterprise').say('title')}`,
  script: SCRIPT,
  sends: true,
  main (kit) {
    const { lang } = kit
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const count = new Intl.NumberFormat(lang)
    const params = { small: count.format(SMALL), from: money.format(BANDS[0].price), largest: count.format(BANDS.at(-1)?.people ?? 0), contact: CONTACT }
    const say = (/** @type {string} */ key) => kit.say(key, params)
    // A sentence with the script's slots where its {params} were: each a span it fills.
    const slots = (/** @type {string} */ key) => kit.say(key, params).replace(/\{(\w+)\}/g, (_, name) => /* html */ `<span data-fill="${name}"></span>`)
    // Choices the script makes needed once their key is chosen, as a form can't say itself.
    const radios = (/** @type {string} */ name, /** @type {string[]} */ values, /** @type {string[]} */ labels) => values.map((value, i) => /* html */ `
        <label class="key-choice"><input type="radio" name="${name}" value="${value}" data-required> <span>${labels[i]}</span></label>`).join('')
    const kinds = kit.table('kinds', 2, params)
    const enterprise = kit.link('enterprise')
    const privacy = kit.link('privacy')
    const seller = [xml(SELLER.name), kit.say('quote.capital', { capital: money.format(SELLER.capital) }), xml(SELLER.address), kit.say('quote.ids', { siren: SELLER.siren, vat: SELLER.vat }), xml(CONTACT)]
    return /* html */ `<section class="site-hero" aria-labelledby="key-title">
  <div class="site-hero-text">
    <p class="site-eyebrow">${enterprise ? /* html */ `<a href="${enterprise}">${say('eyebrow')}</a>` : say('eyebrow')}</p>
    <h1 id="key-title">${underline(say('h1'), say('h1.mark'))}</h1>
    <p class="site-lede">${say('lede')}</p>
  </div>
</section>

<section class="site-section is-side" aria-labelledby="key-request">
  <h2 id="key-request">${say('form.title')}</h2>
  <p id="sent" class="key-state" role="status">${say('sent')}</p>
  <p id="again" class="key-state is-again" role="status">${say('again')}</p>
  <form id="key-form" class="key-form" method="post" action="${kit.site('keys')}" data-quote="${xml(JSON.stringify({ bands: BANDS, small: SMALL, valid: VALID, tax: TAX }))}">
    <input type="hidden" name="back" value="${ADDRESSES[lang]}">
    <input type="hidden" name="lang" value="${lang}">
    <input type="hidden" name="quote" value="">
    <fieldset class="key-kinds">
      <legend>${say('kind.legend')}</legend>${kinds.map(([name, text], i) => /* html */ `
      <label class="key-kind"><input type="radio" id="${KINDS[i]}" name="kind" value="${KINDS[i]}" required> <b>${name}</b><small>${text}</small></label>`).join('')}
    </fieldset>
    <div class="key-fields">
      <label>${say('organisation')}<input name="organisation" required maxlength="200" autocomplete="organization"></label>
      <label>${say('origins')}<input name="origins" required maxlength="1000" placeholder="https://assistant.example.org" dir="ltr" aria-describedby="key-origins" autocomplete="url"></label>
      <p id="key-origins" class="key-hint">${say('origins.hint')}</p>
      <label>${say('people')}<input type="number" name="people" required min="1" step="1" inputmode="numeric"></label>
      <label>${say('name')}<input name="name" required maxlength="200" autocomplete="name"></label>
      <label>${say('email')}<input type="email" name="email" required maxlength="254" autocomplete="email" dir="ltr"></label>
    </div>
    <fieldset class="key-more" data-kind="free">
      <legend>${say('free.legend')}</legend>${radios('for', FREE, kit.list('free', params))}
    </fieldset>
    <fieldset class="key-more" data-kind="subscription">
      <legend>${say('billing.legend')}</legend>
      <fieldset class="key-choices">
        <legend>${say('country')}</legend>${radios('country', PLACES, kit.list('countries'))}
      </fieldset>
      <label>${say('vat')}<input name="vat" maxlength="20" autocomplete="off" dir="ltr"></label>
      <label>${say('address')}<textarea name="address" rows="3" maxlength="500" autocomplete="street-address"></textarea></label>
      <label class="key-choice"><input type="checkbox" name="trial" checked> <span>${say('trial')}</span></label>
      <p class="key-note" data-when="small" hidden>${say('quote.small')}</p>
      <p class="key-note" data-when="large" hidden>${say('quote.large')}</p>
      <article class="key-quote" data-when="quote" hidden aria-labelledby="key-quote">
        <h3 id="key-quote">${slots('quote.title')}</h3>
        <p>${slots('quote.dated')}</p>
        <div class="key-parties">
          <div><p class="key-party">${say('quote.from')}</p><p translate="no">${seller.join('<br>')}</p></div>
          <div><p class="key-party">${say('quote.to')}</p><p><span data-fill="organisation"></span><br><span class="key-address" data-fill="address"></span></p><p data-when="vat" hidden>${slots('quote.vat')}</p></div>
        </div>
        <table>
          <thead><tr><th scope="col">${say('quote.what')}</th><th scope="col">${say('quote.price')}</th></tr></thead>
          <tbody><tr><td>${slots('quote.line')}</td><td data-fill="price"></td></tr></tbody>
          <tfoot>
            <tr data-when="taxed" hidden><th scope="row">${say('quote.tax')}</th><td data-fill="tax"></td></tr>
            <tr data-when="taxed" hidden><th scope="row">${say('quote.total')}</th><td data-fill="total"></td></tr>
            <tr data-when="reverse" hidden><td colspan="2">${say('quote.reverse')}</td></tr>
            <tr data-when="outside" hidden><td colspan="2">${say('quote.outside')}</td></tr>
          </tfoot>
        </table>
        <ul class="key-terms">${kit.list('quote.terms', params).map((term) => /* html */ `<li>${term}</li>`).join('')}</ul>
        <p class="key-accept">${say('quote.accept')}</p>
        <p><button class="button key-print" type="button">${say('quote.print')}</button></p>
      </article>
    </fieldset>
    <label>${say('message')}<textarea name="message" rows="3" maxlength="2000"></textarea></label>
    <div hidden><label>${say('trap')}<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <p class="key-send"><button class="button primary" type="submit">${say('send')}</button></p>
    <p class="site-source">${say('privacy')}${privacy ? /* html */ ` <a href="${privacy}">${say('privacy.link')}</a>` : ''}</p>
  </form>
</section>`
  },
}
