# Answer certificates

About this answer's certificates: the legal ground they stand on, what Jean has now, and the work left, written so that another agent can pick it up.
- **Research date:** 2026-10-11. Laws and standards move, so check before relying on anything here.
- **How it works:** [architecture.md](architecture.md) › About this answer, its bullets *The certificate*, *Checking* and *Witnesses*.
- **Why:** [decisions.md](decisions.md), D252 · D264 · D274 and D276.

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
6. **Anyone can check.** The check page works offline, in every language. Standard tools also work (JOSE and SD-JWT libraries, OpenSSL, EU DSS, cosign), and a published JSON Schema describes the format.
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
  - the `.sd-jwt` proof carries them;
  - the schema is `caps/receipt/certificate.schema.json`;
  - Settings › Approvals shows the seal's fingerprint.
- **Checking** (D274):
  - `check.html` (its policy reaches Jean's own files only);
  - the `certificates` capability, whose `check_certificate` is unlocked by a shared certificate or proof and shows the same card in the answer.
- **Witnesses** (D276): opt-in, on the card.
  - RFC 3161 tokens as JAdES `sigTst`, checked before they are kept;
  - Sigstore's Rekor, its answer kept as a Sigstore bundle;
  - the gateway's `timestamps` and `logs`;
  - Jean checks the log's promise with the log's key.
- **The AI Act's mark on pictures made here** (D279): each picture made on this device or by a server on this computer carries IPTC's `DigitalSourceType` `trainedAlgorithmicMedia`, with AI System Used and AI System Version Used, as XMP in an `iTXt` chunk (`caps/pictures/mark.js`), written before the file is named by its hash, so the certificate's digest covers the marked file; a provider's picture is left as it comes.
- **Tests:**
  - `test/receipt.test.js` (format, salting, schema with ajv, Node's own crypto as the independent verifier, witnesses);
  - `test/der.test.js`, `test/gateway.test.js`, `test/certificates.spec.js`;
  - fixtures: `test/fixtures/tsa.js` (an authority and a log) and `test/fixtures/sigstore.tsr` (a real token).

## Work left

### 1. By hand

On [roadmap.md](roadmap.md)'s checklist (D274, D276):
- EU DSS on a certificate (B-B, then B-T through a qualified authority and the gateway);
- an SD-JWT library on a proof;
- `cosign verify-blob` on a bundle;
- the check page in Firefox and real Safari.

### 2. Gaps in what is built

- [ ] **Settings to name witnesses, the log and a brain's jurisdiction.** Today only policy, the settings file or the gateway can set `urls.timestamp`, `urls.transparencyLog` or a brain's `jurisdiction`. Add them to Settings › Approvals, beside the seal, with strings in every language.
- [ ] **Dating a certificate already saved.** The plan said the check card in Jean would offer it; it isn't built. `witness()` can add a `sigTst` to a saved file without re-sealing.
- [ ] **The log's promise on the check page.** The page reaches nothing, so it leaves the promise unchecked. Options:
  - known logs' keys shipped with policy;
  - a key the visitor pastes;
  - the page allowed to reach the default log's host only.
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

- [ ] **Pictures made on this device or by a server on this computer** (the device makes no films), two layers. The IPTC/XMP metadata is done (D279); left:
  - **Metadata:** a C2PA manifest with `c2pa.created`, `digitalSourceType` `trainedAlgorithmicMedia`, the model and its revision, and a `c2pa.hash.data` hard binding. It is signed with the device's X.509 certificate and timestamped by the witnesses.
  - **Watermark:** an imperceptible one, for example Adobe's open-source TrustMark, on ONNX Runtime, with weights pinned by `ui/weights.js`. Choosing it is a dependency decision.
  - **Order:** mark before the file is named by its hash, so the certificate's digest covers the marked file, as `make()` does for the XMP.
  - **Code:** JUMBF, CBOR and COSE, or c2pa-rs in WASM, loaded on demand (its own decision).
- [ ] **Pictures and films from the cloud:** pass the providers' marks through untouched, with a test that the bytes are unchanged.
- [ ] **Files Jean makes** (`caps/made/formats.js`): metadata where the format can carry it.
- [ ] **Answers:**
  - the certificate is the metadata layer;
  - for cloud brains, rely on providers' marking, documented per provider;
  - for the device's brain, research a statistical watermark in its sampling (above 200 tokens).
- [ ] **Detection:** the check page reads C2PA manifests and watermarks; interoperable through C2PA by 2 Feb 2027.
- [ ] **No stripping:** Jean never removes marks, and its terms forbid removing them.
- [ ] **Labels for deployers (Art. 50(4)):** "Label it as made with AI" when a picture, film or document is saved, with the Commission's icon (if its reuse terms allow shipping it) and a line in the user's language.

### 5. Open legal questions

On [open-questions.md](open-questions.md#answer-certificates).

## Notes for whoever picks this up

- **Budgets:** since D278, `loc.app` allows 23,000 lines, of which about 22,550 are used, and D275's branch adds about 42 more. Section 3 or 4 will need room: tighten first, then ask the owner, then raise in a commit of its own with its own decision ([AGENTS.md](../AGENTS.md)). The first load, at about 103 of 103.5 KB, has the least room, so keep these phases out of it.
- **Decision numbers in use:**
  - D272: the line budget;
  - D273: saying Jean is an AI;
  - D274: certificates and checking;
  - D275: picture safeguards, on its own branch;
  - D276: witnesses.

  Find the highest in `docs/decisions.md` and every `.claude/worktrees/*` just before taking one.
- **Shared checkout:** other sessions keep uncommitted edits in the shared checkout. Commit only your own hunks: rebuild shared files from `HEAD` plus your edits, test that snapshot, and commit it with a temporary index.
- **Testing without the network:**
  - the authority and log fixtures (`test/fixtures/tsa.js`);
  - Playwright routes for `timestamp.sigstore.dev` and `rekor.sigstore.dev`;
  - `openssl ts -reply -section <name>` with a local config also makes test tokens.
- **Check before publishing:** submitting to a public log publishes permanently, so ask the owner first.
