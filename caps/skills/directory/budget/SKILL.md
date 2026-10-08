---
name: budget
description: "Make a budget as a spreadsheet the user can keep up: a household's month or year, a student's, a trip, a wedding or another event, a project, a club or a small business. Money in and out by category, planned against spent, with totals, what is left, and a chart of where the money goes."
metadata:
  format: "1"
  blocks: echarts
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
