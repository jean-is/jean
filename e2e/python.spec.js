// The data toolkit (0.4): Python runs in its own sandbox from files Jean hands it, with no
// network, Python's standard library, the value of the last line as its result, and access to
// shared files and Jean's tools through the same rules.
import { test, expect } from '@playwright/test'
import { start } from './helpers.js'

test('Python: the standard library, no network, the last line as the result, errors as text', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  const output = await page.evaluate(async () => {
    const { loaded } = await import('/ui/caps.js')
    await import('/caps/python/python.js')
    const python = loaded.value.get('python')?.tools?.[0]
    const calls = /** @type {string[]} */ ([])
    const ctx = { declared: ['python'], declare() {}, call: async (/** @type {string} */ name, /** @type {any} */ args) => { calls.push(`${name} ${JSON.stringify(args)}`); return 'region,sales\nNorth,3\nSouth,4' } }
    const results = []
    const scripts = [
      '6 * 7',
      'import statistics, decimal, datetime, csv, io, json, re\nstatistics.mean([1, 2, 3, 4])',
      'from decimal import Decimal\nDecimal("0.1") + Decimal("0.2")',
      'print("hello")\n{"a": [1, 2], "b": None}',
      'import js\n[hasattr(js, "fetch"), hasattr(js, "postMessage")]',
      'from pyodide.http import pyfetch\nawait pyfetch("https://example.com")',
      'import pandas',
      'raise ValueError("nope")',
      'import csv, io\ntext = await file("sales.csv")\nsum(int(row["sales"]) for row in csv.DictReader(io.StringIO(text)))',
      'x = 1',
    ]
    for (const code of scripts) results.push(await python?.run({ code }, ctx).catch((/** @type {Error} */ error) => `failed: ${error.message}`))
    return { results, calls }
  })
  const { results, calls } = output
  expect(results.slice(0, 5)).toEqual([
    'Result: 42',
    'Result: 2.5',
    'Result: 0.3',
    'Result: {\n "a": [\n  1,\n  2\n ],\n "b": null\n}\n\nLog:\nhello',
    'Result: [\n false,\n false\n]',
  ])
  expect(results[5]).toMatch(/^failed: The script failed: .*(network|fetch)/is)
  expect(results[6]).toMatch(/^failed: The script failed: .*ModuleNotFoundError.*\nOnly the standard library is available here\.$/s)
  expect(results[7]).toMatch(/^failed: The script failed: .*ValueError: nope/s)
  expect(results[8]).toBe('Result: 7')
  expect(results[9]).toBe('The script gave no result: end it with the value you need, or return it.')
  expect(calls).toEqual(['file {"file":"sales.csv"}'])
})
