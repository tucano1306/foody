import { describe, expect, it } from 'vitest';
import { emailToUuid } from '../server-auth';
import { computoDisponiblePara, configComputo } from './config';

const BIEN = {
  COMPUTO_URL: 'https://quickbokks-clone.vercel.app/',
  COMPUTO_SECRET: 'x'.repeat(40),
  COMPUTO_OWNER_EMAIL: 'Dueño@Ejemplo.com ',
} as unknown as NodeJS.ProcessEnv;

describe('configComputo — el enlace es de un solo usuario', () => {
  it('con las tres variables está encendido, y la URL sin barra final', () => {
    expect(configComputo(BIEN)).toEqual({
      url: 'https://quickbokks-clone.vercel.app',
      secreto: 'x'.repeat(40),
      duenoId: emailToUuid('dueño@ejemplo.com'),
    });
  });

  it('sin alguna de ellas, apagado del todo', () => {
    expect(configComputo({ ...BIEN, COMPUTO_URL: '' })).toBeNull();
    expect(configComputo({ ...BIEN, COMPUTO_SECRET: undefined })).toBeNull();
    expect(configComputo({ ...BIEN, COMPUTO_OWNER_EMAIL: '' })).toBeNull();
  });

  it('un secreto corto o una URL sin https no valen', () => {
    expect(configComputo({ ...BIEN, COMPUTO_SECRET: 'corto' })).toBeNull();
    expect(configComputo({ ...BIEN, COMPUTO_URL: 'http://quickbokks-clone.vercel.app' })).toBeNull();
  });

  it('solo el dueño lo ve: otro usuario de Foody no', () => {
    expect(computoDisponiblePara(emailToUuid('dueño@ejemplo.com'), BIEN)).toBe(true);
    expect(computoDisponiblePara(emailToUuid('otra@persona.com'), BIEN)).toBe(false);
    expect(computoDisponiblePara(null, BIEN)).toBe(false);
  });
});
