// A picture made on this device or by a server on this computer says it was made by a trained model
// (D279), as the AI Act's Article 50(2) asks of what such a system makes: IPTC's Digital Source Type in
// its XMP, which C2PA, the AI Act's code of practice and the large platforms read, with the maker's name
// and revision (IPTC 2025.1). A PNG only, as these make; a provider's picture keeps its own marks (C2PA,
// SynthID), which a change of its bytes would break.
import { crc32 } from '../../core/zip.js'

export const GENERATED = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const escaped = (/** @type {string} */ text) => text.replace(/[<>&"]/g, (char) => `&#${char.charCodeAt(0)};`)

/**
 * The PNG with an XMP packet saying which trained model made it, in an iTXt chunk after its header;
 * anything else as it is. @param {Uint8Array} bytes @param {string} maker @param {string} [revision]
 */
export function marked(bytes, maker, revision) {
  if (SIGNATURE.some((byte, i) => bytes[i] !== byte) || new TextDecoder().decode(bytes.subarray(12, 16)) !== 'IHDR') return bytes
  const version = revision ? ` Iptc4xmpExt:AISystemVersionUsed="${escaped(revision)}"` : ''
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="${GENERATED}" Iptc4xmpExt:AISystemUsed="${escaped(maker)}"${version}/></rdf:RDF></x:xmpmeta>`
  // Its type, its keyword, uncompressed, no language: then the packet.
  const body = new TextEncoder().encode(`iTXtXML:com.adobe.xmp\0\0\0\0\0${xmp}`)
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
