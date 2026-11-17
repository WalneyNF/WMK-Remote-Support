import { useEffect, useRef, useState } from "react";
import type { RemoteSession } from "../lib/session";

/**
 * Gravador de laboratório. Apenas no console WEB servido em localhost.
 * Não é gravação de auditoria: faltam aviso/aceite no host, trilha assinada
 * e escrita contínua em disco para sessões longas.
 */
export function LabRecorder({ session }: { session: RemoteSession }) {
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const media = useRef<MediaRecorder | null>(null);
  const interval = useRef<number | null>(null);
  const limit = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const [seconds, setSeconds] = useState(0);

  const stop = () => {
    if (interval.current !== null) window.clearInterval(interval.current);
    if (limit.current !== null) window.clearTimeout(limit.current);
    interval.current = null;
    limit.current = null;
    if (media.current && media.current.state !== "inactive") media.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  useEffect(() => {
    if (session.state !== "live" && recording) stop();
    // O estado remoto é entregue pelo componente pai via renderização da sessão.
  }, [session.state, recording]);

  useEffect(() => () => {
    if (interval.current !== null) window.clearInterval(interval.current);
    if (limit.current !== null) window.clearTimeout(limit.current);
    if (media.current?.state !== "inactive") media.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    if (recording || session.state !== "live") return;
    const approved = window.confirm(
      "GRAVAÇÃO DE LABORATÓRIO (máximo 30 segundos).\n\n" +
      "Confirma que você controla a máquina atendida e tem autorização para registrar sua tela? " +
      "O vídeo será salvo SOMENTE neste computador. Não existe aviso remoto nem auditoria assinada nesta prévia."
    );
    if (!approved) return;
    if (!("MediaRecorder" in window)) {
      setNotice("Este navegador não oferece MediaRecorder. Use Edge ou Chrome.");
      return;
    }
    const mime = ["video/webm;codecs=vp8", "video/webm"].find(MediaRecorder.isTypeSupported);
    if (!mime) {
      setNotice("Este navegador não suporta a gravação WebM.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx || !canvas.captureStream) {
      setNotice("Não foi possível criar o gravador de vídeo.");
      return;
    }
    const stream = canvas.captureStream(3);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setNotice("O MediaRecorder não pôde iniciar.");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onerror = () => {
      setNotice("Falha ao gravar. Os dados podem estar incompletos.");
      stop();
    };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!chunks.length) {
        setNotice("A gravação não produziu dados. Tente novamente com vídeo ativo.");
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `WMK-Laboratorio-${session.code}-${stamp}.webm`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Gravação WebM enviada para a pasta de downloads do navegador.");
    };

    const takeFrame = async () => {
      if (busy.current || session.state !== "live") return;
      busy.current = true;
      try {
        const blob = await session.captureRemoteScreen();
        const bitmap = await createImageBitmap(blob);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        bitmap.close();
      } catch {
        setNotice("Não foi possível capturar um quadro; encerrando a gravação.");
        stop();
      } finally {
        busy.current = false;
      }
    };

    media.current = rec;
    streamRef.current = stream;
    setNotice(null);
    setSeconds(0);
    try {
      await takeFrame();
      rec.start(1000);
      setRecording(true);
      interval.current = window.setInterval(() => {
        setSeconds((n) => n + 1);
        void takeFrame();
      }, 1000);
      limit.current = window.setTimeout(() => {
        setNotice("Limite de 30 segundos do laboratório atingido.");
        stop();
      }, 30_000);
    } catch {
      stop();
      setNotice("Não foi possível iniciar a gravação.");
    }
  }

  const available = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!available) return null;

  return (
    <div className="menu-anchor" title="Gravador experimental para testes locais; não é auditoria homologada">
      <button
        type="button"
        className={`tb-btn ${recording ? "on" : ""}`}
        onClick={() => recording ? stop() : void start()}
        disabled={!recording && session.state !== "live"}
        aria-label={recording ? "Parar gravação experimental" : "Gravar sessão de laboratório (máximo 30 segundos)"}
      >
        <span>{recording ? `⏹ Gravação ${seconds}s` : "● Gravar teste"}</span>
      </button>
      {notice && <span className="muted small" role="status">{notice}</span>}
    </div>
  );
}
