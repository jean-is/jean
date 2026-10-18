# Answer certificates

About this answer's certificates: the legal ground they stand on, what Jean has now, and the work left, written so that another agent can pick it up.
- **Research date:** 2026-10-11. Laws and standards move, so check before relying on anything here.
- **How it works:** [architecture.md](architecture.md) › About this answer, its bullets *The certificate*, *Checking* and *Witnesses*.
- **Why:** [decisions.md](decisions.md), D252 · D264 · D274, D276 and D279 · D324.

## Principles

1. **One format, every jurisdiction.** International open standards only:
   - IETF: JOSE, SD-JWT (RFC 9901), X.509, RFC 3161;
   - W3C Verifiable Credentials;
   - ETSI JAdES as the profile.

   No country-specific code path in the open code.
2. **Bring your own trust anchor.** By default the device seals with its own key and a certificate that key issues itself. A jurisdiction's stronger tier comes from an authority that policy names. Jean chooses none.
3. **Plural, replaceable witnesses.** Timestamps from authorities in several countries, plus an optional public log, all chosen by settings, policy or the gateway. No Jean server.
4. **The key never leaves the device.** It is non-extractable and never escrowed.
5. **The words stay private.** Every digest of what was said, shared or made is salted (128 bits, SD-JWT). Only the proof, which the user hands over, discloses the words.
6. **Anyone can check.** The check page works offline, in every language, but for a watermark's reader, downloaded once the visitor agrees (D407). Standard tools also work (JOSE and SD-JWT libraries, OpenSSL, EU DSS, cosign), and a published JSON Schema describes the format.
7. **Say where data went.** Name the host each cloud brain or maker was reached at, and its jurisdiction when settings or policy declare one.

## The legal ground (2026-10-11)

**Common ground (UNCITRAL):**
- **Model Law on Electronic Commerce, Art. 9:** evidential weight follows the reliability of how a record was made and kept.
- **Model Law on Electronic Signatures, Art. 6:** a reliable signature is linked to the signatory alone, under their control, and any change can be detected.
- **Model Law on Identity Management and Trust Services (2022):** seals and timestamps across borders.

The EU, US, Canadian and Singaporean laws below all descend from these.

| Need | EU | United States | Canada | Singapore |
|---|---|---|---|---|
| A signature the law recognises | eIDAS Art. 35 (seals); JAdES, ETSI TS 119 182-1 | ESIGN 15 U.S.C. §7001; UETA §7, and §9 (attribution by "the efficacy of any security procedure") | Provincial e-commerce acts (UECA family, Quebec's LCCJTI); PIPEDA Part 2 | Electronic Transactions Act 2010 s.8 |
| A stronger tier | Qualified seal from a qualified trust service provider: presumed intact and of correct origin | None in statute | SOR/2005-30: a certificate from a CA the Treasury Board Secretariat lists, presumed the person's (s.5) | ETA s.18–19 and Third Schedule ¶3: a certificate from an IMDA-accredited CA, a recognised CA or the Singpass public CA, **or an express agreement between sender and recipient** |
| An independent time | Qualified timestamp presumed accurate (Art. 41(2)) | Business records, FRE 803(6) and 902(11) | Records kept by a non-party, Canada Evidence Act s.31.3(c) | Records kept by a neutral third party, Evidence Act s.116A(2); ETA s.17 |
| Process and hashes | — | FRE 901(b)(9), 902(13), 902(14) (data identified by hash); proposed FRE 707 on hold | CEA s.31.3(a), s.31.5 (standards such as CAN/CGSB-72.34) | Evidence Act s.116A(1) |
| Where data went | GDPR Chapter V | HIPAA, GLBA, CCPA/CPRA | PIPEDA; Bill C-36 (PPCDA), tabled 15 June 2026; Quebec Law 25 s.17 | PDPA s.26 |
| AI provenance | AI Act Art. 50 (below) | California SB 942, operative 2 Aug 2026, and AB 853 (platforms detect provenance from 1 Jan 2027); NIST AI 100-4 | Voluntary code; no AI act (AIDA died) | Voluntary: the GenAI and Agentic AI governance frameworks; HTX's C2PA proof of concept |

**What no format fixes:** whoever controls the device can modify the page and have the real key sign a false claim. A certificate is a declaration its issuer is accountable for, not proof. Only an outside witness raises that ceiling: an organisation's authority or network proxy, or attestation from a cloud provider.

**The EU AI Act and Jean.** Art. 2(12)'s open-source exemption doesn't cover Art. 50, and supplying Jean free of charge still places it on the market, so Art. 50 applies to Jean. A breach costs up to €15M or 3% of turnover (Art. 99(4)).
- **Sources:**
  - the Commission's Art. 50 guidelines, C(2026) 5054, 20 July 2026;
  - the Code of Practice on marking and labelling, 10 June 2026, found adequate by the Commission and the AI Board;
  - the Digital Omnibus on AI, Regulation (EU) 2026/1744, in force since 27 July 2026.
- **Art. 50(1):** say it's an AI at the first interaction. In force since 2 Aug 2026; done by D273.
- **Art. 50(2):** mark the text, pictures, films and audio Jean generates, machine-readably.
  - **Layers:** at least two, per the Code: digitally signed, time-stamped, tamper-evident metadata, plus an imperceptible watermark.
  - **Text:** above 200 tokens it needs a watermark; free-form text, which can't carry metadata, may have one layer.
  - **Downstream providers:** may rely on the upstream model's marking if they show it works.
  - **Exempt:** captions and labels, source code, translations, standard editing.
  - **Deadline:** Jean's public launch, or 2 Dec 2026 if Jean was already on the market before 2 Aug 2026 (Omnibus).
- **Code of Practice, detection:** anyone can check for free whether content came from the system, interoperable through a public standard by 2 Feb 2027.
- **Code of Practice, stripping:** providers never remove marks and forbid others to.
- **Art. 50(4):** professional users label deepfakes, and AI text published on matters of public interest, unless a human reviewed it under editorial responsibility. The Commission offers icons for this.
- **High-risk use (Annex III), from 2 Dec 2027:** an organisation that uses Jean for, say, hiring becomes a provider. It then needs logs (Art. 12) kept at least 6 months (Arts. 19, 26(6)).
- **New Art. 5 bans (Omnibus):** generating non-consensual intimate images or child sexual abuse material without reasonable safeguards. Picture safeguards are D275.

**Witnesses and logs a browser can reach (CORS checked 2026-10-11):**

| Answers browsers | Doesn't (needs the gateway) |
|---|---|
| Sigstore's RFC 3161 authority, `timestamp.sigstore.dev` | DigiCert, Sectigo, FreeTSA, GlobalSign, SwissSign, SSL.com |
| GitHub's RFC 3161 authority | Rekor v2's shard |
| Rekor v1, `rekor.sigstore.dev` | |

Rekor v1 accepts Jean's hashedrekord with its self-issued X.509 certificate. One live test entry was made with the owner's permission (index 3206395001).

## What Jean has now

- **The certificate** (D274):
  - a W3C VC 2.0 sealed as a JWS in JAdES B-B, by the device's key and the X.509 certificate that key issues itself (`caps/receipt/der.js`);
  - the issuer is the RFC 9278 thumbprint URI of that key;
  - the words, shared files and made files are salted SD-JWT disclosures, kept in the conversation (`meta.certificate`);
  - where it was done (Jean's address, each brain's and maker's outside the device, what the page reached) is salted too, kept whole as `places`, which a share's proof leaves out (D361);
  - the `.sd-jwt` proof carries them;
  - the schema is `caps/receipt/certificate.schema.json`;
  - Settings › Approvals shows the seal's fingerprint.
- **Checking** (D274):
  - `check.html` (its policy reaches Jean's own files only; a watermark's reader comes from the weights host once the visitor agrees, D407);
  - the `certificates` capability, whose `check_certificate` is unlocked by a shared certificate or proof and shows the same card in the answer.
- **Witnesses** (D276): opt-in, on the card.
  - RFC 3161 tokens as JAdES `sigTst`, checked before they are kept;
  - Sigstore's Rekor, its answer kept as a Sigstore bundle;
  - the gateway's `timestamps` and `logs`;
  - Jean checks the log's promise with the log's key.
- **The AI Act's marks on pictures made here** (D279, D324): each picture made on this device or by a server on this computer carries, before the file is named by its hash, so the certificate's digest covers the marked file:
  - IPTC's `DigitalSourceType` `trainedAlgorithmicMedia`, with AI System Used and AI System Version Used, as XMP in an `iTXt` chunk (`caps/pictures/mark.js`);
  - Content Credentials (C2PA 2.2) in a `caBX` chunk (`caps/receipt/c2pa.js`): `c2pa.created` with that source type and the maker at its revision, a `c2pa.hash.data` hard binding, the claim signed by the seal and, when the user chose dating, timestamped by the first witness (`sigTst2`). c2patool 0.27.22 validates it all; it calls the signer untrusted, as it does any certificate outside its trust lists.

  A provider's picture or film is left as it comes, byte for byte (`test/c2pa.test.js`).
- **Reading Content Credentials** (D324): the check page and `check_certificate` read any picture's or film's manifest (PNG, JPEG, WebP, MP4, MOV), check its signature, its assertions and a data hash's binding, and say whether it says AI made it; a shared one brings Certificates. A film's box hashes (`c2pa.hash.bmff`) aren't checked, and the card says so.
- **Tests:**
  - `test/receipt.test.js` (format, salting, schema with ajv, Node's own crypto as the independent verifier, witnesses);
  - `test/der.test.js`, `test/c2pa.test.js`, `test/gateway.test.js`, `test/certificates.spec.js`;
  - fixtures: `test/fixtures/tsa.js` (an authority and a log), `test/fixtures/sigstore.tsr` (a real token), `test/fixtures/c2pa.png` and `c2pa.jpg` (signed by c2patool with its test signer).

## Work left

### 1. By hand

On [roadmap.md](roadmap.md)'s checklist (D274, D276):
- EU DSS on a certificate (B-B, then B-T through a qualified authority and the gateway);
- an SD-JWT library on a proof;
- `cosign verify-blob` on a bundle;
- the check page in Firefox and real Safari;
- the device's watermark (D402) in Chrome and Safari on WebGPU (q4f16): answers counted as in Node, and words pasted on the check page.

### 2. Gaps in what is built

- [ ] **Settings to name witnesses, the log and a brain's jurisdiction.** Today only policy, the settings file or the gateway can set `urls.timestamp`, `urls.transparencyLog` or a brain's `jurisdiction`. Add them to Settings › Approvals, beside the seal, with strings in every language.
- [ ] **Dating a certificate already saved.** The plan said the check card in Jean would offer it; it isn't built. `witness()` can add a `sigTst` to a saved file without re-sealing.
- [ ] **The log's promise on the check page.** The page reaches nothing a certificate names, so it leaves the promise unchecked. Options:
  - known logs' keys shipped with policy;
  - a key the visitor pastes;
  - the default log's key fetched once the visitor agrees, as a watermark's reader is (D407).
- [ ] **Inclusion proof:** verify the RFC 6962 inclusion proof against the checkpoint's signed note. Without the checkpoint's signature, the proof shows nothing.
- [ ] **A proof that carries its dates.** A proof is SD-JWT compact and has no `etsiU`, so a dated proof needs the certificate file beside it. Consider SD-JWT's JSON serialization, kept apart from the JAdES file.
- [ ] **The device brain's weights** (Transformers.js `from_pretrained`) aren't pinned, so `brains` names the repository only. Pin a revision, as `caps/pictures/device.js` does.
- [ ] **Hidden counts:** the number of shared and made files shows. SD-JWT decoy digests could hide it.
- [ ] **Rekor v2:** move to it once the public instance defaults to it and answers browsers.

### 3. Organisations: the first `ee/` module

`app/ee/` holds only its licence. AGENTS.md's loader comes first:
- one `import()` outside `ee/`;
- loaded only when policy holds a key;
- the key check inside `ee/`.

Then:
- [ ] **A certificate for the device's key from the organisation's authority:**
  - a PKCS#10 request, made with `der.js`, imported and never copied;
  - issued through EST (RFC 7030), ACME (RFC 8555) or an address policy names;
  - or remote sealing through the Cloud Signature Consortium API v2, the key staying at the provider.
  - **The authorities, configuration only:**

    | Jurisdiction | Authority | Effect |
    |---|---|---|
    | EU | Qualified seal certificates (ETSI EN 319 412-3) | Art. 35(2) presumption |
    | Singapore | IMDA-accredited CAs or the Singpass national CA | Third Schedule ¶3(b)(i)/(iii) |
    | Canada | CAs the Treasury Board Secretariat lists | SOR/2005-30, for federal requirements; provincial law otherwise |
    | United States | Federal PKI or a commercial CA | UETA §9 |
    | Elsewhere | Each national PKI | — |

- [ ] **JAdES B-LT:** the chain and OCSP or CRL data in `xVals`/`rVals`.
- [ ] **Trust anchors from policy** for the check page and `check_certificate`, the EU's List of Trusted Lists included. Today the card shows a chain's subjects and judges nothing.
- [ ] **Data residency:** policy declares each cloud brain's `jurisdiction` and can refuse brains outside the allowed ones.
- [ ] **AI Act high-risk use:** a minimum retention of conversations and certificates (6 months or more) that deletion respects, and a log export.

### 4. AI Act marking (Art. 50(2) and (4)): blocks the public launch

- [x] **Pictures made on this device or by a server on this computer** (the device makes no films), two layers (D279, D324): XMP and Content Credentials signed and timestamped, and TrustMark's watermark in the pixels, which the manifest names. What it took:
  - **Watermark:** Adobe's TrustMark (MIT, code and weights), variant Q, which C2PA's soft-binding list names `com.adobe.trustmark.Q`, on ONNX Runtime's WebGPU with tensors laid out channels first (`preferredLayout: 'NCHW'`), else WebAssembly, its encoder (17.3 MB) pinned by `ui/weights.js` from `jean-is/trustmark-onnx` on Hugging Face (revision `55ad52f`), Adobe's files unchanged, as Adobe's CDN (`cai-watermark.adobe.net`) keeps no revisions. Recorded in the manifest as a `c2pa.soft-binding` assertion, as TrustMark's example does. Measured: 49 dB, read back by TrustMark's own decoder from the PNG, a JPEG at 75 and a picture halved, in Chromium and WebKit. Laid out channels last, WebGPU's default, ONNX Runtime's convolution misreads the encoder's 6 input channels in every browser (any count that is a multiple of 3 but not of 4; microsoft/onnxruntime#32928 has the symptom), and 58 of the 100 bits come back wrong.
  - **Order:** the pixels first, then the XMP and the manifest, all before the file is named by its hash.
  - **Detection in Jean:** asked, `check_certificate` reads it with TrustMark's decoder (47.4 MB, downloaded the first time), Jean's own BCH_5 decoding agreeing with TrustMark's data layer on every word tried, and says whether it is the one the credentials name; it read the bits back from a JPEG at 70 in Chromium and WebKit, and nothing from a picture without one. TrustMark's own decoders (Python, Rust, JavaScript) read it too.
- [x] **Pictures and films from the cloud:** the providers' marks pass through untouched; `test/c2pa.test.js` checks the bytes are unchanged.
- [x] **Pictures people share** (D324): kept as given, with whatever marks they carry; brains see a copy no side of which passes 1568 pixels, made as the message is sent (`seenBy()` in `caps/files/pictures.js`).
- [x] **Files Jean makes** (`caps/made/formats.js`, D324): Word documents and workbooks in their custom properties (IPTC's `DigitalSourceType`, `AISystemUsed`), drawings in XMP, web pages in schema.org's JSON-LD; Markdown, CSV and other text carry none. C2PA in Office files waits for validators that open them. The check page and `check_certificate` read these back (D407), as unsigned, since anyone can write or remove them. What the device's brain writes in a file comes through a tool call, chosen greedily, so its words carry no watermark: the metadata is the file's mark.
- [x] **Answers:** free-form text can't carry metadata, so the code of practice asks one layer, a watermark above 200 tokens; the answer's certificate, when saved, is metadata beside it (D274, `trainedAlgorithmicMedia`). The guidelines let Jean rely on a brain's own watermark where it shows that it works and that a means of detection exists. What each does (2026-10-18, from the providers' announcements as reported; check their pages before relying on them):

  | Brain | Text watermark | What Jean can do |
  |---|---|---|
  | Anthropic | On for models released from 2 Aug 2026, every surface and the API included, worldwide (SynthID-Text's method); older models in a transition; detection announced, not yet open | Nothing: it comes with the answer |
  | OpenAI | textGrain, off by default in the API since 5 Oct 2026, for select models; on in ChatGPT and Codex in the EU; detection for approved researchers | The key's owner turns on Allow text watermarking (Organization or Project settings › Data controls › Text provenance); no request parameter exists, so Settings › Brains could say so |
  | Google Gemini | SynthID-Text in Google's Gemini apps since 2024; whether its API's answers carry it is reported both ways, and Google's documentation presents SynthID-Text as a logits processor for one's own model | To check on Google's own pages |
  | OpenRouter and gateways | Whatever the model's provider does | Same as that provider |
  | The device's brain | Jean's own (D402): each word the winner of Aaronson's race among those Gemma's sampling considers, keyed by the four tokens before, with an open key | Anyone counts it with Gemma's tokenizer, in Jean or on the check page; about half its answers show it at 500 tokens (below) |
  | Servers on this computer (Ollama, LM Studio) | None: they sample on their side, out of Jean's reach | Nothing |

  **The device's watermark, measured** (2026-10-18, D402). 24 requests in eight languages (English, French, German, Spanish, Japanese, Arabic, Chinese, Hindi), up to 320 tokens each, beside 29 texts people wrote (the terms, the docs, the dialogs' strings in six languages). Gemma 4 E2B itself (q4, Transformers.js in Node, `watermarker()` and `lean()` as Jean runs them), greedy and raced; and, for comparison, a brain smaller and one larger, through MLX with a Python copy of the race whose counts `lean()` matches to 1e-9 (`test/watermark.test.js` pins one), keyed on one token there.

  | | Gemma 4 E2B | Qwen3-0.6B | Gemma 4 26B-A4B |
  |---|---|---|---|
  | Deviations at 200 tokens, raced (mean) | 2.4 | 9.9 | 1.9 |
  | Raced answers over 4 at 200 tokens | 3 of 23 | 15 of 17 | 1 of 24 |
  | Whole raced answers (about 300 tokens) over 4 | 7 of 24 | 22 of 24 | 4 of 24 |
  | Highest unmarked (greedy or sampled answers, people's texts) | 3.09 (a French text of the terms) | 1.75 | 2.37 |
  | Log-loss a token: greedy, raced | 0.13, 0.25 | 0.44, 0.85 | 0.11, 0.20 |

  The watermark lives in a brain's doubt: a confident brain writes few words it could have written otherwise, and E2B is confident (0.25 nats a token). Each answer's strength per token, carried to longer texts, puts E2B's answers over 4 in about 1 in 6 at 200 tokens, 3 in 10 at 300, half at 500 and two thirds at 1,000; an answer as predictable as a list never shows it. So `said()` calls fewer than 300 tokens too short to tell, and the check never says words weren't written here. By language, E2B's raced answers counted 5.6 in Spanish, 3.2 to 3.5 in English, German, Japanese and Chinese, 2.5 in French, 2.0 in Hindi and 1.8 in Arabic over their whole length. A green-list bias of 2 under greedy decoding, the first try, counted 2.4 and 0.05 on the 26B's first two answers; on Qwen3-0.6B, eight raced answers with the four-token key counted 6.9 to 23.8.

  Left: E2B in real browsers, by hand (below); Google's API; a line in Settings › Brains for OpenAI keys, if Jean must tell their owners ([open-questions.md](open-questions.md#answer-certificates)).
- [x] **Detection, for anyone** (D324, D402, D407): the check page and `check_certificate` read C2PA manifests, what a file says of itself (an Office file's custom properties, XMP in a drawing, a PNG or a JPEG, a web page's JSON-LD), TrustMark's watermark, and the device's brain's watermark in words: `check_certificate { words }`, and on the check page words pasted or a dropped `.txt`, `.md` or `.docx`. Their readers, TrustMark's decoder (47.4 MB) and Gemma's tokenizer (19.4 MB), come from the browser's cache where Jean keeps them, else from the weights host: `check_certificate` downloads one the first time it is asked to look, the check page once the visitor agrees, saying from where and how much. Nothing given leaves the page, whose own policy reaches Jean's files only. Measured 2026-10-18 in fresh headless Chromium and WebKit, nothing of Jean's kept: a picture Jean's encoder watermarked, read in 2 to 12 s with the download; a Spanish answer of the device's brain (7.8 deviations), marked, pasted and in a Word document Jean made, whose marks were read too; only huggingface.co and its CDN reached. Anyone's C2PA tools read the manifests, and TrustMark's own decoders the watermark; a soft-binding lookup has no server to ask, so the watermark recovers nothing a stripped picture lost but the fact of it.
- [x] **No stripping:** Jean never removes marks: a provider's picture or film is kept byte for byte (`test/c2pa.test.js`), a shared picture as given (above), and answers' words are shown and copied as the brain wrote them, so a watermark in them stays. The terms (`terms.html`, section 4, in English and French) ask users not to remove or alter marks, Jean's or the brains'.
- [x] **Labels for deployers (Art. 50(4)), on pictures** (D324): a picture's second save draws the Commission's basic icon, which anyone may use without attribution, and "Made with AI" in the user's language in its corner, and marks the copy again. Left: films (re-encoded) and documents, if users ask; a provider's labelled picture keeps only Jean's marks, its own C2PA chain staying with the picture as first saved (an ingredient in the new manifest would carry it).

### 5. Open legal questions

On [open-questions.md](open-questions.md#answer-certificates).

## Notes for whoever picks this up

- **Budgets:** `npm run budgets` says how much room is left. Section 3 will need more: tighten first, then ask the owner, then raise in a commit of its own with its own decision ([AGENTS.md](../AGENTS.md)). The first load has the least room, so keep these phases out of it: the check card reaches an answer through `_meta.checked`, which `chat.js` already shows.
- **Decision numbers in use:**
  - D272: the line budget;
  - D273: saying Jean is an AI;
  - D274: certificates and checking;
  - D275: picture safeguards, on its own branch;
  - D276: witnesses;
  - D279 · D324: the marks on what Jean makes, their check and the labelled save;
  - D402: the device's brain's watermark;
  - D407: detection for anyone, files' own marks and the readers downloaded once the visitor agrees.

  Find the highest in `docs/decisions.md` and every `.claude/worktrees/*` just before taking one.
- **Shared checkout:** other sessions keep uncommitted edits in the shared checkout. Commit only your own hunks: rebuild shared files from `HEAD` plus your edits, test that snapshot, and commit it with a temporary index.
- **Testing without the network:**
  - the authority and log fixtures (`test/fixtures/tsa.js`), whose tokens Jean reads but c2patool doesn't date by: for that, a local OpenSSL authority, with a `timeStamping` key usage, below;
  - Playwright routes for `timestamp.sigstore.dev` and `rekor.sigstore.dev`;
  - `openssl ts -reply -section <name>` with a local config also makes test tokens;
  - c2patool (Content Authenticity's release from GitHub) validates a picture's manifest: `c2patool <file> --detailed`; it signs with its test signer given `-m <manifest.json>`, and `[builder.thumbnail] enabled = false` in `--settings` leaves out the thumbnail. c2pa-rs refuses a signer whose certificate has no organisation, and says only `claimSignature.mismatch`; `RUST_LOG=debug` shows the reason (`CoseX5ChainMissing`).
- **Check before publishing:** submitting to a public log publishes permanently, so ask the owner first.
