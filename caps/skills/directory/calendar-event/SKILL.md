---
name: calendar-event
description: "Turn dates into events the user adds to their calendar in one go (Google Calendar, Outlook, Apple Calendar): an appointment, a meeting, a trip, a class timetable, a medication schedule or deadlines found in an email, a letter, a PDF or a message, saved as an .ics file."
metadata:
  format: "1"
---
# Calendar event

Write the events as an iCalendar file (`.ics`) with `write`. Opened, it adds them to the user's calendar, one event or many.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//calendar-event//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:20261014-dentist@calendar-event
DTSTAMP:20261008T120000Z
DTSTART:20261014T090000
DTEND:20261014T093000
SUMMARY:Dentist, Dr Martin
LOCATION:12 rue des Lilas\, 69003 Lyon
DESCRIPTION:Bring the X-rays.\nTo cancel, call 48 hours ahead.
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Dentist, Dr Martin
TRIGGER:-PT1H
END:VALARM
END:VEVENT
END:VCALENDAR
```

## Steps

1. Find every event: what it is, its date, when it starts and ends (or that it lasts all day), where (an address or a link), and what to bring or know. When a year, a time, AM or PM, or a time zone isn't clear, ask with `ask_user`, all at once. Never make a time up.
2. Times:
   - where the user is: local time with no zone, `DTSTART:20261014T090000`, which their calendar shows as written;
   - in another time zone (a flight, an online meeting set in another country): its zone's name, `DTSTART;TZID=America/New_York:20261014T090000`;
   - all day: `DTSTART;VALUE=DATE:20261014` and `DTEND;VALUE=DATE:20261015`, the day after the last one;
   - no end given: an hour for a meeting, or as long as such an event usually lasts, said in your answer.
3. Each event, between `BEGIN:VEVENT` and `END:VEVENT`:
   - a `UID` of its own, made of its date and a few words, with `@calendar-event` after them; to change an event the user already added, write it again with the same `UID` and `SEQUENCE:1`;
   - `DTSTAMP`: today, in UTC, ending with `Z`;
   - `SUMMARY` in the user's language, short, the most telling words first;
   - in text, a backslash before each comma and semicolon (`\,` `\;`), and `\n` for a new line;
   - a long `DESCRIPTION` on several lines, each line after the first starting with one space;
   - a reminder (`VALARM`) when it helps: an hour before an appointment (`-PT1H`), a day before a deadline (`-P1D`).
4. A timetable that repeats is one event with a rule, rather than one event a week: `RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10`, or `UNTIL=20261220T235959` in place of `COUNT` (in UTC, ending with `Z`, when the times have a zone); `EXDATE` with the same form as `DTSTART` for the days off.
5. Name the file in the user's language after what it holds, such as "Dentist.ics" or "Autumn timetable.ics".
6. In the answer, list the events in a short table (date, time, what, where) for the user to check, and say how to add them: open the file, or in Google Calendar on a computer, Settings › Import & export.
