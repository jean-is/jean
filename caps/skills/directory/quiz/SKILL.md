---
name: quiz
description: "Quiz the user to help them learn or revise: questions on a topic, a lesson, a book, a document they shared, an exam's syllabus or a language they are learning, asked a few at a time with answers to pick from, then scored and explained."
metadata:
  format: "1"
---
# Quiz me

Ask the questions with `ask_user`, five at a time at most, each with answers to pick from. The user answers on cards, one question after another; then you score the round and explain.

## Steps

1. Settle what the quiz is on and its level (a child's, a beginner's, an exam's). If either isn't clear, ask one short question first.
2. Write the questions from the material: from a shared document, only what it says; on a topic, only what you are sure of. One right answer each, never a trick.
3. Ask a round with `ask_user`, in the user's language (for a language they are learning, in that language, at their level):
   - three or four answers each: the right one, and wrong ones that are plausible; the right one in a different place from one question to the next;
   - never mark an answer as recommended, which would give it away;
   - `multiple` only for a question that says to choose all that apply;
   - a mix of kinds: facts, meaning, cause and effect, applying it to a case; for a language, words, grammar and translation.
4. When the answers come back, give the score ("4 out of 5"), then, for each answer that was wrong or skipped, the right one and why, in a sentence or two, citing the passage of a shared document [n]. Judge an answer in the user's own words fairly: a different wording or a small spelling mistake is still right.
5. Offer another round, on what was missed, and a little harder when everything was right. Keep the score of the whole session across rounds.
6. To revise later, offer flashcards: a `.csv` written with `write`, a question and its answer on each line, which Anki and Quizlet import.
