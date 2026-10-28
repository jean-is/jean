import test from 'node:test'
import assert from 'node:assert/strict'
import { guard } from './guard.mjs'
const g = (code) => guard(code, 'C()')
test('while and do-while', () => {
  assert.equal(g('while (x < 3) x++'), 'while (C() && (x < 3)) x++')
  assert.equal(g('do { x++ } while (x)'), 'do { x++ } while (C() && (x))')
  assert.equal(g('while(true){}'), 'while(C() && (true)){}')
})
test('classic for, empty and full', () => {
  assert.equal(g('for (;;) {}'), 'for (; C();) {}')
  assert.equal(g('for (let i = 0; i < n; i++) {}'), 'for (let i = 0; C() && ( i < n); i++) {}')
  assert.equal(g('for (let i = 0, j = f(a, b); i < (n); i++) {}'), 'for (let i = 0, j = f(a, b); C() && ( i < (n)); i++) {}')
})
test('for-of, for-in and for await are left alone', () => {
  for (const code of ['for (const a of list) {}', 'for (const k in o) {}', 'for await (const x of it) {}']) assert.equal(g(code), code)
})
test('words in strings, templates, comments, regexes and properties are left alone', () => {
  for (const code of ['const s = "while (x) {}"', "const s = 'for (;;)'", 'const t = `while (${a}) {}`', '// while (x) {}', '/* for (;;) */', 'const r = /while (x)/g', 'obj.while(x)', 'a?.for(1)', 'const o = { while: 1, for: 2 }'])
    assert.equal(g(code), code)
})
test('loops inside template expressions and after regexes are guarded', () => {
  assert.equal(g('const t = `${(() => { while (a) b() })()}`'), 'const t = `${(() => { while (C() && (a)) b() })()}`')
  assert.equal(g('if (/[/]/.test(s)) while (x) y()'), 'if (/[/]/.test(s)) while (C() && (x)) y()')
  assert.equal(g('const q = a / b; while (q) f()'), 'const q = a / b; while (C() && (q)) f()')
})
test('lines keep their numbers', () => {
  const code = 'let i = 0\nwhile (\n  i < 3\n) {\n  i++\n}\nfor (let j = 0;\n j < 2;\n j++) {}\n'
  assert.equal(g(code).split('\n').length, code.split('\n').length)
})
