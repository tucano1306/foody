import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';
import ModernTitle from '@/components/layout/ModernTitle';
import SharingHub from '@/components/sharing/SharingHub';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Compartir — Foody' };

export default async function SharingPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const userId = session.userId;

  await ensureSharingSchema();

  const [pantrySentRaw, pantryReceivedRaw, giftsSentRaw, giftsReceivedRaw] = await Promise.all([
    sql`
      SELECT ps.*, u.name AS guest_name, u.email AS guest_email, u.avatar_url AS guest_avatar
      FROM pantry_shares ps JOIN users u ON u.id = ps.guest_id
      WHERE ps.owner_id = ${userId}
      ORDER BY ps.created_at DESC
    `,
    sql`
      SELECT ps.*, u.name AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar
      FROM pantry_shares ps JOIN users u ON u.id = ps.owner_id
      WHERE ps.guest_id = ${userId}
      ORDER BY ps.created_at DESC
    `,
    sql`
      SELECT pg.*, p.name AS product_name, p.photo_url AS product_photo, p.category AS product_category, p.unit AS product_unit,
             u.name AS recipient_name, u.email AS recipient_email, u.avatar_url AS recipient_avatar
      FROM product_gifts pg
      JOIN products p ON p.id = pg.product_id
      JOIN users u ON u.id = pg.recipient_id
      WHERE pg.sender_id = ${userId}
      ORDER BY pg.created_at DESC
    `,
    sql`
      SELECT pg.*, p.name AS product_name, p.photo_url AS product_photo, p.category AS product_category, p.unit AS product_unit,
             u.name AS sender_name, u.email AS sender_email, u.avatar_url AS sender_avatar
      FROM product_gifts pg
      JOIN products p ON p.id = pg.product_id
      JOIN users u ON u.id = pg.sender_id
      WHERE pg.recipient_id = ${userId}
      ORDER BY pg.created_at DESC
    `,
  ]);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="🤝 Compartir"
        subtitle="Comparte tu despensa o envía productos a otros usuarios de Foody."
      />
      <SharingHub
        initialPantrySent={pantrySentRaw as never}
        initialPantryReceived={pantryReceivedRaw as never}
        initialGiftsSent={giftsSentRaw as never}
        initialGiftsReceived={giftsReceivedRaw as never}
      />
    </div>
  );
}
