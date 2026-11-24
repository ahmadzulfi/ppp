import { describe, expect, it } from 'vitest'
import { ROUTE_EXAMPLE_MAX } from '@wa/core/flow'
import { decodeRouteTarget, encodeRouteTarget, knowledgeExampleTexts } from './knowledge-route'

describe('route target', () => {
  it('round-trips ids, including menu row ids with @', () => {
    const t = { flowId: 'cm1flow', destinationId: 'row_ktp@node_7' }
    expect(decodeRouteTarget(encodeRouteTarget(t))).toEqual(t)
  })

  it('reads an empty or broken value as no target', () => {
    expect(decodeRouteTarget('')).toBeNull()
    expect(decodeRouteTarget('cm1flow::')).toBeNull()
    expect(decodeRouteTarget('::row')).toBeNull()
    expect(decodeRouteTarget('cm1flow')).toBeNull()
  })
})

describe('knowledgeExampleTexts', () => {
  it('uses the title and the content, whitespace collapsed', () => {
    expect(knowledgeExampleTexts({ title: ' Perizinan  Usaha ', content: 'Izin\nusaha mikro\tdan NIB' })).toEqual([
      'Perizinan Usaha',
      'Izin usaha mikro dan NIB',
    ])
  })

  it('keeps one when title and content say the same', () => {
    expect(knowledgeExampleTexts({ title: 'KTP hilang', content: 'ktp hilang' })).toEqual(['KTP hilang'])
  })

  it('cuts long content at a word, within what the router accepts', () => {
    const content = 'syarat dan prosedur pengurusan '.repeat(30)
    const texts = knowledgeExampleTexts({ title: 'SKCK', content })
    expect(texts).toHaveLength(2)
    const text = texts[1] ?? ''
    expect(text.length).toBeLessThanOrEqual(ROUTE_EXAMPLE_MAX)
    expect(text.length).toBeGreaterThan(ROUTE_EXAMPLE_MAX * 0.6)
    expect(content.startsWith(text)).toBe(true)
    expect(text.endsWith(' ')).toBe(false)
  })
})
