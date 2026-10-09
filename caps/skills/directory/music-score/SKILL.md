---
name: music-score
description: "Write music as a score the user can see and play, in ABC notation: a melody, a tune, a song's chords, an exercise or a transcription, when the user asks for sheet music, notes to play or a tune."
metadata:
  format: "1"
  blocks: abc
  title-en: "Music score"
  text-en: "Tunes written as sheet music, to read and to play"
  title-am: "የሙዚቃ ኖታ"
  text-am: "እንደ ሙዚቃ ኖታ የተጻፉ ዜማዎች፣ ለማንበብና ለመጫወት"
  title-ar: "نوتة موسيقية"
  text-ar: "ألحان مكتوبة بالنوتة الموسيقية، لقراءتها وعزفها"
  title-bn: "স্বরলিপি"
  text-bn: "স্বরলিপিতে লেখা সুর, পড়তে আর বাজাতে"
  title-de: "Noten"
  text-de: "Melodien als Notenblatt, zum Lesen und Abspielen"
  title-es: "Partitura"
  text-es: "Melodías escritas en partitura, para leer y tocar"
  title-fa: "نت موسیقی"
  text-fa: "آهنگ‌هایی که به صورت نت نوشته شده‌اند، برای خواندن و نواختن"
  title-fr: "Partition"
  text-fr: "Des airs écrits en partition, à lire et à jouer"
  title-ha: "Rubutun waƙa"
  text-ha: "Waƙoƙin da aka rubuta a matsayin rubutun waƙa, don karantawa da kunnawa"
  title-he: "תווים"
  text-he: "מנגינות כתובות בתווים, לקריאה ולנגינה"
  title-hi: "संगीत स्वरलिपि"
  text-hi: "स्वरलिपि में लिखी धुनें, पढ़ने और बजाने के लिए"
  title-id: "Partitur musik"
  text-id: "Melodi yang ditulis sebagai partitur, untuk dibaca dan dimainkan"
  title-it: "Spartito"
  text-it: "Melodie scritte come spartito, da leggere e da suonare"
  title-ja: "楽譜"
  text-ja: "メロディーを楽譜にして、読んだり再生したりできます"
  title-ko: "악보"
  text-ko: "멜로디를 악보로 적어 보고 연주할 수 있습니다"
  title-mr: "स्वरलिपी"
  text-mr: "स्वरलिपीत लिहिलेल्या चाली, वाचण्यासाठी आणि वाजवण्यासाठी"
  title-ms: "Skor muzik"
  text-ms: "Melodi yang ditulis sebagai skor muzik, untuk dibaca dan dimainkan"
  title-nl: "Bladmuziek"
  text-nl: "Melodieën op notenschrift, om te lezen en af te spelen"
  title-pl: "Nuty"
  text-pl: "Melodie zapisane nutami, do czytania i odtwarzania"
  title-pt: "Partitura"
  text-pt: "Melodias escritas em partitura, para ler e tocar"
  title-ru: "Нотная запись"
  text-ru: "Мелодии, записанные нотами, чтобы читать и играть"
  title-sw: "Nota ya muziki"
  text-sw: "Nyimbo zilizoandikwa kwa nota, za kusoma na kupiga"
  title-ta: "இசைக் குறிப்பு"
  text-ta: "இசைக் குறிப்புகளாக எழுதப்பட்ட மெட்டுகள், படிக்கவும் இசைக்கவும்"
  title-te: "సంగీత స్వరలిపి"
  text-te: "స్వరలిపిగా రాసిన రాగాలు, చదవడానికి, వాయించడానికి"
  title-th: "โน้ตเพลง"
  text-th: "ทำนองที่เขียนเป็นโน้ตเพลง ไว้อ่านและเล่น"
  title-tl: "Piyesa ng musika"
  text-tl: "Mga himig na isinulat bilang piyesa, para basahin at tugtugin"
  title-tr: "Nota"
  text-tr: "Nota olarak yazılmış ezgiler, okumak ve çalmak için"
  title-uk: "Нотний запис"
  text-uk: "Мелодії, записані нотами, щоб читати й грати"
  title-ur: "موسیقی کی نوٹیشن"
  text-ur: "نوٹیشن میں لکھی دھنیں، پڑھنے اور بجانے کے لیے"
  title-vi: "Bản nhạc"
  text-vi: "Giai điệu viết thành bản nhạc, để đọc và để chơi"
  title-yo: "Àkọsílẹ̀ orin"
  text-yo: "Àwọn ohùn orin tí a kọ sílẹ̀ bí àkọsílẹ̀ orin, láti kà àti láti ṣe"
  title-zh-Hans: "乐谱"
  text-zh-Hans: "写成乐谱的旋律，可读可播放"
  title-zh-Hant: "樂譜"
  text-zh-Hant: "寫成樂譜的旋律，可讀可播放"
---
# Music score

Write music in ABC notation in a fenced code block tagged `abc`. It is drawn as a score where the block is, with a button to play it, each note lit as it sounds.

```abc
X:1
T:The Legacy Jig
M:6/8
L:1/8
Q:3/8=116
R:jig
K:G
GFG BAB | gfg d2B | GFG BAB | d2B G2B |
GFG BAB | gfg d2B | c2c B2A | GFG B2G :|
```

## Steps

1. The header, one field a line, in this order:
   - `X:1`, then `T:` the title, in the user's language unless the piece is known by its own;
   - `C:` the composer, when known;
   - `M:` the metre (`4/4`, `3/4`, `6/8`, `C`), and `L:` the length of a plain note, usually `1/8`;
   - `Q:` the tempo, such as `Q:1/4=100`;
   - `K:` the key, always last (`G`, `Dm`, `Bb`, `Ador`).
2. Notes: `C D E F G A B` from middle C up, `c d e f g a b` the octave above, `c'` higher still and `C,` lower. A number after a note changes its length (`A2`, `A3/2`, `A/2`). `^` sharpens a note, `_` flattens it and `=` makes it natural. `z` is a rest.
3. Bars: `|` between them, `|:` and `:|` around a repeat, `[1` and `[2` for first and second endings, `|]` at the end. Check that every bar adds up to the metre.
4. Chords: their names in quotes before a note (`"Am"A2`), notes sounding together in square brackets (`[CEG]`). Lyrics go on a `w:` line under the music they're sung to, a syllable a note, a word's syllables joined by `-`.
5. A melody with a bass, or several voices: `V:1` and `V:2 clef=bass` in the header, then each voice's music after its own `V:` line.
6. One tune a block; for several, several blocks. Compose, or write out music in the public domain; of a song still under copyright, give the chords or a short phrase, not the whole melody.
7. After the block, say in a sentence what the music is and how to play it.
