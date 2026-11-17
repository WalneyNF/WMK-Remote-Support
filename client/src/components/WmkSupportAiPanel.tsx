import { useMemo, useState } from "react";

type SupportNote = {
  title: string;
  observed: string;
  nextSteps: string;
  at: number;
};
type Topic = "nfe" | "logs" | "xml" | "software";

const templates: Record<Topic, { title: string; instructions: string }> = {
  nfe: {
    title: "NF-e / SEFAZ",
    instructions: "Identifique cStat, xMotivo, modelo, ambiente e etapa da operação. Diferencie rejeição, duplicidade, contingência, cancelamento e autorização. Não invente regras fiscais nem recomende retransmissão sem conferir a situação da nota e as orientações oficiais."
  },
  logs: {
    title: "Logs e retornos",
    instructions: "Identifique a primeira causa provável, timestamps e sequência de falhas. Separe erro original dos erros derivados. Sugira diagnósticos reproduzíveis, com baixo risco."
  },
  xml: {
    title: "XML / JSON",
    instructions: "Explique a estrutura, campos suspeitos e inconsistências sintáticas. Não altere XMLs assinados digitalmente. Diferencie validação sintática de validação contra XSD ou regras externas."
  },
  software: {
    title: "Bug do sistema",
    instructions: "Descreva hipótese, reprodução mínima, impacto, evidências necessárias, testes de regressão e possível correção para a equipe de desenvolvimento."
  }
};

function redact(value: string) {
  return value
    .replace(/\b\d{44}\b/g, "[CHAVE_NFE_OCULTA]")
    .replace(/\b\d{14}\b/g, "[CNPJ_OCULTO]")
    .replace(/\b\d{11}\b/g, "[CPF_OCULTO]")
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "[EMAIL_OCULTO]")
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s;,]+/gi, "$1[SEGREDO_OCULTO]")
    .replace(/(password|senha|token|api[_-]?key|secret)(\s*[:=]\s*)[^\s;,]+/gi, "$1$2[SEGREDO_OCULTO]");
}

export function WmkSupportAiPanel({ notes }: { notes: SupportNote[] }) {
  const [topic, setTopic] = useState<Topic>("nfe");
  const [question, setQuestion] = useState("Qual a causa provável e quais verificações seguras devo fazer?");
  const [extra, setExtra] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [warning, setWarning] = useState("");

  const prompt = useMemo(() => {
    const context = includeNotes ? notes.slice(-10).map((n, i) =>
      `### Evidência ${i + 1} — segundo ${Math.round(n.at)}
Título: ${n.title}
Ocorrência: ${n.observed}
Próximos passos: ${n.nextSteps}`).join("\n\n") : "";
    const parts = [
      "Você é um assistente técnico especializado em análise de erros de software.",
      "Responda em português do Brasil. Não invente informações nem conclua sem evidências.",
      "Nunca sugira execução automática, alteração de dados fiscais ou exposição de segredos.",
      "Separe: fatos observáveis, hipóteses, testes seguros, riscos e encaminhamento à programação.",
      templates[topic].instructions,
      "Pergunta: " + question.slice(0, 1500),
      extra.trim() ? "Contexto adicional fornecido pelo operador:\n" + extra.slice(0, 8000) : "",
      context ? "Notas selecionadas (podem conter dados confidenciais):\n" + context : "",
      "Se faltarem informações, diga quais evidências precisam ser coletadas."
    ];
    return redact(parts.filter(Boolean).join("\n\n"));
  }, [topic, question, extra, includeNotes, notes]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setWarning("Consulta copiada. Revise e remova dados sensíveis antes de enviar a qualquer IA.");
    } catch {
      setWarning("Cópia indisponível. Selecione o texto gerado abaixo e copie manualmente.");
    }
  };

  return <section className="wmk-ai-panel" aria-label="WMK Assistente de Diagnóstico">
    <h3>WMK Support Intelligence — preparar consulta à IA</h3>
    <p>Ferramenta local de preparação. Não chama provedores nem envia informações automaticamente.</p>
    <div className="wmk-ai-grid">
      <label>Tipo de problema
        <select value={topic} onChange={e => setTopic(e.target.value as Topic)}>
          {Object.entries(templates).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}
        </select>
      </label>
      <label>Pergunta
        <input value={question} maxLength={1500} onChange={e => setQuestion(e.target.value)} />
      </label>
    </div>
    <label>Retorno de erro / trecho de log / observações
      <textarea rows={3} value={extra} maxLength={8000} onChange={e => setExtra(e.target.value)}
        placeholder="Cole apenas os campos necessários: cStat, xMotivo, stack trace, mensagens..." />
    </label>
    <label className="wmk-ai-checkbox">
      <input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} />
      Incluir até 10 post-its recentes na consulta (revise a privacidade)
    </label>
    <label>Prévia da consulta (editável apenas nos campos acima)
      <textarea rows={6} value={prompt} readOnly />
    </label>
    <div className="wmk-ai-actions">
      <button type="button" onClick={() => void copy()}>Copiar consulta para IA</button>
      <span role="status">{warning}</span>
    </div>
    <p><strong>Aviso:</strong> a anonimização por padrões é parcial; pode deixar informações pessoais ou empresariais. Revise antes de usar IA na nuvem. O suporte direto a Ollama, Groq, OpenAI e Gemini exigirá um backend seguro, controle de credenciais e consentimento.</p>
  </section>;
}
