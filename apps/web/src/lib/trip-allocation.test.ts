import { describe, it, expect } from 'vitest';
import { allocate, resolveItems, round2 } from './trip-allocation';
import { dataUrlToBlob, isHeicFile } from './image-file';

describe('trip-allocation — manual_partial', () => {
  it('keeps manual prices and splits the remainder among unpriced items', () => {
    const resolved = resolveItems([
      { productId: 'a', quantity: 2, unitPrice: 3 }, // manual: 6.00
      { productId: 'b', quantity: 1 },               // sin precio
      { productId: 'c', quantity: 1 },               // sin precio
    ]);
    const alloc = allocate(resolved, 10, 'manual_partial');

    expect(alloc[0]).toEqual({ unitPrice: 3, totalPrice: 6, priceSource: 'manual' });
    expect(alloc[1].priceSource).toBe('allocated');
    expect(alloc[2].priceSource).toBe('allocated');
    // El resto (4.00) se reparte completo, sin perder centavos
    const allocatedSum = round2((alloc[1].totalPrice ?? 0) + (alloc[2].totalPrice ?? 0));
    expect(allocatedSum).toBe(4);
  });

  it('an empty item list allocates nothing', () => {
    expect(allocate([], 46.33, 'manual_partial')).toEqual([]);
  });

  it('marks items unknown when manual prices already exceed the total', () => {
    const resolved = resolveItems([
      { productId: 'a', quantity: 1, unitPrice: 12 },
      { productId: 'b', quantity: 1 },
    ]);
    const alloc = allocate(resolved, 10, 'manual_partial');
    expect(alloc[0].priceSource).toBe('manual');
    expect(alloc[1]).toEqual({ unitPrice: null, totalPrice: null, priceSource: 'unknown' });
  });
});

describe('image-file helpers', () => {
  it('dataUrlToBlob decodes base64 into a typed Blob without fetch', async () => {
    // "hola" en base64 con mime explícito
    const blob = dataUrlToBlob('data:image/jpeg;base64,aG9sYQ==');
    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('hola');
  });

  it('isHeicFile detects by mime type and by extension', () => {
    expect(isHeicFile(new File([], 'IMG_1.HEIC', { type: '' }))).toBe(true);
    expect(isHeicFile(new File([], 'foto.jpg', { type: 'image/heif' }))).toBe(true);
    expect(isHeicFile(new File([], 'foto.jpg', { type: 'image/jpeg' }))).toBe(false);
  });
});
