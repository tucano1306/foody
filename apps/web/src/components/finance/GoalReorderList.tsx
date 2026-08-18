'use client';

import { Reorder, useDragControls } from 'framer-motion';
import type { GoalProjection } from '@/lib/finance-engine';
import { haptic } from '@/lib/haptic';
import GoalCard from './GoalCard';

interface Props {
  readonly goals: readonly GoalProjection[];
  /** Orden nuevo mientras se arrastra: pinta ya, todavía no guarda. */
  readonly onReorder: (ids: string[]) => void;
  /** El dedo se levantó: ahora sí, a guardar. */
  readonly onCommit: () => void;
  /** Teclado: subir o bajar una meta una posición. */
  readonly onMove: (id: string, delta: number) => void;
  readonly onContribute: (goal: GoalProjection) => void;
  readonly onEdit: (goal: GoalProjection) => void;
  readonly onDelete: (goal: GoalProjection) => void;
  readonly onComplete: (goal: GoalProjection) => void;
}

/**
 * Asa de arrastre.
 *
 * `touch-none` solo aquí y no en la tarjeta entera: si toda la tarjeta agarrara
 * el dedo, la página dejaría de desplazarse justo donde hay metas. Con el asa,
 * arrastrar y hacer scroll conviven sin que haya que explicar nada.
 *
 * Es un `button` de verdad, así que también responde al teclado: con las
 * flechas se sube y se baja la meta sin ratón ni dedo.
 */
function GripHandle({
  label,
  onStart,
  onMove,
}: {
  readonly label: string;
  readonly onStart: (e: React.PointerEvent) => void;
  readonly onMove: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onStart}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        onMove(e.key === 'ArrowUp' ? -1 : 1);
      }}
      className="shrink-0 touch-none cursor-grab rounded-xl px-2 py-3 text-slate-400 transition hover:bg-white/60 hover:text-slate-600 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {/* Seis puntos: el dibujo universal de «esto se agarra». */}
      <svg viewBox="0 0 10 16" className="h-5 w-3 fill-current" aria-hidden="true">
        <circle cx="2" cy="2" r="1.5" />
        <circle cx="8" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="2" cy="14" r="1.5" />
        <circle cx="8" cy="14" r="1.5" />
      </svg>
    </button>
  );
}

function SortableGoal({
  goal,
  index,
  sortable,
  onCommit,
  onMove,
  onContribute,
  onEdit,
  onDelete,
  onComplete,
}: {
  readonly goal: GoalProjection;
  readonly index: number;
  /** Con una sola meta no hay nada que ordenar: el asa sobra. */
  readonly sortable: boolean;
  readonly onCommit: () => void;
  readonly onMove: (id: string, delta: number) => void;
  readonly onContribute: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onComplete: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={goal.goalId}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      whileDrag={{ scale: 1.02, zIndex: 10 }}
      className="list-none"
    >
      <GoalCard
        goal={goal}
        index={index}
        onContribute={onContribute}
        onEdit={onEdit}
        onDelete={onDelete}
        onComplete={onComplete}
        dragHandle={
          sortable ? (
          <GripHandle
            label={`Cambiar el orden de ${goal.name}`}
            onStart={(e) => {
              haptic(6);
              controls.start(e);
            }}
            onMove={(delta) => onMove(goal.goalId, delta)}
          />
          ) : undefined
        }
      />
    </Reorder.Item>
  );
}

/**
 * Las metas, en el orden que el usuario decida.
 *
 * El orden no es un capricho visual: el motor reparte el dinero por prioridad
 * (ver `compareGoals`), así que la meta que queda arriba es la que cobra
 * primero. Por eso se arrastra en vez de elegirse en un desplegable de
 * «alta/media/baja»: la lista ES la respuesta a «¿qué va primero?».
 */
export default function GoalReorderList({
  goals,
  onReorder,
  onCommit,
  onMove,
  onContribute,
  onEdit,
  onDelete,
  onComplete,
}: Props) {
  const ids = goals.map((g) => g.goalId);

  return (
    <Reorder.Group
      axis="y"
      values={ids}
      onReorder={onReorder}
      className="flex flex-col gap-3"
    >
      {goals.map((goal, i) => (
        <SortableGoal
          key={goal.goalId}
          goal={goal}
          index={i}
          sortable={goals.length > 1}
          onCommit={onCommit}
          onMove={onMove}
          onContribute={() => onContribute(goal)}
          onEdit={() => onEdit(goal)}
          onDelete={() => onDelete(goal)}
          onComplete={() => onComplete(goal)}
        />
      ))}
    </Reorder.Group>
  );
}
