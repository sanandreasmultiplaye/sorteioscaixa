import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import workerUrl from "qr-scanner/qr-scanner-worker.min.js?url";

QrScanner.WORKER_PATH = workerUrl;

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1200, ctx.currentTime);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 600);
  } catch { /* silent */ }
}

export default function QrScannerModal({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scannerRef = useRef<QrScanner | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scanner = new QrScanner(
      video,
      (result) => {
        if (doneRef.current) return;
        doneRef.current = true;
        try { navigator.vibrate?.(80); } catch { /* silent */ }
        beep();
        onScan(result.data);
      },
      { returnDetailedScanResult: true, highlightScanRegion: true, maxScansPerSecond: 5 },
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(async () => {
        try {
          const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : null;
          const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
          setHasTorch(!!caps?.torch);
        } catch { /* silent */ }
      })
      .catch(() => setError("Não foi possível acessar a câmera. Verifique a permissão do navegador e tente novamente."));
    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const video = videoRef.current;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : null;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch((t) => !t);
    } catch { /* silent */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <h2 className="font-display text-base font-bold">📷 Escanear comprovante</h2>
        <button onClick={onClose} aria-label="Fechar" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">✕ Fechar</button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Viewfinder overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-56 w-56">
            <div className="absolute inset-0 rounded-3xl border-4 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
            <div className="animate-scanline absolute left-2 right-2 top-2 h-0.5 rounded bg-primary shadow-[0_0_12px_2px_var(--color-primary)]" />
          </div>
        </div>
        {error && (
          <div className="absolute inset-x-4 top-4 rounded-2xl bg-card p-4 text-center text-sm font-bold text-foreground">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-2 p-4 text-center">
        <p className="text-sm text-white/80">Aponte para o QR Code impresso no comprovante da aposta</p>
        {hasTorch && (
          <button onClick={toggleTorch} className="rounded-full bg-white/15 px-5 py-2 text-sm font-bold text-white">
            {torch ? "🔦 Desligar lanterna" : "🔦 Ligar lanterna"}
          </button>
        )}
      </div>
    </div>
  );
}
