# Annotated test documents for a name detector

A privacy feature swaps people's names for placeholders before a document leaves a device. These documents test how many names a detector finds and how many ordinary words it wrongly hides. They need to look like real office documents, hard cases included. A misleadingly easy set would make a weak detector look safe, so write what a professional in that country really produces, not a neat template.

## What to write

15 documents in the one language you were given, written as a native professional writes it, in that country's conventions:
- 5 `contract`: employment contract, services agreement, lease, confidentiality agreement, sale of a small business, and the like: parties, recitals, clauses, signature block.
- 5 `payslip`: the text a PDF payslip gives when copied: key/value lines and squeezed columns, employer, employee, manager or HR contact, pay lines with amounts, a short note. Vary the layout between them, and lengthen them with an accompanying note, HR memo or a correction history so that each reaches the person-mention minimum.
- 5 `email`: threads of 2 to 4 messages with the headers that mail clients show (From/To/Cc/Sent in the local form), quoted replies, greetings, signatures, people talking about other people in passing.

Each document: 200 to 350 words (Japanese, Chinese, Korean: 500 to 900 characters), with at least 13 person mentions, and at least 3 marks of other kinds. Over the file: at least 200 person mentions and at least 70 distinct names. Don't use one template with the names changed: situations, sectors and layouts should vary.

## People: made up only

Every person is invented. Never a public, historical or fictional figure, and no name that evokes one. A combination should be plausible but ordinary. Companies are invented too. Cities and countries may be real. Email domains end in `.example`. Phone numbers are fake and use a number range reserved for fiction where the country has one. IBANs, tax and social security numbers are fake.

Mix of distinct names:
- About 60% typical of the language's main country or countries.
- About 25% from communities really living there (for French: Maghrebi, West African, Portuguese, Vietnamese; for German: Turkish, Polish, Syrian; for Arabic: across the Arab world, Kurdish, Amazigh, Coptic; for Japanese: Korean-Japanese, Brazilian-Japanese, Chinese; and so on).
- About 15% foreigners written as that language writes them: katakana, Chinese transliteration with its separator dot, Hangul, Arabic transliteration; in non-Latin languages a few foreign names left in Latin letters too, as business documents do.

At least 15% of distinct names double as ordinary words or as places in that language (English: Bell, Young, Hope, Mark; French: Blanc, Rose, Pierre; German: Vogel, Klein, Wolf; Spanish: Paz, Dolores, Cruz; Arabic: سعيد, أمل, جمال, نور; Japanese: 森, 林, 望, 愛; Chinese: 高, 白雪, 建国; Korean: 이슬, 한별, 나라, 하늘). Use other such names of your own too.

Vary the forms a name takes, as real documents do: full name; family name with a title (M. Durand, Frau Dr. Vogel, 田中様, 김 과장님, 王经理, السيد الأحمد); given name alone in greetings and sign-offs; family name in capitals (DURAND Marie); "Family, Given"; initials (J.-P. Durand); compound names (Marie-Claire, María del Carmen, Al-Masri, Ibn, van der); names with grammar attached (German genitive Müllers; French d'Hélène; Korean particles 김민수가; Arabic clitics وأحمد, لأحمد; Japanese names written without a space and with one).

Traps, left unmarked because they're ordinary words: job titles, departments, months and weekdays, product names that aren't companies, words like "Director", "Employer", "Mai", "Mark" as a currency, capitalised legal terms, table headings such as "Nom" or "氏名".

## Marks

Mark inline, exactly `[[KIND:value]]`, with `value` exactly the characters of the document. Kinds:
- `PF`: a person's name holding both given and family name in any order, initials included.
- `PS`: a person's short form: given name alone, family name alone, nickname, a lone initial plus nothing else.
- `O`: an organisation, including a company's legal form (`[[O:Durand & Fils SARL]]`). A name inside it is part of the organisation, not a person.
- `L`: a place: city, region, country, street address.
- `E`: an email address. `T`: a phone number. `I`: an identifier: IBAN, employee number, social security number, tax number, policy or file number.

Rules:
- Titles, honorifics and grammar stay outside the mark: `M. [[PS:Durand]]`, `[[PS:田中]]様`, `[[PF:김민수]]가`, `و[[PF:أحمد الزهراني]]`, `d'[[PS:Hélène]]`, `[[PS:Müller]]s`.
- Never nest marks, and put no space at the mark's ends. Only those seven kinds. Mark every occurrence, every time, including in headers, quoted lines and signatures. An unmarked real name counts against the detector, so check for that before you finish.
- Dates, amounts, job titles and departments stay unmarked. A title as a person's only mention stays unmarked.

## File format

One file, UTF-8, each document starting on its own line with a header, followed by its text with line breaks as in the real document:

```
=== id=<lang>-contract-1 type=contract
text…
=== id=<lang>-contract-2 type=contract
text…
```

Types are exactly `contract`, `payslip` and `email`. Nothing else in the file: no comments, no Markdown.

## Check

Run the checker on your file with the Bash tool and fix what it reports, until it says `no problems` and the counts meet the targets:

```bash
node /private/tmp/claude-501/-Users-arnaud-repos-codename-jean--claude-worktrees-determined-bhabha-f38197/35683ba6-d834-4d7f-be8f-96f05f79a4af/scratchpad/masks/parse.js /private/tmp/claude-501/-Users-arnaud-repos-codename-jean--claude-worktrees-determined-bhabha-f38197/35683ba6-d834-4d7f-be8f-96f05f79a4af/scratchpad/masks/corpus/<lang>.txt
```

Write the file with the Write tool, in one or a few steps. Do nothing else. Report only the checker's last output.
