---
name: budget
description: "Make a budget as a spreadsheet the user can keep up: a household's month or year, a student's, a trip, a wedding or another event, a project, a club or a small business. Money in and out by category, planned against spent, with totals, what is left, and a chart of where the money goes."
metadata:
  format: "1"
  blocks: echarts
  title-en: "Budget"
  text-en: "Money in and out in a spreadsheet, with a chart"
  title-am: "በጀት"
  text-am: "ገቢ እና ወጪ በሰንጠረዥ፣ ከገበታ ጋር"
  title-ar: "ميزانية"
  text-ar: "الدخل والمصروفات في جدول بيانات، مع رسم بياني"
  title-bn: "বাজেট"
  text-bn: "আয় ও ব্যয় একটি স্প্রেডশিটে, চার্টসহ"
  title-br: "Budjed"
  text-br: "Arc’hant o tont hag o vont en ur renkell, gant ur grafik"
  title-co: "Bilanciu"
  text-co: "Entrate è spese in un fogliu di calculu, cù un graficu"
  title-de: "Budget"
  text-de: "Einnahmen und Ausgaben als Tabelle, mit Diagramm"
  title-es: "Presupuesto"
  text-es: "Ingresos y gastos en una hoja de cálculo, con un gráfico"
  title-fa: "بودجه"
  text-fa: "درآمد و هزینه در یک صفحه‌گسترده، با نمودار"
  title-fr: "Budget"
  text-fr: "Entrées et dépenses dans un tableur, avec un graphique"
  title-fr-CA: "Budget"
  text-fr-CA: "Entrées et dépenses dans un tableur, avec un graphique"
  title-ha: "Kasafin kuɗi"
  text-ha: "Kuɗin shiga da na fita a cikin takardar lissafi, tare da jadawali"
  title-he: "תקציב"
  text-he: "הכנסות והוצאות בגיליון אלקטרוני, עם תרשים"
  title-hi: "बजट"
  text-hi: "आमदनी और ख़र्च एक स्प्रेडशीट में, चार्ट के साथ"
  title-id: "Anggaran"
  text-id: "Pemasukan dan pengeluaran dalam spreadsheet, dengan grafik"
  title-it: "Budget"
  text-it: "Entrate e uscite in un foglio di calcolo, con un grafico"
  title-ja: "予算"
  text-ja: "収入と支出を表計算にまとめ、グラフも添えます"
  title-ko: "예산"
  text-ko: "수입과 지출을 스프레드시트로, 차트와 함께"
  title-mr: "अंदाजपत्रक"
  text-mr: "उत्पन्न आणि खर्च स्प्रेडशीटमध्ये, तक्त्यासह"
  title-ms: "Bajet"
  text-ms: "Wang masuk dan keluar dalam hamparan, dengan carta"
  title-nl: "Budget"
  text-nl: "Inkomsten en uitgaven in een spreadsheet, met een grafiek"
  title-pl: "Budżet"
  text-pl: "Wpływy i wydatki w arkuszu, z wykresem"
  title-pt: "Orçamento"
  text-pt: "Entradas e saídas numa folha de cálculo, com um gráfico"
  title-ru: "Бюджет"
  text-ru: "Доходы и расходы: таблица и диаграмма"
  title-sw: "Bajeti"
  text-sw: "Mapato na matumizi katika lahajedwali, pamoja na chati"
  title-ta: "வரவுசெலவுத் திட்டம்"
  text-ta: "வரவும் செலவும் ஒரு விரிதாளில், வரைபடத்துடன்"
  title-te: "బడ్జెట్"
  text-te: "ఆదాయం, ఖర్చులు ఒక స్ప్రెడ్‌షీట్‌లో, చార్ట్‌తో"
  title-th: "งบประมาณ"
  text-th: "รายรับรายจ่ายในสเปรดชีต พร้อมแผนภูมิ"
  title-tl: "Badyet"
  text-tl: "Perang pumapasok at lumalabas sa spreadsheet, may tsart"
  title-tr: "Bütçe"
  text-tr: "Gelir ve giderler bir tabloda, grafikle"
  title-uk: "Бюджет"
  text-uk: "Доходи й витрати: таблиця й діаграма"
  title-ur: "بجٹ"
  text-ur: "آمدنی اور اخراجات ایک اسپریڈ شیٹ میں، چارٹ کے ساتھ"
  title-vi: "Ngân sách"
  text-vi: "Thu và chi trong bảng tính, kèm biểu đồ"
  title-yo: "Ètò ìnáwó"
  text-yo: "Owó tí ń wọlé àti tí ń jáde nínú tábìlì, pẹ̀lú àwòrán"
  title-zh-Hans: "预算"
  text-zh-Hans: "把收入和支出做成表格，并配图表"
  title-zh-Hant: "預算"
  text-zh-Hant: "把收入和支出做成試算表，並附圖表"
---
# Budget

Make the budget an Excel file with `write`, and show where the money goes as a chart in the answer.

## Steps

1. Gather what it is for and its period (a month, a year, a trip); the currency; the money coming in (pay, allowances, sales, gifts); the money going out, with how often each is paid (every month, every year, once); and any goal, such as saving an amount by a date. Take what the conversation and shared files hold (bank statements, payslips, bills, quotes), then ask for the rest with `ask_user`, all at once.
2. Never make an amount up. One that isn't known is a blank cell for the user to fill, or an estimate that says so in its row ("estimate"). From a statement, put each line in a category; when there are many lines, total them on the computer, exactly.
3. Write the spreadsheet as Markdown tables, each under a heading that names its sheet:
   - a "Budget" sheet with the columns Category, Item, Planned, Spent and Difference: money in first, then money out by category (housing, food, transport, health, children, debts, savings, leisure, other, as fits the user's life and country);
   - Difference as a formula (=C2-D2), a total under each column (=SUM(C2:C9)), and what is left: money in minus money out;
   - in a monthly budget, what is paid once a year divided by 12, its item saying so ("Car insurance, 1/12 of the year");
   - for a year, a "Months" sheet with a column a month;
   - numbers plain (1234.5), and the currency in the column's name ("Planned (€)"), never in a cell.
4. Name the file in the user's language, such as "Household budget 2026.xlsx".
5. In the answer, say in a sentence what comes in, what goes out and what is left. Then draw where the money goes in a fenced block tagged `echarts`, an ECharts option in strict JSON: a ring of spending by category (`"type": "pie"`, `"radius": ["40%", "70%"]`, seven slices at most, the rest as "Other"), or bars of planned against spent. Names in the user's language; no colours, which follow the user's theme.
6. Then give two or three suggestions drawn from their numbers (the largest category, a subscription, how much to put aside each month to reach the goal), without judging. Give no investment advice; for debts that are hard to repay, point to a free debt-advice service where the user lives.
