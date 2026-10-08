---
name: compare
description: "Compare options side by side and recommend one: products, offers, quotes, plans and subscriptions, insurance, loans, flats, jobs, schools or suppliers. Weighs price, total cost over time, features and conditions in a table, and says which fits the user best, and why."
metadata:
  format: "1"
---
# Compare and choose

Lay the options out side by side, on the same basis, and recommend the one that fits what matters to the user.

## Steps

1. Find out what matters: what it is for, the budget, what is a must, what would be nice, what rules an option out, and how long it will be kept. Ask with `ask_user` only what the conversation doesn't already say, all at once, recommending the likely answer.
2. Gather each option's facts from what the user shared (quotes, offers, pages, links) or, when they ask you to find options, from the web, citing each source [n]. Put them on the same basis: the same quantity and period, taxes in or out for all, one currency. Never fill a gap with a guess: write "not stated", and say what to ask.
3. Work out what each one really costs over the same period: price, fees, delivery, setting up, subscription and what it uses up, less discounts. For example, a phone plan over 24 months, a loan's total cost, a quote with taxes. Compute it exactly, on the computer when there is much arithmetic.
4. Write a table: a column per option, five at most, and a row per criterion, total cost first; the best in each row in bold. Name the options left out, and why, in a sentence.
5. Recommend one: the best for the user's priorities, in a sentence, and the reasons. Then what each other one is best for (the cheapest, the best made, the most flexible). Name the catches: how long it ties the user, cancelling fees, guarantees, conditions in small print.
6. When two options are close, say so, and name the one question that would decide between them.
7. Offer the table as a spreadsheet (`write`, `.xlsx`) to keep or share.
