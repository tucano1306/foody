'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type State = 'idle' | 'listening' | 'processing' | 'reply';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const DISMISS_MS = 5000;
const LISTEN_TIMEOUT_MS = 8000;

function getRecognitionErrorMessage(error?: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'El micrófono está bloqueado. Permite acceso al micrófono en tu navegador.';
    case 'audio-capture':
      return 'No pude acceder al micrófono de este dispositivo.';
    case 'no-speech':
      return 'No detecté voz. Intenta hablar justo después de tocar el botón.';
    case 'network':
      return 'La transcripción por voz falló por red. Revisa tu conexión.';
    default:
      return 'No pude iniciar el reconocimiento de voz en este dispositivo.';
  }
}

async function ensureMicrophoneAccess(): Promise<void> {
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

export default function VoiceAssistant() {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');
  const [reply, setReply] = useState('');
  const [supported, setSupported] = useState(true);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<State>('idle');
  const heardResultRef = useRef(false);

  const clearDismiss = useCallback(() => {
    if (dismissRef.current) clearTimeout(dismissRef.current);
  }, []);

  const clearListenTimeout = useCallback(() => {
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(() => {
    clearDismiss();
    dismissRef.current = setTimeout(() => setState('idle'), DISMISS_MS);
  }, [clearDismiss]);

  const showReplyMessage = useCallback((message: string) => {
    clearListenTimeout();
    setReply(message);
    setState('reply');
    scheduleDismiss();
  }, [clearListenTimeout, scheduleDismiss]);

  useEffect(() => {
    const g = globalThis as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance };
    const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }

    const recog = new Ctor();
    recog.lang = 'es-MX';
    recog.continuous = false;
    recog.interimResults = false;

    recog.onresult = (e: SpeechRecognitionEvent) => {
      clearListenTimeout();
      heardResultRef.current = true;
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) {
        void sendToApi(transcript);
        return;
      }

      showReplyMessage('No entendí lo que dijiste. Intenta otra vez.');
    };

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      clearListenTimeout();
      showReplyMessage(getRecognitionErrorMessage(e.error));
    };

    recog.onend = () => {
      clearListenTimeout();
      const currentState = stateRef.current;
      if (currentState === 'processing' || currentState === 'reply') return;
      if (!heardResultRef.current) {
        showReplyMessage('No escuché un comando válido. Habla más cerca y vuelve a intentar.');
        return;
      }
      setState('idle');
    };

    recogRef.current = recog;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearListenTimeout, showReplyMessage]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state !== 'listening') {
      clearListenTimeout();
      return;
    }

    clearListenTimeout();
    listenTimeoutRef.current = setTimeout(() => {
      if (stateRef.current !== 'listening' || heardResultRef.current) return;
      recogRef.current?.stop();
      showReplyMessage('No escuché un comando válido. Habla más cerca y vuelve a intentar.');
    }, LISTEN_TIMEOUT_MS);

    return clearListenTimeout;
  }, [state, clearListenTimeout, showReplyMessage]);

  useEffect(() => {
    return () => {
      clearDismiss();
      clearListenTimeout();
    };
  }, [clearDismiss, clearListenTimeout]);

  const startRecognition = useCallback(async () => {
    if (!recogRef.current) {
      showReplyMessage('La voz no está disponible en este navegador. Usa Chrome en Android.');
      return;
    }

    try {
      await ensureMicrophoneAccess();
      clearListenTimeout();
      heardResultRef.current = false;
      setReply('');
      setState('listening');
      recogRef.current.start();
    } catch {
      showReplyMessage('No pude activar el micrófono. Revisa los permisos del navegador y vuelve a intentar.');
    }
  }, [clearListenTimeout, showReplyMessage]);

  async function sendToApi(transcript: string) {
    setState('processing');
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json() as { reply: string; action?: string };
      setReply(data.reply);
      setState('reply');
      scheduleDismiss();

      // Refresh page data when a list mutation happens
      if (data.action === 'added_to_list') router.refresh();
    } catch {
      setReply('Error al procesar el comando.');
      setState('reply');
      scheduleDismiss();
    }
  }

  function handlePress() {
    if (!supported) {
      showReplyMessage('Tu navegador no soporta voz. Usa Chrome en Android.');
      return;
    }
    if (state === 'listening') {
      clearListenTimeout();
      recogRef.current?.stop();
      setState('idle');
      return;
    }
    if (state === 'reply') {
      clearDismiss();
      setState('idle');
      return;
    }
    void startRecognition();
  }

  let buttonColor = '#6366F1';
  if (state === 'listening') buttonColor = '#EF4444';
  else if (state === 'processing') buttonColor = '#F59E0B';

  return (
    <div className="fixed bottom-24 right-4 z-70 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
      {/* Reply bubble */}
      <AnimatePresence>
        {state === 'reply' && reply && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="max-w-xs bg-gray-900 text-white text-sm rounded-2xl px-4 py-3 shadow-xl border border-white/10 whitespace-pre-line"
          >
            {reply}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listening indicator */}
      <AnimatePresence>
        {state === 'listening' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5"
          >
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-red-400 inline-block"
            />
            Escuchando…
          </motion.div>
        )}
        {state === 'processing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full border border-white/10"
          >
            Procesando…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        type="button"
        onClick={handlePress}
        aria-label={state === 'listening' ? 'Detener escucha' : 'Activar asistente de voz'}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl text-white text-2xl"
        style={{ backgroundColor: buttonColor }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        animate={state === 'listening' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={state === 'listening'
          ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
          : { type: 'spring', stiffness: 400, damping: 20 }}
      >
        {state === 'processing' && '⏳'}
        {state === 'listening' && '🎙️'}
        {state === 'idle' && '🎤'}
        {state === 'reply' && '🎤'}
      </motion.button>
    </div>
  );
}
