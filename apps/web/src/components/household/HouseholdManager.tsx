'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstFromElement, confettiRain } from '@/lib/fx';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MemberSheet, { type Member } from '@/components/household/MemberSheet';

interface HouseholdState {
  household: { id: string; name: string; ownerId: string } | null;
  members: Member[];
  isOwner: boolean;
  /** id of the signed-in user, to tell "yo" apart from the rest of the members */
  userId: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.headers) {
    Object.assign(headers, init.headers);
  }
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || res.statusText;
    try {
      const json = JSON.parse(text) as { message?: string };
      if (json.message) msg = json.message;
    } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json() as Promise<T>;
}

export default function HouseholdManager() {
  const router = useRouter();
  const [state, setState] = useState<HouseholdState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [newName, setNewName] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const isOwner = state?.isOwner ?? false;

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const s = await fetchJson<HouseholdState>('/households/me');
      setState(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (working || newName.trim().length < 2) return;
    setWorking(true);
    setError(null);
    try {
      await fetchJson('/households', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      haptic([20, 30, 20]);
      // Founding a home is a big moment — full celebration
      playSound('levelup');
      confettiRain(['🏡', '🎉', '✨']);
      setNewName('');
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function handleJoin() {
    if (working || joinCode.trim().length < 4) return;
    setWorking(true);
    setError(null);
    try {
      await fetchJson('/households/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      haptic([20, 30, 20]);
      playSound('levelup');
      confettiRain(['🏡', '🤝', '🎉']);
      setJoinCode('');
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  // Shared by the header button and by my own card in the member sheet. Throws
  // so the sheet can show the failure inline instead of closing silently.
  async function leaveHousehold() {
    await fetchJson('/households/leave', { method: 'DELETE' });
    haptic(30);
    playSound('low');
    await refresh();
    router.refresh();
  }

  async function handleLeave() {
    setConfirmLeave(false);
    setWorking(true);
    setError(null);
    try {
      await leaveHousehold();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  // Both member actions let their error bubble up to MemberSheet, which shows it
  // inside the sheet and keeps it open so the change isn't silently lost.
  async function handleRenameMember(id: string, name: string) {
    await fetchJson(`/households/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    playSound('pop');
    await refresh();
    router.refresh();
  }

  async function handleRemoveMember(id: string) {
    await fetchJson(`/households/members/${id}`, { method: 'DELETE' });
    playSound('low');
    await refresh();
    router.refresh();
  }

  async function handleGenerateInvite(e?: React.MouseEvent) {
    const btn = e?.currentTarget as Element | undefined;
    setWorking(true);
    setError(null);
    try {
      const res = await fetchJson<{ code: string }>('/households/invites', {
        method: 'POST',
      });
      setInviteCode(res.code);
      haptic(15);
      playSound('pop');
      burstFromElement(btn, ['🎟️', '✨']);
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      haptic(10);
      playSound('pop');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar. Copia el código manualmente.');
    }
  }

  async function shareCode() {
    if (!inviteCode || !state?.household) return;
    try {
      await navigator.share({
        title: 'Únete a mi hogar en Foody',
        text: `Únete a mi hogar «${state.household.name}» en Foody con el código: ${inviteCode}`,
      });
      playSound('pop');
    } catch {
      /* user cancelled the share sheet */
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando hogar">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }

  const inputCls =
    'flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-400 transition';

  const cardCls =
    'bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm';

  // ─── No household ──────────────────────────────────────────────────────
  if (!state?.household) {
    return (
      <div className="space-y-5 card-stagger">
        {error && (
          <p className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm px-4 py-2.5 rounded-xl border border-blue-100 dark:border-blue-800">
            {error}
          </p>
        )}

        {/* Hero */}
        <div className="text-center pt-2">
          <span className="text-6xl inline-block animate-bounce" aria-hidden="true">🏡</span>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Aún no formas parte de un hogar compartido
          </p>
        </div>

        {/* Create */}
        <section className={cardCls}>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">🏡 Crea tu hogar</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Invita a tu familia a compartir la despensa y la lista del súper.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
              placeholder="Ej: Familia García"
              className={inputCls}
            />
            <button
              type="button"
              disabled={working || newName.trim().length < 2}
              onClick={handleCreate}
              className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-50"
            >
              {working ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="flex items-center gap-3 text-slate-300 dark:text-slate-600 text-xs font-semibold" aria-hidden="true">
          <span className="flex-1 border-t border-slate-200 dark:border-slate-700" />
          o
          <span className="flex-1 border-t border-slate-200 dark:border-slate-700" />
        </div>

        {/* Join */}
        <section className={cardCls}>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">🔑 Únete a un hogar</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Pide el código de invitación a alguien de tu familia.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleJoin(); }}
              placeholder="ABC123"
              maxLength={10}
              className={`${inputCls}st text-center font-mono`}
            />
            <button
              type="button"
              disabled={working || joinCode.trim().length < 4}
              onClick={handleJoin}
              className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 transition"
            >
              {working ? 'Uniendo…' : 'Unirme'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ─── Has household ─────────────────────────────────────────────────────
  const { household, members } = state;

  return (
    <div className="space-y-6 card-stagger">
      {error && (
        <p className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm px-4 py-2.5 rounded-xl border border-blue-100 dark:border-blue-800">
          {error}
        </p>
      )}

      <section className={cardCls}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{household.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
              {isOwner && ' · Eres el propietario'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            disabled={working}
            className={`text-sm px-3 py-1.5 rounded-lg transition ${isOwner ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-semibold' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
          >
            {isOwner ? 'Disolver hogar' : 'Salir'}
          </button>
        </div>

        <ul className="space-y-1 divide-y divide-slate-100 dark:divide-slate-800 card-stagger">
          {members.map((m) => (
            <li key={m.id}>
              {/* Whole row is tappable → member sheet (rename / sacar del hogar) */}
              <button
                type="button"
                onClick={() => { haptic(10); setSelectedMember(m); }}
                aria-label={`Opciones de ${m.name ?? m.email}`}
                className="group w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700 transition"
              >
                {m.avatarUrl ? (
                  <Image
                    src={m.avatarUrl}
                    alt={m.name ?? m.email}
                    width={36}
                    height={36}
                    className="rounded-full transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold flex items-center justify-center text-sm transition-transform duration-300 group-hover:scale-110">
                    {(m.name ?? m.email)[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">
                    {m.name ?? m.email}
                    {m.id === household.ownerId && (
                      <span className="ml-2 text-[11px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 px-1.5 py-0.5 rounded-full font-bold">
                        👑 Dueño
                      </span>
                    )}
                    {m.id === state.userId && (
                      <span className="ml-1.5 text-[11px] bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 px-1.5 py-0.5 rounded-full font-bold">
                        Tú
                      </span>
                    )}
                  </p>
                  {m.name && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{m.email}</p>}
                </div>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={cardCls}>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">📨 Invitar a alguien</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Genera un código. Válido 7 días, un solo uso.
        </p>

        {inviteCode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                key={inviteCode}
                className="animate-pop flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-brand-300 dark:border-brand-600 font-mono text-center text-2xl font-bold tracking-[0.3em] text-brand-600 dark:text-brand-400 select-all"
              >
                {inviteCode}
              </div>
              <button
                type="button"
                onClick={copyCode}
                aria-label={copied ? 'Código copiado' : 'Copiar código'}
                className="btn-primary px-4 py-3 rounded-xl whitespace-nowrap"
              >
                {copied ? '✓ Copiado' : '📋'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              {typeof navigator !== 'undefined' && 'share' in navigator ? (
                <button
                  type="button"
                  onClick={shareCode}
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition"
                >
                  📤 Compartir código
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={handleGenerateInvite}
                disabled={working}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 underline underline-offset-2 px-2 py-2 transition disabled:opacity-50"
              >
                Generar otro
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateInvite}
            disabled={working}
            className="btn-primary w-full py-3 rounded-xl disabled:opacity-50"
          >
            {working ? 'Generando…' : '🎟️ Generar código'}
          </button>
        )}
      </section>

      <MemberSheet
        member={selectedMember}
        isSelf={selectedMember?.id === state.userId}
        isHouseholdOwner={selectedMember?.id === household.ownerId}
        viewerIsOwner={isOwner}
        onClose={() => setSelectedMember(null)}
        onRename={handleRenameMember}
        onRemove={handleRemoveMember}
        onLeave={leaveHousehold}
      />

      <ConfirmDialog
        open={confirmLeave}
        title={isOwner ? '¿Disolver el hogar?' : '¿Salir del hogar?'}
        message={isOwner
          ? 'Eres el propietario. Al salir se disolverá el hogar y todos los miembros serán eliminados.'
          : 'Dejarás de compartir despensa, lista y pagos con este hogar.'}
        confirmLabel={isOwner ? 'Disolver' : 'Salir'}
        destructive
        busy={working}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
