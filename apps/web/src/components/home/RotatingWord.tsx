'use client';

import { useEffect, useState } from 'react';

export default function RotatingWord({
  words,
  className = '',
}: {
  readonly words: readonly string[];
  readonly className?: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % words.length), 2200);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <span
      key={i}
      className={`inline-block animate-fade-up text-brand-500 ${className}`}
    >
      {words[i]}
    </span>
  );
}
