import { useEffect, useRef, useState } from "react";
import { WmkSupportAiPanel } from "./WmkSupportAiPanel";

/**
 * Biblioteca LOCAL de revisão de vídeos e anotações de suporte.
 * Não tem acesso ao computador remoto nem coleta conteúdo automaticamente.
 * O vídeo selecionado nunca é enviado a serviços externos.
 */
type Evidence = {
  id: string;
  at: number;
  title: string;
  observed: string;
  nextSteps: string;
  status: "identificado" | "em_analise" | "corrigido";
  createdAt: string;
};
const STORE = "wmk.evidence.notes.v1";
const MAX_VIDEO = 15 * 1024 * 1024 * 1024; // Seletor local, sem carregamento do arquivo inteiro em memória.
function timestamp(t: number) {
  if (!Number.isFinite(t)) return "00:00:00";
  const seconds = Math.floor(Math.max(0, t));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, "0")).join(":");
}
function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const el = document.createElement("a");
  el.href = url;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  el.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function safeName(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 90);
}
function readNotes(): Evidence[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (Array.isArray(value)) {
      return value.filter((v): v is Evidence =>
        !!v && typeof v.id === "string" && typeof v.title === "string" &&
        typeof v.at === "number" && Number.isFinite(v.at) &&
        typeof v.observed === "string" && typeof v.nextSteps === "string" &&
        ["identificado", "em_analise", "corrigido"].includes(v.status) &&
        typeof v.createdAt === "string").slice(0, 300);
    }
  } catch { /* Navegação privada: anotações continuam disponíveis em memória. */ }
  return [];
}

export function WmkEvidenceStudio({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState<Evidence[]>(readNotes);
  const [subject, setSubject] = useState("");
  const [observed, setObserved] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [status, setStatus] = useState<Evidence["status"]>("identificado");
  const [message, setMessage] = useState("Abra uma gravação local MP4 ou WebM para analisar o atendimento.");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(notes.slice(0, 300))); }
    catch { /* Exportar JSON garante cópia fora do armazenamento local. */ }
  }, [notes]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  function loadVideo(file: File | undefined) {
    if (!file) return;
    if (!/\.(mp4|webm|m4v|mov)$/i.test(file.name) ||
        file.size < 1 || file.size > MAX_VIDEO) {
      setMessage("Escolha vídeo MP4 ou WebM válido. O navegador precisa oferecer suporte ao codec.");
      return;
    }
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setTime(0); setDuration(0);
    setMessage("Gravação aberta localmente. Pause no erro, capture PNG e crie uma anotação.");
  }

  function captureFrame() {
    const player = video.current;
    if (!player || !videoUrl || !player.videoWidth || !player.videoHeight || player.readyState < 2) {
      setMessage("Abra o vídeo e aguarde a imagem aparecer antes de capturar.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = player.videoWidth;
    canvas.height = player.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setMessage("O navegador não permite capturar a imagem."); return; }
    try {
      ctx.drawImage(player, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) { setMessage("Falha ao gerar PNG."); return; }
        download(blob, "WMK-Frame-" + safeName(fileName.replace(/\.[^.]+$/, "")) +
          "-" + timestamp(player.currentTime).replace(/:/g, "-") + ".png");
        setMessage("Imagem do instante " + timestamp(player.currentTime) + " enviada para download.");
      }, "image/png");
    } catch {
      setMessage("Não foi possível copiar o quadro: verifique o codec e as permissões do vídeo.");
    }
  }

  function addNote() {
    if (!subject.trim() || !observed.trim()) {
      setMessage("Preencha o título e o problema identificado antes de salvar o post-it.");
      return;
    }
    if (notes.length >= 300) {
      setMessage("Limite de 300 anotações. Exporte e organize o dossiê antes de continuar.");
      return;
    }
    const at = video.current?.currentTime ?? 0;
    setNotes(current => [...current, {
      id: crypto.randomUUID(), at, title: subject.trim().slice(0, 180),
      observed: observed.trim().slice(0, 4000),
      nextSteps: nextSteps.trim().slice(0, 4000), status,
      createdAt: new Date().toISOString(),
    }]);
    setSubject(""); setObserved(""); setNextSteps("");
    setMessage("Anotação criada em " + timestamp(at) + ". Exporte o JSON para arquivar.");
  }

  function exportJson() {
    const dossier = {
      schemaVersion: 1,
      product: "WMK Remote Support",
      author: "Walney Moreira Klein — walneyk@hotmail.com",
      videoFile: fileName,
      exportedAt: new Date().toISOString(),
      notes,
      warning: "O vídeo não está embutido no JSON. Guarde ambos os arquivos juntos.",
    };
    download(new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" }),
      "WMK-Evidencias-" + new Date().toISOString().slice(0, 10) + ".json");
    setMessage("Dossiê JSON exportado. Guarde-o junto do vídeo e das capturas.");
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) { setMessage("JSON muito grande; máximo 1 MiB."); return; }
    try {
      const obj: unknown = JSON.parse(await file.text());
      if (!obj || typeof obj !== "object" || !("schemaVersion" in obj) ||
          obj.schemaVersion !== 1 || !("notes" in obj) || !Array.isArray(obj.notes)) {
        throw new Error("Dossiê não reconhecido.");
      }
      const verified = obj.notes.filter((v: unknown): v is Evidence =>
        !!v && typeof v === "object" && "id" in v && typeof v.id === "string" &&
        "at" in v && typeof v.at === "number" && Number.isFinite(v.at) &&
        "title" in v && typeof v.title === "string" &&
        "observed" in v && typeof v.observed === "string" &&
        "nextSteps" in v && typeof v.nextSteps === "string" &&
        "status" in v && typeof v.status === "string" &&
        ["identificado", "em_analise", "corrigido"].includes(v.status) &&
        "createdAt" in v && typeof v.createdAt === "string").slice(0, 300);
      if (!window.confirm("Substituir as anotações locais pelas " + verified.length +
        " anotações importadas? Exporte as atuais antes, se desejar mantê-las.")) return;
      setNotes(verified);
      setMessage("Dossiê importado. Selecione separadamente o vídeo correspondente.");
    } catch (e) {
      setMessage("Falha ao importar: " + (e instanceof Error ? e.message : "JSON inválido."));
    }
  }

  const filtered = notes.filter(n => (n.title + " " + n.observed + " " + n.nextSteps)
    .toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));

  return <div className="wmk-ev-overlay" role="dialog" aria-modal="true" aria-label="WMK Central de Evidências">
    <div className="wmk-ev-modal">
      <header className="wmk-ev-head">
        <div><strong>WMK Central de Evidências</strong>
          <span>Revisar gravações • Capturar PNG • Post-its • Dossiê de atendimento</span></div>
        <button type="button" onClick={onClose} aria-label="Fechar central de evidências">✕</button>
      </header>
      <div className="wmk-ev-tools">
        <button onClick={() => fileInput.current?.click()}>Abrir vídeo MP4/WebM</button>
        <input ref={fileInput} hidden type="file" accept=".mp4,.webm,.m4v,.mov,video/mp4,video/webm"
          onChange={e => { loadVideo(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={captureFrame} disabled={!videoUrl}>Capturar quadro PNG</button>
        <button onClick={exportJson}>Exportar anotações JSON</button>
        <button onClick={() => jsonInput.current?.click()}>Importar JSON</button>
        <input ref={jsonInput} hidden type="file" accept=".json,application/json"
          onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="wmk-ev-columns">
        <section className="wmk-ev-player">
          {videoUrl ? <video ref={video} src={videoUrl} controls playsInline preload="metadata"
            onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
            onError={() => setMessage("Não foi possível reproduzir: codec ou contêiner não suportado.")} /> :
            <div className="wmk-ev-placeholder">Abra uma gravação local para reproduzir e capturar a imagem do erro.</div>}
          <div className="wmk-ev-time">{fileName || "Nenhum vídeo selecionado"} • {timestamp(time)} / {timestamp(duration)}</div>
          <div className="wmk-ev-seek">
            <button disabled={!videoUrl} onClick={() => { if (video.current) video.current.currentTime = Math.max(0, video.current.currentTime - 5); }}>−5 s</button>
            <button disabled={!videoUrl} onClick={() => { if (video.current) video.current.currentTime = Math.min(duration || 0, video.current.currentTime + 5); }}>+5 s</button>
            <button disabled={!videoUrl} onClick={() => { if (video.current) video.current.pause(); }}>Pausar no erro</button>
            <label>Velocidade <select defaultValue="1" onChange={e => { if (video.current) video.current.playbackRate = Number(e.target.value); }}>
              <option value="0.5">0,5×</option><option value="1">1×</option><option value="1.5">1,5×</option><option value="2">2×</option>
            </select></label>
          </div>
          <div className="wmk-ev-message" role="status">{message}</div>
        </section>
        <section className="wmk-ev-notes">
          <h3>Post-it do atendimento</h3>
          <label>Título <input value={subject} maxLength={180} onChange={e => setSubject(e.target.value)}
            placeholder="Ex.: rejeição 539 / duplicidade de NF-e" /></label>
          <label>Problema identificado <textarea value={observed} maxLength={4000}
            onChange={e => setObserved(e.target.value)} rows={3}
            placeholder="Mensagem exata, passo executado, comportamento observado..." /></label>
          <label>Como pretendo resolver <textarea value={nextSteps} maxLength={4000}
            onChange={e => setNextSteps(e.target.value)} rows={3}
            placeholder="Verificar XML, logs, configuração; encaminhar à programação..." /></label>
          <label>Situação <select value={status} onChange={e => setStatus(e.target.value as Evidence["status"])}>
            <option value="identificado">Identificado</option>
            <option value="em_analise">Em análise</option>
            <option value="corrigido">Corrigido</option>
          </select></label>
          <button onClick={addNote}>Salvar post-it no instante {timestamp(time)}</button>
          <WmkSupportAiPanel notes={notes} />
          <div className="wmk-ev-search"><input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar anotações..." /></div>
          <div className="wmk-ev-list">
            {filtered.length === 0 ? <p>Nenhuma anotação encontrada.</p> :
              filtered.map(item => <article className="wmk-ev-note" key={item.id}>
                <div><button type="button" onClick={() => { if (video.current && videoUrl) { video.current.currentTime = item.at; video.current.pause(); } }}
                  title="Ir ao momento no vídeo">{timestamp(item.at)}</button>
                  <strong>{item.title}</strong></div>
                <p>{item.observed}</p>{item.nextSteps && <p><b>Próximos passos:</b> {item.nextSteps}</p>}
                <div className="wmk-ev-note-actions">
                  <small>{item.status.replace("_", " ")} • {new Date(item.createdAt).toLocaleString("pt-BR")}</small>
                  <button onClick={() => { if (window.confirm("Excluir esta anotação?")) setNotes(current => current.filter(n => n.id !== item.id)); }}>Excluir</button>
                </div>
              </article>)}
          </div>
        </section>
      </div>
      <footer className="wmk-ev-footer">Arquivos locais não são enviados a servidores. Anotações ficam neste navegador;
        exporte o JSON para arquivá-las. Não há vínculo automático com a sessão remota nesta prévia.
        • Walney Moreira Klein — walneyk@hotmail.com</footer>
    </div>
  </div>;
}
