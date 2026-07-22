'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export interface Member {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface Props {
  readonly member: Member | null;
  /** The member is the signed-in user */
  readonly isSelf: boolean;
  /** The member owns the household (👑) */
  readonly isHouseholdOwner: boolean;
  /** The signed-in user owns the household — only they manage other members */
  readonly viewerIsOwner: boolean;
  readonly onClose: () => void;
  readonly onRename: (id: string, name: string) => Promise<void>;
  readonly onRemove: (id: string) => Promise<void>;
}

/**
 * Detail sheet for one household member: rename, or remove them from the home.
 * Rendered as an overlay (not a native <dialog>) so the ConfirmDialog used for
 * the destructive action can stack on top of it.
 */
export default function MemberSheet({
  member,
  isSelf,
  isHouseholdOwner,
  viewerIsOwner,
  onClose,
  onRename,
  onRemove,
}: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const memberId = member?.id ?? null;

  // Reload the form whenever a different member is opened
  useEffect(() => {
    if (!member) return;
    setName(member.name ?? '');
    setError(null);
    setConfirmRemove(false);
    // Only the identity of the open member matters here — a rename that lands
    // while the sheet is open must not stomp on what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // I can rename myself; renaming somebody else is the owner's call.
  const canEdit = isSelf || viewerIsOwner;
  // The owner closes the home with "Disolver hogar", not by removing themselves.
  const canRemove = viewerIsOwner && !isSelf;
  const trimmed = name.trim();
  const dirty = Boolean(member) && trimmed.length > 0 && trimmed !== (member?.name ?? '');

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      haptic(15);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const displayName = member?.name ?? member?.email ?? '';

  return (
    <>
      {/* The key is what lets AnimatePresence swap members: without it the
          exiting sheet keeps the slot and the next member never renders. */}
      <AnimatePresence>
        {member && (
          <div key={member.id} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.button
              type="button"
              aria-label="Cerrar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Opciones de ${displayName}`}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="relative w-full sm:max-w-sm bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
            >
              {/* ─── Who ──────────────────────────────────────────────────── */}
              <div className="flex items-center gap-3">
                {member.avatarUrl ? (
                  <Image src={member.avatarUrl} alt={displayName} width={48} height={48} className="rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold flex items-center justify-center text-lg">
                    {displayName ? displayName[0].toUpperCase() : '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-stone-800 dark:text-stone-100 truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-stone-400 dark:text-stone-500 truncate">{member.email}</p>
                  <div className="flex gap-1.5 mt-1">
                    {isHouseholdOwner && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
                        👑 Dueño
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-[10px] bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 px-1.5 py-0.5 rounded-full font-bold">
                        Tú
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-4 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-sm px-3 py-2 rounded-xl border border-rose-100 dark:border-rose-800">
                  {error}
                </p>
              )}

              {/* ─── Rename ───────────────────────────────────────────────── */}
              {canEdit ? (
                <div className="mt-5">
                  <label htmlFor="member-name" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Nombre
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="member-name"
                      value={name}
                      maxLength={60}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void run(() => onRename(member.id, trimmed)); }}
                      placeholder="Ej: Mamá"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 dark:bg-stone-800 dark:border-stone-700 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition"
                    />
                    <button
                      type="button"
                      disabled={!dirty || saving}
                      onClick={() => run(() => onRename(member.id, trimmed))}
                      className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-50"
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-1.5">
                    {isSelf
                      ? 'Así te verá el resto de tu hogar.'
                      : 'Este nombre se verá en toda la app, también en su teléfono.'}
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-sm text-stone-500 dark:text-stone-400">
                  Solo el dueño del hogar puede editar a los demás miembros.
                </p>
              )}

              {/* ─── Remove ───────────────────────────────────────────────── */}
              {canRemove && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmRemove(true)}
                  className="mt-4 w-full py-3 rounded-2xl bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-semibold text-sm transition disabled:opacity-50"
                >
                  🚪 Sacar del hogar
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full py-3 rounded-2xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 font-semibold text-sm transition"
              >
                Cerrar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmRemove}
        title={`¿Sacar a ${displayName} del hogar?`}
        message="Dejará de ver la despensa compartida y sus productos volverán a ser solo suyos. Puedes volver a invitarlo con un código."
        confirmLabel="Sacar"
        destructive
        busy={saving}
        onConfirm={() => {
          setConfirmRemove(false);
          if (member) void run(() => onRemove(member.id));
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
