import { describe, it, expect } from 'vitest';
import {
  buildCandidates,
  summarize,
  flattenWords,
  extractPrices,
  type ScanWord,
  type OcrBlock,
} from './price-scan';

/** Build a ScanWord with sensible defaults for tests. */
function w(text: string, height: number, x0 = 0, line = 0, confidence = 90): ScanWord {
  return { text, confidence, height, x0, x1: x0 + height, line };
}

describe('buildCandidates', () => {
  it('reads a plain decimal price', () => {
    const cands = buildCandidates([w('$12.99', 50)]);
    expect(cands.map((c) => c.value)).toEqual([12.99]);
    expect(cands[0].strong).toBe(true);
  });

  it('reads a European-style decimal (comma)', () => {
    expect(buildCandidates([w('12,99', 40)])[0].value).toBe(12.99);
  });

  it('handles a thousands separator', () => {
    expect(buildCandidates([w('$1,299.00', 40)])[0].value).toBe(1299);
  });

  it('combines split dollars and cents on the same line', () => {
    // Shelf tag: big "$3" with small superscript "99"
    const cands = buildCandidates([w('$3', 70, 0, 0), w('99', 30, 80, 0)]);
    expect(cands.map((c) => c.value)).toEqual([3.99]);
    expect(cands[0].strong).toBe(true);
  });

  it('does not combine cents from a different line', () => {
    const cands = buildCandidates([w('$3', 70, 0, 0), w('99', 30, 0, 1)]);
    const values = cands.map((c) => c.value).sort((a, b) => a - b);
    expect(values).toContain(3);
    expect(values).toContain(99);
  });

  it('ranks the biggest, strongest number first (the real price)', () => {
    // A tag with a small unit price and a big headline price
    const cands = buildCandidates([
      w('2.50', 18, 0, 0), // small "price per 100g"
      w('$45.90', 90, 0, 1), // big headline price
    ]);
    expect(cands.sort((a, b) => b.score - a.score)[0].value).toBe(45.9);
  });
});

describe('summarize', () => {
  it('auto-selects the top candidate when it has a strong signal', () => {
    const summary = summarize(buildCandidates([w('$45.90', 90, 0, 0), w('2.50', 18, 0, 1)]));
    expect(summary.quality).toBe('strong');
    expect(summary.autoSelect).toBe(45.9);
    expect(summary.prices[0]).toBe(45.9);
  });

  it('does not auto-select when only bare integers were found', () => {
    const summary = summarize(buildCandidates([w('1299', 50)]));
    expect(summary.quality).toBe('weak');
    expect(summary.autoSelect).toBeNull();
  });

  it('reports none when there are no candidates', () => {
    const summary = summarize(buildCandidates([w('abc', 30)]));
    expect(summary.quality).toBe('none');
    expect(summary.prices).toEqual([]);
  });
});

describe('flattenWords', () => {
  it('flattens blocks → words and computes height', () => {
    const blocks: OcrBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  { text: '$9.99', confidence: 88, bbox: { x0: 10, y0: 5, x1: 60, y1: 45 } },
                  { text: '  ', confidence: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } },
                ],
              },
            ],
          },
        ],
      },
    ];
    const words = flattenWords(blocks);
    expect(words).toHaveLength(1); // blank word dropped
    expect(words[0]).toMatchObject({ text: '$9.99', confidence: 88, height: 40 });
  });

  it('is defensive against null blocks', () => {
    expect(flattenWords(null)).toEqual([]);
  });
});

describe('extractPrices (text fallback)', () => {
  it('prefers strong dollar/decimal matches', () => {
    const r = extractPrices('OFERTA $19.90 antes 25');
    expect(r.quality).toBe('strong');
    expect(r.prices).toContain(19.9);
  });

  it('falls back to bare integers as weak', () => {
    const r = extractPrices('precio 349 unidad');
    expect(r.quality).toBe('weak');
    expect(r.prices).toContain(349);
  });

  it('flags no digits', () => {
    const r = extractPrices('sin numeros aqui');
    expect(r.quality).toBe('none');
    expect(r.hasDigits).toBe(false);
  });
});
