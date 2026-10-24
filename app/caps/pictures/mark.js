// A picture made on this device or by a server on this computer says it was made by a trained model
// (D279), as the AI Act's Article 50(2) asks of what such a system makes: IPTC's Digital Source Type in
// its XMP, which C2PA, the AI Act's code of practice and the large platforms read, with the maker's name
// and revision (IPTC 2025.1). A PNG, as these make, and an MP4, as a film made on this device is (D585); a
// provider's picture keeps its own marks (C2PA, SynthID), which a change of its bytes would break.
import { crc32 } from '../../core/zip.js'

export const GENERATED = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
/** The UUID of XMP's box in an MP4, as XMP's specification (part 3) names it. */
const XMP_BOX = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]
const escaped = (/** @type {string} */ text) => text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`)

/** An XMP packet saying which trained model made something, and at which revision; an SVG Jean writes carries one too (D324). @param {string} maker @param {string} [revision] */
export const xmpOf = (maker, revision) => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="${GENERATED}" Iptc4xmpExt:AISystemUsed="${escaped(maker)}"${revision ? ` Iptc4xmpExt:AISystemVersionUsed="${escaped(revision)}"` : ''}/></rdf:RDF></x:xmpmeta>`

/**
 * The PNG with an XMP packet saying which trained model made it, in an iTXt chunk after its header; the MP4 with it
 * in a top-level `uuid` box at its end; anything else as it is. @param {Uint8Array} bytes @param {string} maker @param {string} [revision]
 */
export function marked(bytes, maker, revision) {
  if (new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp') {
    const box = [...new TextEncoder().encode('uuid'), ...XMP_BOX, ...new TextEncoder().encode(xmpOf(maker, revision))]
    const film = new Uint8Array(bytes.length + 4 + box.length)
    film.set(bytes)
    new DataView(film.buffer).setUint32(bytes.length, 4 + box.length)
    film.set(box, bytes.length + 4)
    return film
  }
  if (SIGNATURE.some((byte, i) => bytes[i] !== byte) || new TextDecoder().decode(bytes.subarray(12, 16)) !== 'IHDR') return bytes
  // Its type, its keyword, uncompressed, no language: then the packet.
  const body = new TextEncoder().encode(`iTXtXML:com.adobe.xmp\0\0\0\0\0${xmpOf(maker, revision)}`)
  // The signature and IHDR (13 bytes, with its length, type and CRC), then the chunk: its length, its body, its CRC.
  const head = 8 + 25
  const out = new Uint8Array(bytes.length + body.length + 8)
  const view = new DataView(out.buffer)
  out.set(bytes.subarray(0, head))
  view.setUint32(head, body.length - 4)
  out.set(body, head + 4)
  view.setUint32(head + 4 + body.length, crc32(body))
  out.set(bytes.subarray(head), head + 8 + body.length)
  return out
}
