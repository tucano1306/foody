/**
 * migrate-photos-to-blob.mjs — saca las fotos de productos de Postgres.
 *
 * Históricamente ProductForm guardaba la foto como data URL base64 dentro de
 * products.photo_url. Una fila pesaba ~200 KB y CADA lectura de la lista de
 * productos las arrastraba enteras, lo que agotó la cuota de transferencia de
 * Neon. Este script sube esas imágenes al almacenamiento de archivos y deja en
 * la fila solo la URL (~100 bytes).
 *
 * Seguridad de los datos: cada foto se sube ANTES de tocar la fila, y la
 * actualización solo ocurre si la subida devolvió una URL válida. Si el script
 * se interrumpe, las filas no migradas siguen intactas con su base64 y basta
 * con volver a ejecutarlo: solo mira las que empiezan por "data:".
 *
 * Uso:
 *   node scripts/migrate-photos-to-blob.mjs --dry-run   (no escribe nada)
 *   node scripts/migrate-photos-to-blob.mjs
 *
 * Requiere DATABASE_URL y BLOB_READ_WRITE_TOKEN en el entorno.
 */
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const DRY_RUN = process.argv.includes('--dry-run');

const { DATABASE_URL, BLOB_READ_WRITE_TOKEN } = process.env;

if (!DATABASE_URL) {
  console.error('✖ Falta DATABASE_URL');
  process.exit(1);
}
if (!BLOB_READ_WRITE_TOKEN && !DRY_RUN) {
  console.error('✖ Falta BLOB_READ_WRITE_TOKEN (conecta un Blob store al proyecto en Vercel)');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/** "data:image/jpeg;base64,/9j/4AA..." → { buffer, contentType, extension } */
function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;
  const header = dataUrl.slice(0, comma);
  const contentType = /^data:([^;,]+)/.exec(header)?.[1] ?? 'image/jpeg';
  if (!header.includes('base64')) return null;
  const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  if (buffer.length === 0) return null;
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, contentType, extension };
}

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function main() {
  console.log(DRY_RUN ? '— MODO PRUEBA: no se escribe nada —\n' : '— MIGRACIÓN REAL —\n');

  // Solo id/user_id y el tamaño: traer todos los base64 de golpe sería
  // justamente el consumo que este script viene a eliminar.
  const rows = await sql`
    SELECT id, user_id, LENGTH(photo_url) AS size
    FROM products
    WHERE photo_url LIKE 'data:%'
    ORDER BY LENGTH(photo_url) DESC
  `;

  if (rows.length === 0) {
    console.log('No hay fotos embebidas. Nada que migrar.');
    return;
  }

  const totalBytes = rows.reduce((sum, r) => sum + Number(r.size), 0);
  console.log(`${rows.length} fotos embebidas · ${fmtKB(totalBytes)} en total\n`);

  if (DRY_RUN) {
    for (const row of rows.slice(0, 10)) {
      console.log(`  ${row.id}  ${fmtKB(Number(row.size))}`);
    }
    if (rows.length > 10) console.log(`  … y ${rows.length - 10} más`);
    console.log('\nVuelve a ejecutar sin --dry-run para migrarlas.');
    return;
  }

  let migrated = 0;
  let failed = 0;
  let freedBytes = 0;

  for (const [i, row] of rows.entries()) {
    const label = `[${i + 1}/${rows.length}] ${row.id}`;
    try {
      // Se trae una sola foto a la vez, no todas a memoria.
      const [full] = await sql`SELECT photo_url FROM products WHERE id = ${row.id} LIMIT 1`;
      if (!full?.photo_url?.startsWith('data:')) {
        console.log(`${label} — ya migrada, se omite`);
        continue;
      }

      const decoded = decodeDataUrl(full.photo_url);
      if (!decoded) {
        console.warn(`${label} — data URL ilegible, se deja intacta`);
        failed++;
        continue;
      }

      const blob = await put(`products/${row.user_id}/photo.${decoded.extension}`, decoded.buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: decoded.contentType,
        cacheControlMaxAge: 31_536_000,
      });

      if (!blob?.url) {
        console.warn(`${label} — la subida no devolvió URL, se deja intacta`);
        failed++;
        continue;
      }

      // Solo ahora se reemplaza. El AND garantiza que no se pisa una fila que
      // alguien haya editado mientras corría el script.
      await sql`
        UPDATE products
        SET photo_url = ${blob.url}, updated_at = NOW()
        WHERE id = ${row.id} AND photo_url LIKE 'data:%'
      `;

      migrated++;
      freedBytes += Number(row.size);
      console.log(`${label} — ✓ ${fmtKB(Number(row.size))} liberados`);
    } catch (err) {
      failed++;
      console.error(`${label} — ✖ ${err instanceof Error ? err.message : String(err)} (la foto original sigue intacta)`);
    }
  }

  console.log(`\nMigradas: ${migrated} · Fallidas: ${failed}`);
  console.log(`Liberados de la base de datos: ${fmtKB(freedBytes)}`);
  if (failed > 0) {
    console.log('Las fallidas conservan su foto embebida; puedes volver a ejecutar el script.');
  }
}

main().catch((err) => {
  console.error('✖ Error inesperado:', err);
  process.exit(1);
});
