/**
 * notify-goal-impact.ts — avisa qué le hizo un gasto a las metas.
 *
 * Se llama justo después de guardar una compra. Es deliberadamente "a prueba
 * de todo": el gasto ya está guardado cuando esto corre, así que ningún fallo
 * aquí —red caída, sesión vencida, respuesta rara— puede parecer un error al
 * guardar. Ante cualquier problema, calla.
 */
import type { ExpenseImpactResult } from './goal-impact';

type ShowToast = (message: string, tone?: 'success' | 'error' | 'info') => void;

/** El aviso llega tras el "Compra guardada", no encima. */
const DELAY_MS = 900;

export async function notifyGoalImpact(amount: number, show: ShowToast): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;

  try {
    const res = await fetch(`/api/finance/impact?amount=${encodeURIComponent(amount)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return;

    const data = (await res.json()) as ExpenseImpactResult;
    const worst = data.worst;
    // 'none' y 'low' no merecen interrumpir: el usuario acaba de hacer algo
    // normal, no un desfalco.
    if (!worst || worst.level === 'none' || worst.level === 'low') return;

    await new Promise((r) => setTimeout(r, DELAY_MS));
    show(`${worst.emoji || '🎯'} ${worst.message}`, worst.level === 'high' ? 'error' : 'info');
  } catch {
    // silencio: la compra ya se guardó y eso es lo que importa
  }
}
