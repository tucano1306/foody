/**
 * make-logo-assets.mjs — genera todos los tamaños del logo desde UN archivo.
 *
 *   node scripts/make-logo-assets.mjs <ruta-del-logo>
 *
 * El logo vive en cinco sitios con reglas distintas y es fácil dejarse uno a
 * medias (el favicon viejo sobrevive semanas y parece que el cambio no se
 * aplicó). Este script los escribe todos desde la misma fuente:
 *
 *   public/logo.png            la barra lateral y la portada
 *   public/icons/icon-192.png  el manifiesto de la PWA (y sus atajos)
 *   public/icons/icon-512.png  el manifiesto de la PWA
 *   src/app/icon.png           el favicon de la pestaña
 *   src/app/apple-icon.png     el icono de la pantalla de inicio en iOS
 *
 * Dos cosas que NO son obvias y por las que el script existe:
 *
 * 1. FONDO BLANCO, no transparente. En este logo la «F» es blanca y solo se
 *    distingue por su sombra: al recortar el blanco a transparente, la F
 *    desaparece. Así que todo se compone sobre blanco.
 *
 * 2. LOS ICONOS LLEVAN MARGEN. El manifiesto los declara `maskable`, y Android
 *    recorta esos iconos a un círculo. Sin margen, el recorte se come la
 *    zanahoria. El logo se escala a ~62 % del lienzo para que quepa entero
 *    dentro de la zona segura.
 */

import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { globSync } from 'node:fs';
import path from 'node:path';

// sharp no es dependencia declarada de la app: viene con Next para optimizar
// imágenes. Se busca desde varias raíces porque pnpm no lo deja en el sitio
// donde `require` lo encontraría solo.
function loadSharp() {
  const require = createRequire(import.meta.url);

  // Ruta normal, por si algún día sharp queda enlazado donde `require` lo ve.
  try {
    return require('sharp');
  } catch {
    // seguimos buscando
  }

  // pnpm lo deja dentro de su almacén, con la versión en el nombre de la
  // carpeta, así que hay que buscarlo con un patrón en lugar de adivinar.
  const repoRoot = path.resolve(process.cwd(), '../..');
  for (const root of [process.cwd(), repoRoot]) {
    const matches = globSync(path.join(root, 'node_modules/.pnpm/sharp@*/node_modules/sharp/package.json'));
    for (const pkg of matches) {
      try {
        return require(path.dirname(pkg));
      } catch {
        // siguiente coincidencia
      }
    }
  }

  throw new Error('No se encontró sharp (viene con Next). Prueba: pnpm install');
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * La zanahoria sola, en fracciones del ancho y alto de la fuente.
 *
 * El favicon se ve a 16 px en la pestaña. El logo completo es alto y estrecho,
 * así que ahí dentro se convierte en un borrón donde no se distingue nada. La
 * zanahoria es la parte reconocible —y la que no depende de leer letras—, así
 * que el favicon usa solo eso y llena el cuadrado.
 *
 * En fracciones y no en píxeles para que siga valiendo si algún día la fuente
 * llega a otro tamaño.
 */
const CARROT_CROP = { left: 0.21, top: 0.105, width: 0.25, height: 0.66 };

/** El logo recortado de sus márgenes blancos, listo para componer. */
async function trimmedLogo(sharp, source) {
  return sharp(source).trim({ background: '#ffffff', threshold: 12 });
}

/**
 * Convierte el blanco del fondo en transparencia.
 *
 * Hace falta porque `logo.png` se pinta sobre fondos de DOS colores: la barra
 * lateral, que es casi blanca, y el encabezado de la portada, que es azul
 * marino. Con fondo opaco, en la portada saldría un rectángulo blanco. El logo
 * anterior era transparente y por eso encajaba en los dos sitios.
 *
 * El umbral está calibrado con cuidado por la «F»: en este logo la F es blanca y
 * solo existe por su SOMBRA gris. Si el corte se lleva también los grises
 * claros, la F desaparece del todo. Así que se quita únicamente el blanco casi
 * puro (≥250) y se conserva opaco todo lo que llegue a gris (≤242), con una
 * rampa suave en medio para que los bordes no queden con dientes de sierra.
 *
 * La fuente es JPEG, cuyo blanco no es exactamente 255 y varía junto a los
 * bordes: de ahí que el corte no pueda ser un simple `=== 255`.
 */
async function whiteToAlpha(sharp, image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const KILL = 250;
  const KEEP = 242;

  for (let i = 0; i < data.length; i += info.channels) {
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (min >= KILL) {
      data[i + 3] = 0;
    } else if (min > KEEP) {
      data[i + 3] = Math.round(((KILL - min) / (KILL - KEEP)) * 255);
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/** Solo la zanahoria, ya recortada de su blanco. */
async function carrotOnly(sharp, source) {
  const { width, height } = await sharp(source).metadata();
  const buf = await sharp(source)
    .extract({
      left: Math.round(width * CARROT_CROP.left),
      top: Math.round(height * CARROT_CROP.top),
      width: Math.round(width * CARROT_CROP.width),
      height: Math.round(height * CARROT_CROP.height),
    })
    .png()
    .toBuffer();
  return sharp(buf).trim({ background: '#ffffff', threshold: 12 });
}

/** Cuadrado blanco con el dibujo centrado, ocupando `ratio` del lado. */
async function squareIcon(sharp, source, size, ratio, art = trimmedLogo) {
  const inner = await (await art(sharp, source))
    .resize({
      width: Math.round(size * ratio),
      height: Math.round(size * ratio),
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Falta la ruta del logo.\n  node scripts/make-logo-assets.mjs <ruta>');
    process.exit(1);
  }

  const sharp = loadSharp();
  const meta = await sharp(source).metadata();
  console.log(`fuente: ${source} — ${meta.width}×${meta.height} ${meta.format}`);

  await mkdir('public/icons', { recursive: true });

  const targets = [
    // La barra lateral lo pinta a 52 px con `object-contain`, así que conserva
    // su forma vertical; 512 de alto sobra para cualquier pantalla densa.
    {
      out: 'public/logo.png',
      make: async () => {
        const escalado = (await trimmedLogo(sharp, source)).resize({ height: 512, fit: 'inside' });
        // Transparente: este mismo archivo se pinta sobre la barra lateral clara
        // Y sobre el encabezado azul marino de la portada.
        return (await whiteToAlpha(sharp, escalado)).png({ compressionLevel: 9 }).toBuffer();
      },
    },
    // Maskable: margen generoso, que Android recorta en círculo.
    { out: 'public/icons/icon-512.png', make: () => squareIcon(sharp, source, 512, 0.62) },
    { out: 'public/icons/icon-192.png', make: () => squareIcon(sharp, source, 192, 0.62) },
    // iOS aplica una máscara de esquinas redondeadas, que recorta mucho menos.
    { out: 'src/app/apple-icon.png', make: () => squareIcon(sharp, source, 180, 0.78) },
    // El favicon: solo la zanahoria, y grande. A 16 px en la pestaña el logo
    // entero no se distingue; la zanahoria sí. 128 px de lienzo para que el
     // navegador tenga de dónde reducir sin que salga con dientes de sierra.
    { out: 'src/app/icon.png', make: () => squareIcon(sharp, source, 128, 0.92, carrotOnly) },
  ];

  for (const { out, make } of targets) {
    const buf = await make();
    await sharp(buf).toFile(out);
    const kb = (buf.length / 1024).toFixed(1);
    const info = await sharp(out).metadata();
    console.log(`  ✓ ${out.padEnd(28)} ${info.width}×${info.height}  ${kb} kB`);
  }

  console.log('\nListo. Acuérdate de subir la VERSION del service worker:');
  console.log('las imágenes se sirven cache-first, así que sin eso los teléfonos');
  console.log('seguirían mostrando el logo viejo indefinidamente.');
}

await main();
