import { useEffect, useMemo, useState } from "react";

/** WMK Mini Service Desk: protótipo de uso individual.
 * Dados ficam SOMENTE no armazenamento local desta interface.
 * Não tem autenticação, banco compartilhado, backup automático ou integração GLPI.
 * Não registrar senhas, XMLs completos, CPF ou segredos nos campos de texto.
 */
type Customer = { id: string; name: string; contact: string; product: string; createdAt: string };
type Machine = { id: string; customerId: string; name: string; remoteCode: string; notes: string };
type TicketStatus = "aberto" | "em_atendimento" | "aguardando_cliente" | "encaminhado" | "resolvido";
type Ticket = { id: string; number: number; customerId: string; machineId: string; subject: string; category: string; priority: "baixa" | "normal" | "alta"; status: TicketStatus; details: string; resolution: string; createdAt: string; updatedAt: string };
type Entry = { id: string; ticketId: string; at: string; kind: "nota" | "atendimento" | "encaminhamento"; text: string };
type Data = { schemaVersion: 1; customers: Customer[]; machines: Machine[]; tickets: Ticket[]; entries: Entry[] };
const KEY = "wmk.mini-service-desk.v1";
const EMPTY: Data = { schemaVersion: 1, customers: [], machines: [], tickets: [], entries: [] };
const NOW = () => new Date().toISOString();
const ID = () => crypto.randomUUID();
const STATUS: Record<TicketStatus, string> = {
  aberto: "Aberto", em_atendimento: "Em atendimento", aguardando_cliente: "Aguardando cliente",
  encaminhado: "Encaminhado à programação", resolvido: "Resolvido"
};
function load(): Data {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!value || typeof value !== "object") return EMPTY;
    const d = value as Partial<Data>;
    if (d.schemaVersion !== 1 || !Array.isArray(d.customers) || !Array.isArray(d.machines) ||
      !Array.isArray(d.tickets) || !Array.isArray(d.entries)) return EMPTY;
    return {
      schemaVersion: 1,
      customers: d.customers.filter(v => typeof v.id === "string" && typeof v.name === "string").slice(0, 1000),
      machines: d.machines.filter(v => typeof v.id === "string" && typeof v.customerId === "string").slice(0, 2000),
      tickets: d.tickets.filter(v => typeof v.id === "string" && typeof v.customerId === "string" && typeof v.number === "number").slice(0, 5000),
      entries: d.entries.filter(v => typeof v.id === "string" && typeof v.ticketId === "string").slice(0, 20000),
    };
  } catch { return EMPTY; }
}
function exportJson(data: Data) {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "WMK-ServiceDesk-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function WmkMiniServiceDesk({ onClose, remoteCode }: { onClose: () => void; remoteCode?: string }) {
  const [data, setData] = useState<Data>(load);
  const [customerId, setCustomerId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [tab, setTab] = useState<"customers" | "tickets" | "machines">("tickets");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [product, setProduct] = useState("");
  const [machineName, setMachineName] = useState("");
  const [machineCode, setMachineCode] = useState(remoteCode ?? "");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Fiscal / NF-e");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Dados desta prévia ficam somente neste navegador. Exporte JSON para realizar backup.");
  const customer = data.customers.find(c => c.id === customerId);
  const ticket = data.tickets.find(t => t.id === ticketId);
  const machines = data.machines.filter(m => m.customerId === customerId);
  const entries = data.entries.filter(e => e.ticketId === ticketId).sort((a, b) => a.at.localeCompare(b.at));
  const filteredTickets = useMemo(() => data.tickets.filter(t => {
    const c = data.customers.find(x => x.id === t.customerId)?.name ?? "";
    return (t.subject + " " + c + " " + t.number).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data, search]);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { setMessage("Não foi possível persistir os dados neste navegador: exporte seu JSON agora."); }
  }, [data]);
  const addCustomer = () => {
    if (!name.trim()) return setMessage("Informe o nome da empresa ou cliente.");
    if (data.customers.length >= 1000) return setMessage("Limite de segurança desta prévia atingido.");
    const c: Customer = { id: ID(), name: name.trim().slice(0, 120), contact: contact.trim().slice(0, 120),
      product: product.trim().slice(0, 120), createdAt: NOW() };
    setData(d => ({ ...d, customers: [...d.customers, c] }));
    setCustomerId(c.id); setName(""); setContact(""); setProduct("");
    setMessage("Cliente cadastrado localmente.");
  };
  const addMachine = () => {
    if (!customer || !machineName.trim()) return setMessage("Selecione um cliente e informe o nome do computador.");
    const machine: Machine = { id: ID(), customerId, name: machineName.trim().slice(0, 100),
      remoteCode: /^\d{6}$/.test(machineCode) ? machineCode : "", notes: "" };
    setData(d => ({ ...d, machines: [...d.machines, machine] }));
    setMachineName(""); setMachineCode(""); setMessage("Computador cadastrado.");
  };
  const addTicket = () => {
    if (!customer || !subject.trim()) return setMessage("Selecione o cliente e descreva o assunto do chamado.");
    const next = Math.max(0, ...data.tickets.map(t => t.number)) + 1;
    const at = NOW();
    const t: Ticket = { id: ID(), number: next, customerId, machineId: "", subject: subject.trim().slice(0, 150),
      category: category.slice(0, 80), priority: "normal", status: "aberto", details: details.trim().slice(0, 3000),
      resolution: "", createdAt: at, updatedAt: at };
    setData(d => ({ ...d, tickets: [...d.tickets, t], entries: [...d.entries,
      { id: ID(), ticketId: t.id, at, kind: "atendimento", text: "Chamado aberto." }] }));
    setTicketId(t.id); setSubject(""); setDetails(""); setMessage("Chamado #" + next + " criado.");
  };
  const updateTicket = (patch: Partial<Ticket>, entry?: string) => {
    if (!ticket) return;
    const at = NOW();
    setData(d => ({
      ...d, tickets: d.tickets.map(t => t.id === ticket.id ? { ...t, ...patch, updatedAt: at } : t),
      entries: entry ? [...d.entries, { id: ID(), ticketId: ticket.id, at, kind: "atendimento", text: entry }] : d.entries,
    }));
  };
  const addNote = () => {
    if (!ticket || !note.trim()) return setMessage("Escolha um chamado e escreva uma nota.");
    setData(d => ({ ...d, entries: [...d.entries, { id: ID(), ticketId: ticket.id,
      at: NOW(), kind: "nota", text: note.trim().slice(0, 3000) }] }));
    setNote(""); setMessage("Nota interna registrada.");
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3_000_000) return setMessage("Arquivo JSON muito grande para esta prévia.");
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object") throw Error("Formato desconhecido.");
      const v = raw as Partial<Data>;
      if (v.schemaVersion !== 1 || !Array.isArray(v.customers) || !Array.isArray(v.machines) ||
        !Array.isArray(v.tickets) || !Array.isArray(v.entries)) throw Error("Arquivo não corresponde ao WMK Service Desk.");
      if (!window.confirm("Substituir os cadastros atuais? Exporte um backup antes de continuar.")) return;
      const json = JSON.stringify(v);
      localStorage.setItem(KEY, json);
      setData(load()); setCustomerId(""); setTicketId("");
      setMessage("Dados importados. Verifique os registros antes do atendimento.");
    } catch (e) { setMessage("Falha ao importar: " + (e instanceof Error ? e.message : "JSON inválido")); }
  };
  const customerTickets = data.tickets.filter(t => t.customerId === customerId).length;
  return <div className="wmk-sd-overlay" role="dialog" aria-modal="true" aria-label="WMK Mini Service Desk">
    <div className="wmk-sd-modal">
      <header className="wmk-sd-head"><div><strong>WMK Mini Service Desk</strong><small>Para desenvolvedores independentes e pequenas software houses • Prévia local</small></div>
        <button onClick={onClose} aria-label="Fechar Service Desk">✕</button></header>
      <div className="wmk-sd-toolbar">
        {(["tickets", "customers", "machines"] as const).map(x =>
          <button key={x} onClick={() => setTab(x)} className={tab === x ? "on" : ""}>
            {x === "tickets" ? "Chamados" : x === "customers" ? "Clientes" : "Computadores"}</button>)}
        <button onClick={() => exportJson(data)}>Exportar backup JSON</button>
        <label className="wmk-sd-import">Importar JSON <input hidden type="file" accept=".json"
          onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }}/></label>
      </div>
      <div className="wmk-sd-body">
        <aside className="wmk-sd-sidebar">
          <label>Cliente <select value={customerId} onChange={e => { setCustomerId(e.target.value); setTicketId(""); }}>
            <option value="">Selecione uma empresa</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          {customer && <div className="wmk-sd-customer">
            <strong>{customer.name}</strong><span>Produto: {customer.product || "Não informado"}</span>
            <span>Contato: {customer.contact || "Não informado"}</span>
            <span>{customerTickets} chamado(s) • {machines.length} computador(es)</span>
          </div>}
          <div className="wmk-sd-stats">
            <span>{data.customers.length} clientes</span><span>{data.tickets.filter(t => t.status !== "resolvido").length} chamados abertos</span>
            <span>{data.machines.length} máquinas</span>
          </div>
          <p>Esta versão não sincroniza dados entre técnicos nem cria GLPI tickets automaticamente.</p>
        </aside>
        <section className="wmk-sd-main">
          {tab === "customers" && <div className="wmk-sd-form"><h3>Novo cliente</h3>
            <label>Nome / empresa <input value={name} maxLength={120} onChange={e => setName(e.target.value)}/></label>
            <label>Contato comercial <input value={contact} maxLength={120} onChange={e => setContact(e.target.value)}/></label>
            <label>Produto atendido <input value={product} maxLength={120} onChange={e => setProduct(e.target.value)} placeholder="Ex.: Sistema Comercial / NF-e"/></label>
            <button onClick={addCustomer}>Cadastrar cliente</button>
            <h3>Clientes cadastrados</h3>{data.customers.map(c => <button key={c.id} onClick={() => { setCustomerId(c.id); setTab("tickets"); }}>{c.name}</button>)}
          </div>}
          {tab === "machines" && <div className="wmk-sd-form"><h3>Computadores do cliente</h3>
            <label>Nome da máquina <input value={machineName} onChange={e => setMachineName(e.target.value)} placeholder="PC-FINANCEIRO-01"/></label>
            <label>Código do acesso remoto (opcional) <input value={machineCode} maxLength={6}
              onChange={e => setMachineCode(e.target.value.replace(/\D/g, ""))}/></label>
            <button onClick={addMachine} disabled={!customer}>Cadastrar computador</button>
            {machines.map(m => <div className="wmk-sd-row" key={m.id}><strong>{m.name}</strong><span>{m.remoteCode || "Sem código"}</span></div>)}
          </div>}
          {tab === "tickets" && <div className="wmk-sd-ticket-area">
            <div className="wmk-sd-tickets">
              <h3>Chamados</h3>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa, erro ou número..."/>
              {filteredTickets.map(t => <button key={t.id} className={ticket?.id === t.id ? "selected" : ""}
                onClick={() => { setTicketId(t.id); setCustomerId(t.customerId); }}>
                <strong>#{String(t.number).padStart(5, "0")} — {t.subject}</strong>
                <small>{data.customers.find(c => c.id === t.customerId)?.name} • {STATUS[t.status]}</small>
              </button>)}
              <h3>Abrir chamado</h3>
              <input placeholder="Assunto da falha" value={subject} maxLength={150} onChange={e => setSubject(e.target.value)}/>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {["Fiscal / NF-e", "Fiscal / NFC-e", "Sistema comercial", "Banco de dados", "Windows / Rede", "Atualização", "Outro"].map(c => <option key={c}>{c}</option>)}
              </select>
              <textarea rows={3} value={details} maxLength={3000} onChange={e => setDetails(e.target.value)}
                placeholder="Descreva o problema sem copiar dados fiscais sigilosos."/>
              <button disabled={!customer} onClick={addTicket}>Criar chamado</button>
            </div>
            <div className="wmk-sd-detail">
              {!ticket ? <p>Selecione ou crie um chamado. Cada atendimento terá status, linha do tempo e notas internas.</p> :
                <>
                  <h3>#{String(ticket.number).padStart(5, "0")} — {ticket.subject}</h3>
                  <p>{ticket.details || "Sem descrição inicial."}</p>
                  <div className="wmk-sd-fields">
                    <label>Estado <select value={ticket.status} onChange={e => { const v=e.target.value as TicketStatus;
                      updateTicket({ status: v }, "Estado alterado para: " + STATUS[v]); }}>
                      {Object.entries(STATUS).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select></label>
                    <label>Prioridade <select value={ticket.priority} onChange={e => updateTicket({ priority: e.target.value as Ticket["priority"] })}>
                      <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label>
                    <label>Computador <select value={ticket.machineId} onChange={e => updateTicket({ machineId: e.target.value })}>
                      <option value="">Não selecionado</option>{machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  </div>
                  <label>Solução documentada <textarea rows={3} value={ticket.resolution} maxLength={3000}
                    onChange={e => updateTicket({ resolution: e.target.value.slice(0, 3000) })}
                    placeholder="Causa confirmada, procedimento, teste e resultado..."/></label>
                  <h3>Linha do tempo</h3>
                  <div className="wmk-sd-events">{entries.map(e => <article key={e.id}>
                    <small>{new Date(e.at).toLocaleString("pt-BR")} • {e.kind}</small><p>{e.text}</p></article>)}</div>
                  <label>Nota interna <textarea rows={3} value={note} maxLength={3000} onChange={e => setNote(e.target.value)}
                    placeholder="Problema encontrado, análise, correção sugerida, encaminhamento..."/></label>
                  <button onClick={addNote}>Registrar nota</button>
                </>}
            </div>
          </div>}
        </section>
      </div>
      <footer className="wmk-sd-footer"><span role="status">{message}</span>
        <small>Uso individual experimental. Não armazenar senhas ou documentos fiscais completos. • Walney Moreira Klein — walneyk@hotmail.com</small></footer>
    </div>
  </div>;
}
