import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the token system: stylesheets reach colours, type, radii and spacing
 * through `styles/tokens.css`, never raw literals. A line ending in
 * `/* token-exempt: <why> *\/` is allowed through.
 */

const src = join(import.meta.dirname, '..')
const exempt = /\/\*\s*token-exempt:[^*]*\*\/\s*$/

const stylesheets = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return stylesheets(path)
    return entry.name.endsWith('.module.css') ? [path] : []
  })

const px = (value: string) => [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Math.abs(Number(m[1])))

const rules: { name: string; test: (property: string, value: string) => boolean }[] = [
  { name: 'raw colour', test: (_, value) => /#[0-9a-f]{3,8}\b|\brgba?\(/i.test(value) },
  { name: 'px font size', test: (property, value) => /^font(-size)?$/.test(property) && px(value).length > 0 },
  { name: 'px radius', test: (property, value) => /radius$/.test(property) && px(value).some((n) => n > 0) },
  {
    name: 'px spacing',
    test: (property, value) => /^(padding|margin|(row-|column-)?gap)\b/.test(property) && px(value).some((n) => n >= 4),
  },
]

// Blanks comments while keeping line numbers, so a multi-line comment's text is never checked.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

const violations = (file: string) => {
  const css = readFileSync(file, 'utf8')
  const raw = css.split('\n')
  const lines = stripComments(css).split('\n')
  const name = relative(src, file).replaceAll('\\', '/')
  // A declaration's value can run over several lines, so the open property carries until its `;`.
  let property = ''
  return lines.flatMap((line, i) => {
    const original = raw[i] ?? ''
    const declaration = /[{}]/.test(line) ? null : line.match(/^\s*(--[\w-]+|[a-z-]+)\s*:(.*)$/)
    if (declaration) property = declaration[1] ?? ''
    else if (/[{}]/.test(line)) property = ''
    const value = declaration?.[2] ?? line
    const found =
      property && !exempt.test(original)
        ? rules
            .filter((rule) => rule.test(property, value))
            .map((rule) => `${name}:${i + 1} ${rule.name}: ${original.trim()}`)
        : []
    if (line.trim().endsWith(';')) property = ''
    return found
  })
}

describe('design tokens', () => {
  it('keeps raw colours, px type, px radii and off-token spacing out of stylesheets', () => {
    const files = [join(src, 'global.css'), ...stylesheets(src)]
    expect(files.flatMap(violations)).toEqual([])
  })
})
