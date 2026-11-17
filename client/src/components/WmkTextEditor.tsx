import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Editor de suporte WMK — v0.3.
 *
 * Somente arquivos selecionados pelo usuário neste dispositivo.
 * Não abre caminhos do computador remoto sem o transporte de arquivos,
 * nem envia conteúdo do documento para provedores externos.
 */
type Kind = "xml" | "json" | "text";
const MAX_BYTES = 5 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["xml", "json", "txt", "log", "ini", "cfg", "csv", "md", "yaml", "yml", "toml", "properties"]);
const EDITOR_ACCEPT = [...TEXT_EXTENSIONS].map(e => "." + e).join(",");

function detectKind(filename: string): Kind {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "xml" ? "xml" : ext === "json" ? "json" : "text";
}

function validateXml(value: string): string | null {
  const doc = new DOMParser().parseFromString(value, "application/xml");
  const error = doc.querySelector("parsererror");
  return error?.textContent?.trim() || null;
}

/**
 * Só insere quebras e recuos entre tags sem texto misto.
 * No caso de XML com conteúdo misto, mantém o conteúdo original.
 * Formatar é operação EXPLÍCITA: nunca transforma arquivos fiscais ao abrir.
 */
function prettyXml(value: string): string {
  const err = validateXml(value);
  if (err) throw new Error("XML inválido: " + err.slice(0, 250));
  const doc = new DOMParser().parseFromString(value, "application/xml");
  const declaration = value.match(/^\s*(<\?xml[^?]*\?>)/i)?.[1];
  const serialize = new XMLSerializer();
  function write(node: Node, depth: number): string {
    const indent = "  ".repeat(depth);
    if (node.nodeType !== Node.ELEMENT_NODE) return indent + serialize.serializeToString(node);
    const element = node as Element;
    const children = Array.from(element.childNodes);
    const hasMixed = children.some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
    if (hasMixed || children.some(n => n.nodeType === Node.CDATA_SECTION_NODE)) {
      return indent + serialize.serializeToString(element);
    }
    const empty = children.filter(n => n.nodeType !== Node.TEXT_NODE || !!n.textContent?.trim());
    if (empty.length === 0) return indent + serialize.serializeToString(element);
    // Serializa o elemento sem nós-filhos para preservar atributos e namespaces.
    const shallow = element.cloneNode(false) as Element;
    const opening = serialize.serializeToString(shallow).replace(/\s*\/>$/, ">");
    const tag = element.tagName;
    return indent + opening + "\n" + empty.map(n => write(n, depth + 1)).join("\n") +
      "\n" + indent + "</" + tag + ">";
  }
  const prefix = declaration ? declaration + "\n" : "";
  const children = Array.from(doc.childNodes).filter(n => n.nodeType !== Node.PROCESSING_INSTRUCTION_NODE ||
    !/^xml$/i.test((n as ProcessingInstruction).target));
  return prefix + children.map(n => write(n, 0)).join("\n") + "\n";
}

export function WmkTextEditor({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [filename, setFilename] = useState("novo.txt");
  const [kind, setKind] = useState<Kind>("text");
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Abra um XML, JSON ou texto local para começar.");
  const [wrap, setWrap] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const dirty = value !== original;

  const confirmDiscard = useCallback(() => !dirty ||
    window.confirm("Há alterações não salvas. Deseja descartá-las?"), [dirty]);

  const close = useCallback(() => { if (confirmDiscard()) onClose(); }, [confirmDiscard, onClose]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.target !== inputRef.current) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [close]);

  async function openFile(file: File | undefined) {
    if (!file || !confirmDiscard()) return;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (!TEXT_EXTENSIONS.has(ext)) {
      setStatus("Tipo de arquivo não suportado no editor. ZIP, EXE e binários devem ser transferidos, não editados como texto.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("Arquivo muito grande para edição segura (limite: 5 MiB). Utilize o gerenciador de arquivos para transferências.");
      return;
    }
    try {
      const text = await file.text();
      if (text.includes("\0")) {
        setStatus("O arquivo contém bytes nulos. Parece ser binário; abertura cancelada.");
        return;
      }
      setFilename(file.name);
      setKind(detectKind(file.name));
      setValue(text);
      setOriginal(text);
      setStatus(file.name + " aberto localmente (" + file.size.toLocaleString("pt-BR") + " bytes).");
    } catch {
      setStatus("Erro ao ler o arquivo local.");
    }
  }

  function validate() {
    try {
      if (kind === "json") JSON.parse(value);
      else if (kind === "xml") {
        const error = validateXml(value);
        if (error) throw new Error(error);
      }
      setStatus(kind === "text" ? "Texto carregado; não há validação estrutural para TXT/LOG." :
        (kind === "xml" ? "XML bem formado (não comprova validade XSD nem autorização de NF-e)." : "JSON sintaticamente válido."));
    } catch (e) {
      setStatus("Validação: " + (e instanceof Error ? e.message : "Arquivo inválido."));
    }
  }

  function format() {
    try {
      if (readOnly) return;
      if (kind === "text") { setStatus("Formatação automática disponível para XML e JSON."); return; }
      const formatted = kind === "json" ? JSON.stringify(JSON.parse(value), null, 2) + "\n" : prettyXml(value);
      setValue(formatted);
      setStatus("Texto formatado. Revise as mudanças antes de salvar; o arquivo original não foi alterado.");
    } catch (e) {
      setStatus("Falha na formatação: " + (e instanceof Error ? e.message : "Estrutura inválida."));
    }
  }

  function saveCopy() {
    if (value.length > MAX_BYTES) { setStatus("Documento acima do limite de edição."); return; }
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    setOriginal(value);
    setStatus("Cópia enviada para download. Verifique a pasta de destino do navegador. O arquivo do cliente não foi alterado.");
  }

  function findNext() {
    const text = search.trim();
    if (!text) { setStatus("Digite o texto a pesquisar."); return; }
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionEnd;
    let pos = value.toLowerCase().indexOf(text.toLowerCase(), start);
    if (pos < 0) pos = value.toLowerCase().indexOf(text.toLowerCase(), 0);
    if (pos < 0) { setStatus("Texto não encontrado."); return; }
    editor.focus();
    editor.setSelectionRange(pos, pos + text.length);
    const line = value.slice(0, pos).split("\n").length;
    setStatus("Ocorrência encontrada na linha " + line + ".");
  }

  const stats = useMemo(() => ({
    lines: value.split("\n").length,
    bytes: new Blob([value]).size,
  }), [value]);

  return (
    <div className="wmk-edit-overlay" role="dialog" aria-modal="true" aria-label="WMK Editor de Arquivos">
      <div className="wmk-edit-modal">
        <div className="wmk-edit-bar">
          <div>
            <strong>WMK Editor de Arquivos</strong>
            <span className="wmk-edit-muted">XML / JSON / TXT / LOG • somente arquivos locais</span>
          </div>
          <button type="button" onClick={close} aria-label="Fechar editor">✕</button>
        </div>
        <div className="wmk-edit-toolbar">
          <button type="button" onClick={() => inputRef.current?.click()}>Abrir arquivo…</button>
          <input ref={inputRef} type="file" accept={EDITOR_ACCEPT} hidden
            onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={validate}>Validar</button>
          <button type="button" onClick={format} disabled={kind === "text" || readOnly}>Formatar {kind.toUpperCase()}</button>
          <button type="button" onClick={saveCopy} disabled={!value}>Salvar cópia…</button>
          <label><input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} /> Quebra de linha</label>
          <label><input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} /> Somente leitura</label>
        </div>
        <div className="wmk-edit-meta">
          <strong>{filename}{dirty ? " • não salvo" : ""}</strong>
          <span>{kind.toUpperCase()} • {stats.lines.toLocaleString("pt-BR")} linhas • {stats.bytes.toLocaleString("pt-BR")} bytes</span>
        </div>
        <div className="wmk-edit-find">
          <label htmlFor="wmk-edit-search">Pesquisar:</label>
          <input id="wmk-edit-search" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") findNext(); }} placeholder="CNPJ, cStat, xMotivo, erro..." />
          <button type="button" onClick={findNext}>Próxima ocorrência</button>
        </div>
        <textarea ref={editorRef} className="wmk-edit-textarea" value={value} readOnly={readOnly}
          onChange={e => setValue(e.target.value)} wrap={wrap ? "soft" : "off"} spellCheck={false}
          aria-label="Conteúdo do arquivo local" placeholder="Abra um XML, JSON, TXT ou LOG do seu computador..." />
        <div className="wmk-edit-status" role="status">{status}</div>
        <div className="wmk-edit-muted wmk-edit-bottom">
          Editor simples embutido nesta prévia (Monaco planejado). Nenhum arquivo remoto é lido ou alterado automaticamente.
          Nunca publique XMLs ou logs de clientes sem autorização.
        </div>
      </div>
    </div>
  );
}
