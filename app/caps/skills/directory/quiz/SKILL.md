---
name: quiz
description: "Quiz the user to help them learn or revise: questions on a topic, a lesson, a book, a document they shared, an exam's syllabus or a language they are learning, asked a few at a time with answers to pick from, then scored and explained."
metadata:
  format: "1"
  title-en: "Quiz me"
  text-en: "Questions to learn and revise, scored and explained"
  title-am: "ጥያቄና መልስ"
  text-am: "ለመማር እና ለመከለስ ጥያቄዎች፣ ከውጤት እና ማብራሪያ ጋር"
  title-ar: "اختبار قصير"
  text-ar: "أسئلة للتعلّم والمراجعة، مع الدرجة والشرح"
  title-bn: "কুইজ"
  text-bn: "শেখা ও ঝালিয়ে নেওয়ার প্রশ্ন, নম্বর ও ব্যাখ্যাসহ"
  title-br: "Goulenn ouzhin"
  text-br: "Goulennoù evit deskiñ hag adwelet, notennet ha displeget"
  title-co: "Fatemi un quiz"
  text-co: "Dumande per amparà è rivede, nutate è spiegate"
  title-de: "Quiz"
  text-de: "Fragen zum Lernen und Wiederholen, bewertet und erklärt"
  title-es: "Cuestionario"
  text-es: "Preguntas para aprender y repasar, puntuadas y explicadas"
  title-fa: "آزمونک"
  text-fa: "پرسش‌هایی برای یادگیری و مرور، با امتیاز و توضیح"
  title-fr: "Quiz"
  text-fr: "Des questions pour apprendre et réviser, notées et expliquées"
  title-fr-CA: "Quiz"
  text-fr-CA: "Des questions pour apprendre et réviser, notées et expliquées"
  title-ha: "Tambayoyin gwaji"
  text-ha: "Tambayoyi don koyo da bita, da maki da bayani"
  title-he: "בוחן"
  text-he: "שאלות ללמידה ולחזרה, עם ציון והסברים"
  title-hi: "क्विज़"
  text-hi: "सीखने और दोहराने के लिए सवाल, अंकों और व्याख्या के साथ"
  title-id: "Kuis"
  text-id: "Pertanyaan untuk belajar dan mengulang, dengan skor dan penjelasan"
  title-it: "Quiz"
  text-it: "Domande per imparare e ripassare, con punteggio e spiegazioni"
  title-ja: "クイズ"
  text-ja: "学習や復習のための問題。採点と解説つき"
  title-ko: "퀴즈"
  text-ko: "공부와 복습을 위한 문제, 채점과 해설 포함"
  title-mr: "प्रश्नमंजुषा"
  text-mr: "शिकण्यासाठी आणि उजळणीसाठी प्रश्न, गुण आणि स्पष्टीकरणासह"
  title-ms: "Kuiz"
  text-ms: "Soalan untuk belajar dan mengulang kaji, dengan markah dan penerangan"
  title-nl: "Overhoor me"
  text-nl: "Vragen om te leren en te herhalen, met score en uitleg"
  title-pl: "Quiz"
  text-pl: "Pytania do nauki i powtórki, z wynikiem i wyjaśnieniami"
  title-pt: "Quiz"
  text-pt: "Perguntas para aprender e rever, com pontuação e explicações"
  title-ru: "Тест"
  text-ru: "Вопросы для учёбы, с оценкой и разбором"
  title-sw: "Chemsha bongo"
  text-sw: "Maswali ya kujifunza na kurudia, yenye alama na maelezo"
  title-ta: "வினாடி வினா"
  text-ta: "கற்கவும் மீள்பார்வை செய்யவும் கேள்விகள், மதிப்பெண்ணும் விளக்கமும் உடன்"
  title-te: "క్విజ్"
  text-te: "నేర్చుకోవడానికి, పునశ్చరణకు ప్రశ్నలు, మార్కులు, వివరణలతో"
  title-th: "แบบทดสอบ"
  text-th: "คำถามสำหรับเรียนและทบทวน พร้อมคะแนนและคำอธิบาย"
  title-tl: "Quiz"
  text-tl: "Mga tanong para matuto at mag-review, may iskor at paliwanag"
  title-tr: "Test"
  text-tr: "Öğrenmek ve tekrar etmek için sorular, puanlı ve açıklamalı"
  title-uk: "Тест"
  text-uk: "Запитання для навчання, з оцінкою й розбором"
  title-ur: "کوئز"
  text-ur: "سیکھنے اور دہرانے کے لیے سوالات، نمبروں اور وضاحت کے ساتھ"
  title-vi: "Kiểm tra kiến thức"
  text-vi: "Câu hỏi để học và ôn tập, có chấm điểm và giải thích"
  title-yo: "Ìdánwò"
  text-yo: "Àwọn ìbéèrè láti kọ́ àti láti tún kà, pẹ̀lú máàkì àti àlàyé"
  title-zh-Hans: "测验"
  text-zh-Hans: "用于学习和复习的题目，打分并讲解"
  title-zh-Hant: "測驗"
  text-zh-Hant: "用於學習和複習的題目，評分並講解"
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
6. To revise later, offer flash cards for what was missed: a `.csv` written with `write`, as the flash-cards skill keeps them, which Anki imports: the lines `#separator:comma` and `#columns:front,back,box,due`, then a card per line, its question, its answer, box 1, and tomorrow's date as YYYY-MM-DD. For Quizlet, which takes a term and its definition, offer a copy with the question and answer alone.
