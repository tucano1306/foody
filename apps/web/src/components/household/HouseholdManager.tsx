'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { haptic } from '@/lib/haptic';

interface Member {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface HouseholdState {
  household: { id: string; name: string; ownerId: string } | null;
  members: Member[];
  isOwner: boolean;
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
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
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
    if (newName.trim().length < 2) return;
    setWorking(true);
    setError(null);
    try {
      await fetchJson('/households', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      haptic([20, 30, 20]);
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
    if (joinCode.trim().length < 4) return;
    setWorking(true);
    setError(null);
    try {
      await fetchJson('/households/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      haptic([20, 30, 20]);
      setJoinCode('');
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function handleLeave() {
    if (!globalThis.window.confirm('¿Seguro que quieres salir del hogar?')) return;
    setWorking(true);
    try {
      await fetchJson('/households/leave', { method: 'DELETE' });
      haptic(30);
      await refresh();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function handleGenerateInvite() {
    setWorking(true);
    try {
      const res = await fetchJson<{ code: string }>('/households/invites', {
        method: 'POST',
      });
      setInviteCode(res.code);
      haptic(15);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    haptic(10);
  }

  if (loading) {
    return <p className="text-center text-stone-400 py-8">Cargando...</p>;
  }

  // ─── No household ──────────────────────────────────────────────────────
  if (!state?.household) {
    return (
      <div className="space-y-6">
        {error && (
          <p className="bg-rose-50 text-rose-600 text-sm px-4 py-2.5 rounded-xl">{error}</p>
        )}

        {/* Create */}
        <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-1">🏡 Crea tu hogar</h3>
          <p className="text-sm text-stone-500 mb-3">
            Invita a tu familia a compartir la despensa y la lista del súper.
          </p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Familia García"
              className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              type="button"
              disabled={working || newName.trim().length < 2}
              onClick={handleCreate}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 transition"
            >
              Crear
            </button>
          </div>
        </section>

        {/* Join */}
        <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-1">🔑 Únete a un hogar</h3>
          <p className="text-sm text-stone-500 mb-3">
            Pide el código de invitación a alguien de tu familia.
          </p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={10}
              className="flex-1 px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 uppercase tracking-widest text-center font-mono"
            />
            <button
              type="button"
              disabled={working || joinCode.trim().length < 4}
              onClick={handleJoin}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 transition"
            >
              Unirme
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ─── Has household ─────────────────────────────────────────────────────
  const { household, members, isOwner } = state;

  return (
    <div className="space-y-6">
      {error && (
        <p className="bg-rose-50 text-rose-600 text-sm px-4 py-2.5 rounded-xl">{error}</p>
      )}

      <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-stone-800 text-lg">{household.name}</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
              {isOwner && ' · Eres el propietario'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLeave}
            disabled={working}
            className="text-sm text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
          >
            Salir
          </button>
        </div>

        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-1.5">
              {m.avatarUrl ? (
                <Image
                  src={m.avatarUrl}
                  alt={m.name ?? m.email}
                  width={36}
                  height={36}
                  className="rounded-full"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 font-bold flex items-center justify-center">
                  {(m.name ?? m.email)[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-stone-800 text-sm truncate">
                  {m.name ?? m.email}
                  {m.id === household.ownerId && (
                    <span className="ml-2 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">
                      OWNER
                    </span>
                  )}
                </p>
                {m.name && <p className="text-xs text-stone-400 truncate">{m.email}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
        <h3 className="font-bold text-stone-800 mb-1">📨 Invitar a alguien</h3>
        <p className="text-sm text-stone-500 mb-3">
          Genera un código. Válido 7 días, un solo uso.
        </p>

        {inviteCode ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl bg-stone-50 border-2 border-dashed border-brand-300 font-mono text-center text-2xl font-bold tracking-[0.3em] text-brand-600">
              {inviteCode}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-3 rounded-xl transition"
            >
              📋
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateInvite}
            disabled={working}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50 transition"
          >
            Generar código
          </button>
        )}
      </section>
    </div>
  );
}
