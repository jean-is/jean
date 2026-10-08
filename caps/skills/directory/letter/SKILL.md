---
name: letter
description: "Write a formal letter as a Word document, laid out as letters are where it is sent: to an administration, a landlord, a bank, an insurer, an employer, a school or a company, to ask, complain, cancel, resign, apply, appeal, give notice or reply."
metadata:
  format: "1"
---
# Formal letter

Write the letter in Markdown with `write`, as a `.docx` the user prints, signs and sends, or attaches to an email. Follow the conventions of the country it is sent to, in its language, which is usually the user's.

## Steps

1. Gather what the letter needs: the sender's name and address; the recipient's name or department and address; the facts, with dates and amounts; the references (customer, contract, file or invoice number); what the user wants, and by when; what is enclosed. Take what the conversation, shared files and memory hold, then ask for the rest with `ask_user`, all at once. For what the user would rather fill in by hand, leave a placeholder in brackets, such as [your phone number], and say so.
2. Lay it out, everything aligned left, as block letters are, which every country accepts:
   - the sender's name and address, one line each, then the recipient's, then the place and date written out in the user's language;
   - the subject on its own line, then the greeting, the body and the closing, then the sender's name, with room to sign;
   - "Enclosures:" and their list at the end, when there are any.

   End each line of an address with a backslash, so its lines stay together:

```markdown
Marie Dupont\
12 rue des Lilas\
69003 Lyon
```

3. Use the greeting and closing of the country and of the case, for example:
   - France: "Objet : …", "Madame, Monsieur,", and "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées." Cancellations and disputes go by "lettre recommandée avec accusé de réception", said under the date.
   - Germany (DIN 5008): the subject in bold, with no word before it; "Sehr geehrte Damen und Herren," and the body starting in lower case; "Mit freundlichen Grüßen", with no comma.
   - United Kingdom: "Dear Sir or Madam" with "Yours faithfully", or "Dear Ms Smith" with "Yours sincerely". United States: "Dear Ms. Smith:" and "Sincerely,", the date written "October 8, 2026".
   - Spain and Latin America: "Estimados señores:", with a colon, and "Atentamente,".
   - Japan: 拝啓 with 敬具, a seasonal greeting after 拝啓, 御中 after a company's name and 様 after a person's.
   - Arabic: "تحية طيبة وبعد،" and "وتفضلوا بقبول فائق الاحترام والتقدير".
4. Write the body in short paragraphs: the request in the first lines; then the facts, with dates and amounts; then what the user expects, and by when. Polite and firm, never threatening. Name a law only when the user gives it or you are sure of it, with its article. One page when possible.
5. Name the file in the user's language after what it is and to whom, such as "Cancelling my phone plan.docx".
6. After it, say what to check (placeholders, dates, amounts), how to send it (registered post when a date or a proof matters, and a copy kept), and the deadline if there is one. For a letter with legal stakes, such as a dispute, a dismissal or a tax appeal, suggest having it read by a professional or a free advice service.
