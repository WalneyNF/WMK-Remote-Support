import { useEffect, useRef, useState } from "react";

/**
 * Janela exclusiva do operador. Não participa do protocolo de sessão, não envia
 * comandos à máquina atendida e NÃO captura tela ou clipboard automaticamente.
 *
 * A única conexão de IA ativa desta prévia é o Ollama do computador do técnico,
 * via localhost. Provedores com API key exigem ponte Rust segura futura.
 */
type ProviderKind = "ollama" | "groq" | "openai" | "gemini";
type Provider = { id: string; name: string; kind: ProviderKind; endpoint: string; model: string };
type Agent = { id: string; title: string; description: string; instructions: string };
type ChatItem = { role: "user" | "assistant"; content: string };
const PROVIDER_KEY = "wmk.technician.providers.v1";
const AGENT_KEY = "wmk.technician.agents.v1";
const PROVIDERS: Provider[] = [
  { id: "ollama-local", name: "Ollama local", kind: "ollama", endpoint: "http://127.0.0.1:11434", model: "qwen2.5:7b" },
  { id: "groq-catalog", name: "Groq — requer backend", kind: "groq", endpoint: "", model: "" },
  { id: "openai-catalog", name: "OpenAI — requer backend", kind: "openai", endpoint: "", model: "" },
  { id: "gemini-catalog", name: "Gemini — requer backend", kind: "gemini", endpoint: "", model: "" },
];
const AGENTS: Agent[] = [
  { id: "fiscal", title: "Especialista ACBr / NF-e / NFC-e",
    description: "Emissão, cancelamento, contingência, SEFAZ, XML e integração fiscal.",
    instructions: "Atue como assistente de diagnóstico para sistemas comerciais usando ACBr, NF-e e NFC-e. Examine cStat, xMotivo, XML, etapa de emissão, ambiente e logs quando fornecidos. Diferencie fatos, hipóteses e testes. Não invente regras fiscais. Não afirme que uma NF-e está autorizada, cancelada ou duplicada sem consultar os documentos e serviços oficiais pertinentes. Nunca recomende reenviar a nota sem antes conferir autorização e risco de duplicidade." },
  { id: "windows", title: "Diagnóstico Windows e rede",
    description: "Serviços, drivers, permissões, conexões e instalação.",
    instructions: "Atue como especialista de suporte Windows. Oriente investigação por etapas, peça logs e observações, priorize ações reversíveis e explique impactos. Não solicite senhas nem execução de comandos destrutivos." },
  { id: "developer", title: "Desenvolvedor e depurador",
    description: "Bugs, stack traces, integrações, API, VFP e banco de dados.",
    instructions: "Atue como revisor de código e diagnóstico de software, inclusive Visual FoxPro, APIs e bancos de dados. Identifique causa provável e formas de reproduzir, proponha testes de regressão e rollback. Evite modificar bancos em uso e preserve dados fiscais." },
];

function safeLoad<T extends { id: string }>(key: string, fallback: T[], valid: (v: unknown) => v is T): T[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(raw)) {
      const items = raw.filter(valid).slice(0, 24);
      return items.length ? items : fallback;
    }
  } catch { /* armazenamento indisponível */ }
  return fallback;
}
function providerValid(v: unknown): v is Provider {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Provider>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.endpoint === "string" &&
    typeof p.model === "string" && ["ollama", "groq", "openai", "gemini"].includes(p.kind ?? "");
}
function agentValid(v: unknown): v is Agent {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<Agent>;
  return typeof a.id === "string" && typeof a.title === "string" && typeof a.description === "string" &&
    typeof a.instructions === "string";
}
function isLocalOllama(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === "11434" && (url.pathname === "/" || url.pathname === "");
  } catch { return false; }
}
function downloadText(content: string, name: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function WmkTechnicianAi({ onClose, sessionLabel }: { onClose: () => void; sessionLabel?: string }) {
  const [providers, setProviders] = useState<Provider[]>(() => safeLoad(PROVIDER_KEY, PROVIDERS, providerValid));
  const [agents, setAgents] = useState<Agent[]>(() => safeLoad(AGENT_KEY, AGENTS, agentValid));
  const [providerId, setProviderId] = useState("ollama-local");
  const [agentId, setAgentId] = useState("fiscal");
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Conversa privada do técnico. Nenhum dado da sessão é enviado automaticamente.");
  const [settings, setSettings] = useState(false);
  const [agentEditor, setAgentEditor] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const provider = providers.find(p => p.id === providerId) ?? providers[0];
  const agent = agents.find(a => a.id === agentId) ?? agents[0];

  useEffect(() => {
    try { localStorage.setItem(PROVIDER_KEY, JSON.stringify(providers)); } catch { /* sem persistência */ }
  }, [providers]);
  useEffect(() => {
    try { localStorage.setItem(AGENT_KEY, JSON.stringify(agents)); } catch { /* sem persistência */ }
  }, [agents]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [history]);

  const send = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    if (!provider || provider.kind !== "ollama") {
      setNotice("Nesta versão, apenas Ollama local está conectado. Provedores com chave exigem backend Rust seguro.");
      return;
    }
    if (!isLocalOllama(provider.endpoint) || !provider.model.trim()) {
      setNotice("Por segurança, esta prévia permite Ollama somente em http://127.0.0.1:11434 e modelo configurado.");
      return;
    }
    if (question.length > 12000) {
      setNotice("Pergunta muito grande; limite de 12.000 caracteres nesta prévia.");
      return;
    }
    const next: ChatItem[] = [...history, { role: "user", content: question }].slice(-20);
    setHistory(next);
    setDraft("");
    setBusy(true);
    setNotice("Consultando Ollama local…");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 90000);
    try {
      const response = await fetch(provider.endpoint + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model.trim(),
          stream: false,
          messages: [
            { role: "system", content: agent.instructions + "\nResponda em português do Brasil. Indique incertezas. Não execute ações na máquina do cliente. Não solicite informações sensíveis." },
            ...next.map(m => ({ role: m.role, content: m.content })),
          ],
          options: { num_predict: 1200 },
        }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Ollama respondeu HTTP " + response.status);
      const result: unknown = await response.json();
      const answer = (result as { message?: { content?: unknown } }).message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Resposta vazia ou inválida do modelo.");
      setHistory(items => [...items, { role: "assistant", content: answer.slice(0, 24000) }].slice(-20));
      setNotice("Resposta local recebida. Confirme orientações técnicas antes de aplicá-las.");
    } catch (error) {
      setNotice("Falha na consulta local: " + (error instanceof Error ? error.message : "erro desconhecido") +
        ". Confira se Ollama está ativo, se o modelo foi baixado e se o acesso local é permitido pelo WebView/CORS.");
    } finally {
      window.clearTimeout(timeout);
      controller.current = null;
      setBusy(false);
    }
  };

  const cancel = () => { controller.current?.abort(); setNotice("Solicitação cancelada."); };
  const addAgent = () => {
    if (agents.length >= 24) return setNotice("Limite de 24 agentes.");
    const id = "agent-" + crypto.randomUUID();
    setAgents(old => [...old, { id, title: "Novo agente", description: "Especialidade personalizada",
      instructions: "Responda em português, explicite incertezas e apresente testes seguros." }]);
    setAgentId(id); setAgentEditor(true);
  };
  const addProvider = () => {
    if (providers.length >= 24) return setNotice("Limite de 24 provedores.");
    const id = "provider-" + crypto.randomUUID();
    setProviders(old => [...old, { id, name: "Ollama local personalizado", kind: "ollama",
      endpoint: "http://127.0.0.1:11434", model: "" }]);
    setProviderId(id); setSettings(true);
  };
  const updateAgent = (patch: Partial<Agent>) => setAgents(old =>
    old.map(a => a.id === agent.id ? { ...a, ...patch } : a));
  const updateProvider = (patch: Partial<Provider>) => setProviders(old =>
    old.map(p => p.id === provider.id ? { ...p, ...patch } : p));
  const exportConversation = () => downloadText(JSON.stringify({
    schemaVersion: 1, product: "WMK Remote Support", sessionLabel: sessionLabel ?? "",
    exportedAt: new Date().toISOString(), agentTitle: agent?.title, providerName: provider?.name,
    history,
  }, null, 2), "WMK-Chat-IA-" + new Date().toISOString().slice(0, 10) + ".json");

  return <aside className="wmk-techai" aria-label="Chat privado de IA para o técnico">
    <header className="wmk-techai-head">
      <div><strong>WMK Assistente IA</strong><small>Privado do técnico • Não aparece na tela remota</small></div>
      <button type="button" onClick={onClose} aria-label="Fechar chat do técnico">✕</button>
    </header>
    <div className="wmk-techai-settingsbar">
      <label>Agente <select value={agentId} onChange={e => setAgentId(e.target.value)}>
        {agents.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select></label>
      <label>Provedor <select value={providerId} onChange={e => setProviderId(e.target.value)}>
        {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <div className="wmk-techai-buttons">
        <button onClick={() => setSettings(v => !v)}>Provedores</button>
        <button onClick={() => setAgentEditor(v => !v)}>Agentes</button>
      </div>
    </div>
    {settings && provider && <div className="wmk-techai-config">
      <strong>Cadastro de provedor</strong>
      <label>Nome <input value={provider.name} onChange={e => updateProvider({ name: e.target.value.slice(0, 80) })}/></label>
      <label>Tipo <select value={provider.kind} onChange={e => updateProvider({ kind: e.target.value as ProviderKind })}>
        {(["ollama", "groq", "openai", "gemini"] as const).map(k => <option key={k} value={k}>{k}</option>)}
      </select></label>
      <label>Endpoint (somente Ollama localhost é executado)
        <input value={provider.endpoint} onChange={e => updateProvider({ endpoint: e.target.value.slice(0, 180) })}/></label>
      <label>Modelo <input value={provider.model} onChange={e => updateProvider({ model: e.target.value.slice(0, 100) })}/></label>
      <button onClick={addProvider}>Novo provedor</button>
      <p>Não informe chaves API aqui: nenhuma credencial de nuvem é armazenada no navegador.</p>
    </div>}
    {agentEditor && agent && <div className="wmk-techai-config">
      <strong>Cadastro de agente</strong>
      <label>Nome <input value={agent.title} onChange={e => updateAgent({ title: e.target.value.slice(0, 100) })}/></label>
      <label>Descrição <input value={agent.description} onChange={e => updateAgent({ description: e.target.value.slice(0, 180) })}/></label>
      <label>Instruções editáveis <textarea rows={5} value={agent.instructions}
        onChange={e => updateAgent({ instructions: e.target.value.slice(0, 9000) })}/></label>
      <button onClick={addAgent}>Novo agente</button>
    </div>}
    <div className="wmk-techai-conversation" role="log" aria-live="polite">
      {history.length === 0 && <div className="wmk-techai-empty">
        <strong>{agent?.title}</strong><p>{agent?.description}</p>
        <p>Pergunte sobre erros ACBr, retornos SEFAZ, XML, logs ou testes de atualização. Este painel não acompanha sua tela automaticamente.</p>
      </div>}
      {history.map((m, i) => <article key={i} className={m.role === "assistant" ? "wmk-techai-answer" : "wmk-techai-question"}>
        <b>{m.role === "assistant" ? "IA" : "Técnico"}</b><p>{m.content}</p>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(m.content)}>Copiar</button>
      </article>)}
      <div ref={chatEnd}/>
    </div>
    <div className="wmk-techai-compose">
      <textarea value={draft} onChange={e => setDraft(e.target.value)} maxLength={12000}
        placeholder="Ex.: ACBr retornou cStat 539. Quais verificações faço antes de retransmitir?"
        onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        rows={3} aria-label="Perguntar ao agente de IA" />
      <div className="wmk-techai-buttons">
        {busy ? <button onClick={cancel}>Cancelar</button> : <button onClick={() => void send()} disabled={!draft.trim()}>Enviar</button>}
        <button onClick={exportConversation} disabled={history.length === 0}>Exportar chat</button>
        <button onClick={() => { if (window.confirm("Limpar o histórico deste chat?")) setHistory([]); }} disabled={history.length === 0}>Limpar</button>
      </div>
      <small role="status">{notice}</small>
      <small>Você decide o que copiar para a IA. Nunca cole senhas, chaves ou XML integral sem autorização.</small>
    </div>
  </aside>;
}
