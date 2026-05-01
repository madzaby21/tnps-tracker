import React, { useState, useEffect } from "react";
import { db, collection, doc, setDoc, deleteDoc, onSnapshot, query } from "./firebase";
import "./styles.css";

interface Client {
  id: string;
  n: string;
  s: string[];
  st: string;
  tc: number;
  tp: number;
  b: number;
  lp: string;
  la: number;
  note: string;
  pr: string;
  act: string;
  pay: Payment[];
  lastEditedBy?: string;
  lastEditedAt?: string;
}

interface Payment {
  id: string;
  date: string;
  amount: number;
  method: string;
  note: string;
}

interface Dispute {
  id: string;
  n: string;
  stage: string;
  rd: string;
  out: number;
  bil: string;
  notes: string;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

interface NewClient {
  name: string;
  services: string[];
  totalOwed: number;
  totalPaid: number;
  status: string;
  priority: string;
  note: string;
  action: string;
  lastPayDate: string;
  lastPayAmt: number;
}

interface NewDispute {
  name: string;
  stage: string;
  rd: string;
  out: number;
  bil: string;
  notes: string;
}

const fmt = (n: number): string => "$" + Math.abs(Number(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUSES: string[] = ["Paid in Full", "Partial Payment", "Payment Pending", "No Payment", "Payment Unverified", "Pay After Completion", "Service Exchange", "Training Case", "Mentee — No Charge", "Escalated to Novita", "On Hold"];
const SC: Record<string, string> = { "Paid in Full": "#10B981", "Partial Payment": "#F59E0B", "Payment Pending": "#3B82F6", "No Payment": "#EF4444", "Payment Unverified": "#8B5CF6", "Pay After Completion": "#0891B2", "Service Exchange": "#6B7280", "Training Case": "#9CA3AF", "Mentee — No Charge": "#9CA3AF", "Escalated to Novita": "#DC2626", "On Hold": "#6B7280" };
const PRIORITIES: string[] = ["HIGH", "MED", "LOW", "PENDING", "VERIFY", "NO PAY", "PAID", "TRAINING", "EXCHANGE", "NONE"];
const PC: Record<string, string> = { "HIGH": "#DC2626", "MED": "#F59E0B", "LOW": "#6366F1", "PENDING": "#3B82F6", "VERIFY": "#8B5CF6", "NO PAY": "#6B7280", "PAID": "#10B981", "TRAINING": "#9CA3AF", "EXCHANGE": "#6B7280", "NONE": "#D1D5DB" };
const PRI_ORDER: Record<string, number> = { "HIGH": 0, "MED": 1, "LOW": 2, "PENDING": 3, "VERIFY": 4, "NO PAY": 5, "PAID": 6, "TRAINING": 7, "EXCHANGE": 8, "NONE": 9 };
const SERVICES: string[] = ["Credit Repair", "Tier 1 Growth", "Tier 2 Restoration", "Tier 3 Elite Rebuild", "Tax Preparation", "Business Funding", "Personal Funding", "Hybrid Funding", "Business Formation & Development", "Business Plan (Standard)", "Investor Ready Plan", "Business Entity Setup", "Trade Nation Purchase", "Tax Agent Member", "Bronze Mentorship", "Silver Mentorship", "Gold Mentorship", "Platinum Mentorship", "SWS Membership", "Other"];

const STAGES: string[] = [];
for (let i = 1; i <= 15; i++) { STAGES.push("Round " + i + " Ready", "Round " + i + " Sent"); }
STAGES.push("Completed", "On Hold", "CM Issue");

const BOPTS: string[] = ["Full Payment Received", "Partial Payment Received", "No Payment", "Payment Unverified", "Payment Pending", "Service Exchange", "Training Case", "Mentee — No Charge"];
const BCC: Record<string, string> = { "Full Payment Received": "#10B981", "Partial Payment Received": "#F59E0B", "No Payment": "#EF4444", "Payment Unverified": "#8B5CF6", "Payment Pending": "#3B82F6", "Service Exchange": "#6B7280", "Training Case": "#9CA3AF", "Mentee — No Charge": "#9CA3AF" };

function stgC(s: string): string { if (!s) return "#9CA3AF"; if (s.includes("Ready")) return "#F59E0B"; if (s.includes("Sent")) return "#3B82F6"; if (s === "Completed") return "#10B981"; return "#DC2626"; }

function daysPast(ds: string): number | null {
  if (!ds) return null;
  let d: Date;
  if (ds.includes("-")) {
    d = new Date(ds + "T00:00:00");
  } else {
    const p = ds.split("/");
    if (p.length < 3) return null;
    d = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  }
  if (isNaN(d.getTime())) return null;
  return Math.floor((new Date().getTime() - d.getTime()) / 864e5);
}

function dueCol(d: number | null): string { if (d === null) return "#9CA3AF"; if (d < 0) return "#3B82F6"; if (d <= 7) return "#10B981"; if (d <= 14) return "#F59E0B"; if (d <= 30) return "#F97316"; return "#DC2626"; }

function overdueTag(dp: number | null): React.ReactNode {
  if (dp === null || dp <= 0) return null;
  if (dp > 30) return (<span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "#FEE2E2", color: "#DC2626" }}>Overdue 30+ Days</span>);
  if (dp > 15) return (<span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "#FED7AA", color: "#C2410C" }}>Overdue 16-30 Days</span>);
  return (<span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "#FEF3C7", color: "#D97706" }}>Overdue 1-15 Days</span>);
}

function SvcPick({ sel, onChange }: { sel: string[]; onChange: (v: string[]) => void }) {
  const allOptions = [...SERVICES];
  sel.forEach(function (s) { if (!allOptions.includes(s)) { allOptions.unshift(s); } });
  function tog(s: string) {
    if (sel.includes(s)) { if (sel.length === 1) return; onChange(sel.filter((x) => x !== s)); }
    else { onChange([...sel, s]); }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {allOptions.map(function (s) {
        const on = sel.includes(s);
        const isOld = !SERVICES.includes(s);
        return (<button key={s} onClick={function () { tog(s); }} style={{ padding: "3px 7px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer", border: on ? (isOld ? "1px solid #DC2626" : "1px solid #6366F1") : "1px solid #D1D5DB", background: on ? (isOld ? "#FEE2E2" : "#EEF2FF") : "white", color: on ? (isOld ? "#DC2626" : "#6366F1") : "#6B7280" }}>{s}{isOld ? " ✕" : ""}</button>);
      })}
    </div>
  );
}

export default function App() {
  const [cList, setCList] = useState<Client[]>([]);
  const [dList, setDList] = useState<Dispute[]>([]);
  const [view, setView] = useState<string>("action");
  const [fl, setFl] = useState<string>("all");
  const [sr, setSr] = useState<string>("");
  const [eId, setEId] = useState<string | null>(null);
  const [pId, setPId] = useState<string | null>(null);
  const [np, setNp] = useState<Payment>({ id: "", date: new Date().toISOString().split("T")[0], amount: 0, method: "Fanbase", note: "" });
  const [nc, setNc] = useState<NewClient>({ name: "", services: ["Credit Repair"], totalOwed: 0, totalPaid: 0, status: "Partial Payment", priority: "MED", note: "", action: "", lastPayDate: "", lastPayAmt: 0 });
  const [dSr, setDSr] = useState<string>("");
  const [dFl, setDFl] = useState<string>("all");
  const [dEId, setDEId] = useState<string | null>(null);
  const [sAD, setSAD] = useState<boolean>(false);
  const [nd, setNd] = useState<NewDispute>({ name: "", stage: "Round 1 Ready", rd: "", out: 75, bil: "No Payment", notes: "" });
  const [userName, setUserName] = useState<string>("");
  const [showNamePrompt, setShowNamePrompt] = useState<boolean>(true);

  useEffect(function () {
    const saved = localStorage.getItem("tnps-user-name");
    if (saved) { setUserName(saved); setShowNamePrompt(false); }
  }, []);

  useEffect(function () {
    const unsubC = onSnapshot(query(collection(db, "clients")), function (snap) {
      const arr: Client[] = [];
      snap.forEach(function (d) { arr.push({ id: d.id, ...d.data() } as Client); });
      setCList(arr);
    });
    const unsubD = onSnapshot(query(collection(db, "disputes")), function (snap) {
      const arr: Dispute[] = [];
      snap.forEach(function (d) { arr.push({ id: d.id, ...d.data() } as Dispute); });
      setDList(arr);
    });
    return function () { unsubC(); unsubD(); };
  }, []);

  async function saveClient(c: Client) {
    await setDoc(doc(db, "clients", c.id), { ...c, lastEditedBy: userName, lastEditedAt: new Date().toLocaleString("en-US") });
  }
  async function removeClient(id: string) { if (window.confirm("Remove?")) { await deleteDoc(doc(db, "clients", id)); } }
  async function saveDispute(d: Dispute) {
    await setDoc(doc(db, "disputes", d.id), { ...d, lastEditedBy: userName, lastEditedAt: new Date().toLocaleString("en-US") });
  }
  async function removeDispute(id: string) { if (window.confirm("Remove?")) { await deleteDoc(doc(db, "disputes", id)); } }

  function ucField(id: string, f: string, v: any) {
    const c = cList.find(function (x) { return x.id === id; });
    if (c) { saveClient({ ...c, [f]: v }); }
  }
  function udField(id: string, f: string, v: any) {
    const d = dList.find(function (x) { return x.id === id; });
    if (d) { saveDispute({ ...d, [f]: v }); }
  }

  function addP(cid: string) {
    if (!np.amount) return;
    const c = cList.find(function (x) { return x.id === cid; });
    if (!c) return;
    const ps: Payment[] = [...(c.pay || []), { ...np, id: "p" + Date.now() }];
    const tp2 = Number(c.tp) + Number(np.amount);
    saveClient({ ...c, pay: ps, tp: tp2, b: Number(c.tc) - tp2, lp: np.date, la: Number(np.amount) });
    setNp({ id: "", date: new Date().toISOString().split("T")[0], amount: 0, method: "Fanbase", note: "" }); setPId(null);
  }
  function rmP(cid: string, pid: string) {
    if (!window.confirm("Remove payment?")) return;
    const c = cList.find(function (x) { return x.id === cid; });
    if (!c) return;
    const rm = (c.pay || []).find(function (p) { return p.id === pid; });
    const ps = (c.pay || []).filter(function (p) { return p.id !== pid; });
    const tp2 = Number(c.tp) - Number(rm ? rm.amount : 0);
    const last = ps[ps.length - 1];
    saveClient({ ...c, pay: ps, tp: tp2, b: Number(c.tc) - tp2, lp: last ? last.date : c.lp, la: last ? Number(last.amount) : c.la });
  }
  function addC() {
    if (!nc.name.trim()) return;
    const newC: Client = { id: "c" + Date.now(), n: nc.name, s: nc.services, st: nc.status, tc: nc.totalOwed, tp: nc.totalPaid, b: nc.totalOwed - nc.totalPaid, lp: nc.lastPayDate || "", la: nc.lastPayAmt || 0, note: nc.note, pr: nc.priority, act: nc.action, pay: [] };
    saveClient(newC);
    setNc({ name: "", services: ["Credit Repair"], totalOwed: 0, totalPaid: 0, status: "Partial Payment", priority: "MED", note: "", action: "", lastPayDate: "", lastPayAmt: 0 }); setView("all");
  }
  function addDis() {
    if (!nd.name.trim()) return;
    const newD: Dispute = { id: "d" + Date.now(), n: nd.name, stage: nd.stage, rd: nd.rd, out: nd.out, bil: nd.bil, notes: nd.notes };
    saveDispute(newD);
    setNd({ name: "", stage: "Round 1 Ready", rd: "", out: 75, bil: "No Payment", notes: "" }); setSAD(false);
  }

  const payable = cList.filter(function (c) { return !["Training Case", "Service Exchange", "Mentee — No Charge"].includes(c.st); });
  const tCh = payable.reduce(function (s, c) { return s + Number(c.tc || 0); }, 0);
  const tCo = payable.reduce(function (s, c) { return s + Number(c.tp || 0); }, 0);
  const tOu = tCh - tCo;
  const hi = cList.filter(function (c) { return c.pr === "HIGH"; });
  const me = cList.filter(function (c) { return c.pr === "MED"; });
  const lo = cList.filter(function (c) { return c.pr === "LOW"; });
  const pe = cList.filter(function (c) { return c.pr === "PENDING"; });

  const filt = cList.filter(function (c) {
    if (fl === "high") return c.pr === "HIGH"; if (fl === "med") return c.pr === "MED"; if (fl === "low") return c.pr === "LOW";
    if (fl === "pending") return c.pr === "PENDING"; if (fl === "nopay") return c.st === "No Payment";
    if (fl === "paid") return c.st === "Paid in Full"; if (fl === "partial") return c.st === "Partial Payment";
    if (fl === "training") return ["Training Case", "Service Exchange", "Mentee — No Charge"].includes(c.st);
    if (fl === "verify") return c.st === "Payment Unverified"; return true;
  }).filter(function (c) { return !sr || c.n.toLowerCase().includes(sr.toLowerCase()); });

  const sortedFilt = eId ? filt : [...filt].sort(function (a, b) {
    const pa = PRI_ORDER[a.pr] !== undefined ? PRI_ORDER[a.pr] : 9;
    const pb = PRI_ORDER[b.pr] !== undefined ? PRI_ORDER[b.pr] : 9;
    if (pa !== pb) return pa - pb;
    return Number(b.b || 0) - Number(a.b || 0);
  });

  function genR() {
    const d = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    let t = "AR REPORT — " + d + "\n\nBILLED: " + fmt(tCh) + "\nCOLLECTED: " + fmt(tCo) + "\nOUTSTANDING: " + fmt(tOu) + "\n\n";
    ([["HIGH", hi], ["MED", me], ["LOW", lo], ["PENDING", pe]] as [string, Client[]][]).forEach(function (x) { if (x[1].length) { t += x[0] + " (" + x[1].length + "):\n"; x[1].forEach(function (c) { t += "• " + c.n + " — " + c.s.join(", ") + " — " + fmt(c.b) + " — " + c.act + "\n"; }); t += "\n"; } });
    t += "ALL " + cList.length + " CLIENTS:\n"; cList.forEach(function (c) { t += "• " + c.n + " | " + c.s.join(", ") + " | " + fmt(c.tc) + " | " + fmt(c.tp) + " | " + fmt(c.b) + " | " + c.st + "\n"; });
    try { navigator.clipboard.writeText(t); alert("Copied! Paste and send to Novita."); } catch (e) { alert("Copy failed"); }
  }

  const IS = {
    i: { width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const },
    s: { width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" as const, background: "white" },
    l: { fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 3, display: "block" as const },
    c: { border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 14px", marginBottom: 8, background: "white" }
  };

  function tS(a: boolean): React.CSSProperties { return { padding: "8px 12px", border: "none", borderBottom: a ? "3px solid #6366F1" : "3px solid transparent", background: "none", fontWeight: a ? 700 : 500, fontSize: 12, color: a ? "#6366F1" : "#6B7280", cursor: "pointer" }; }
  function fSt(a: boolean): React.CSSProperties { return { padding: "4px 10px", borderRadius: 16, border: a ? "1px solid #6366F1" : "1px solid #E5E7EB", background: a ? "#EEF2FF" : "white", color: a ? "#6366F1" : "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }; }
  function sB(bg: string, col: string): React.CSSProperties { return { padding: "4px 10px", background: bg, color: col, border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer" }; }

  if (showNamePrompt) {
    return (
      <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", maxWidth: 400, margin: "100px auto", padding: "30px", textAlign: "center" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 20, margin: "0 auto 16px" }}>T</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>TNPS Tracker</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280" }}>Enter your name so we can track who makes changes</p>
        <input type="text" placeholder="Your name..." value={userName} onChange={(e) => setUserName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && userName.trim()) { localStorage.setItem("tnps-user-name", userName.trim()); setShowNamePrompt(false); } }} style={{ width: "100%", padding: "12px 16px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", textAlign: "center", marginBottom: 12 }} autoFocus />
        <button onClick={() => { if (userName.trim()) { localStorage.setItem("tnps-user-name", userName.trim()); setShowNamePrompt(false); } }} style={{ padding: "10px 30px", background: "#6366F1", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" }}>Continue</button>
      </div>
    );
  }

  function renderPayForm(cid: string) {
    return (
      <div style={{ marginTop: 8, padding: 10, background: "#F0FDF4", borderRadius: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <div><label style={IS.l}>Date</label><input type="date" value={np.date} onChange={(e) => setNp({ ...np, date: e.target.value })} style={IS.i} /></div>
          <div><label style={IS.l}>Amount</label><input type="number" value={np.amount || ""} onChange={(e) => setNp({ ...np, amount: parseFloat(e.target.value) || 0 })} style={IS.i} /></div>
          <div><label style={IS.l}>Method</label><select value={np.method} onChange={(e) => setNp({ ...np, method: e.target.value })} style={IS.s}>{["Fanbase", "Stripe", "Zelle", "Cash App", "Wire", "Check", "Cash", "Tax Refund", "SBTPG", "Direct to Boss", "Other"].map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label style={IS.l}>Note</label><input value={np.note} onChange={(e) => setNp({ ...np, note: e.target.value })} style={IS.i} /></div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button style={{ padding: "6px 14px", background: "#059669", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => addP(cid)}>Save</button>
          <button style={{ padding: "6px 14px", background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setPId(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  function renderPriBlock(list: Client[], label: string, color: string, bg: string) {
    if (list.length === 0) return null;
    return (
      <div>
        <p style={{ margin: "12px 0 8px", fontSize: 13, fontWeight: 700, color }}>{label} ({list.length})</p>
        {list.map((c) => (
          <div key={c.id} style={{ ...IS.c, borderLeft: "4px solid " + color }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div><p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{c.n}</p><p style={{ margin: "2px 0", fontSize: 11, color: "#6B7280" }}>{(c.s || []).join(" · ")}</p></div>
              <span style={{ fontSize: 16, fontWeight: 800, color }}>{fmt(c.b)}</span>
            </div>
            {c.note ? <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7280" }}>{c.note}</p> : null}
            {c.act ? <div style={{ marginTop: 6, padding: "4px 8px", background: bg, borderRadius: 4, fontSize: 11, fontWeight: 600, color }}>{c.act}</div> : null}
            {c.lastEditedBy ? <p style={{ margin: "4px 0 0", fontSize: 10, color: "#3B82F6" }}>Edited by {c.lastEditedBy} — {c.lastEditedAt}</p> : null}
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button style={sB("#F0FDF4", "#059669")} onClick={() => { setPId(c.id); setNp({ id: "", date: new Date().toISOString().split("T")[0], amount: 0, method: "Fanbase", note: "" }); }}>+ Payment</button>
              <button style={sB("#EEF2FF", "#6366F1")} onClick={() => { setView("all"); setEId(c.id); }}>Edit</button>
            </div>
            {pId === c.id ? renderPayForm(c.id) : null}
          </div>
        ))}
      </div>
    );
  }

  function renderClient(c: Client) {
    const isE = eId === c.id;
    return (
      <div key={c.id} style={{ ...IS.c, borderLeft: "4px solid " + (SC[c.st] || "#D1D5DB") }}>
        {isE ? (
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>Editing: {c.n}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Name</label><input value={c.n} onChange={(e) => ucField(c.id, "n", e.target.value)} style={IS.i} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Services</label><SvcPick sel={c.s || []} onChange={(v) => ucField(c.id, "s", v)} /></div>
              <div><label style={IS.l}>Charged</label><input type="number" value={c.tc || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; saveClient({ ...c, tc: v, b: v - Number(c.tp || 0) }); }} style={IS.i} /></div>
              <div><label style={IS.l}>Paid</label><input type="number" value={c.tp || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; saveClient({ ...c, tp: v, b: Number(c.tc || 0) - v }); }} style={IS.i} /></div>
              <div><label style={IS.l}>Status</label><select value={c.st} onChange={(e) => ucField(c.id, "st", e.target.value)} style={IS.s}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div><label style={IS.l}>Priority</label><select value={c.pr} onChange={(e) => ucField(c.id, "pr", e.target.value)} style={IS.s}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
              <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Notes</label><input value={c.note} onChange={(e) => ucField(c.id, "note", e.target.value)} style={IS.i} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Action</label><input value={c.act} onChange={(e) => ucField(c.id, "act", e.target.value)} style={IS.i} /></div>
            </div>
            <button style={{ marginTop: 8, padding: "6px 14px", background: "#6366F1", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setEId(null)}>Done</button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div><p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{c.n}</p><p style={{ margin: "2px 0", fontSize: 11, color: "#6B7280" }}>{(c.s || []).join(" · ")}</p></div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: (SC[c.st] || "#F3F4F6") + "18", color: SC[c.st] || "#6B7280" }}>{c.st}</span>
                {(c.pr && !["NONE", "PAID", "TRAINING", "EXCHANGE"].includes(c.pr)) ? <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: PC[c.pr], marginTop: 2 }}>{c.pr}</span> : null}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
              <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Charged</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fmt(c.tc)}</p></div>
              <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Paid</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmt(c.tp)}</p></div>
              <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Balance</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: c.b > 0 ? "#DC2626" : "#059669" }}>{fmt(c.b)}</p></div>
            </div>
            {c.lp ? <p style={{ margin: "4px 0 0", fontSize: 10, color: "#9CA3AF" }}>Last: {c.lp} — {fmt(c.la)}</p> : null}
            {c.note ? <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7280" }}>{c.note}</p> : null}
            {c.act ? <div style={{ marginTop: 4, padding: "3px 6px", background: "#F3F4F6", borderRadius: 4, fontSize: 10, fontWeight: 600, color: "#374151" }}>{c.act}</div> : null}
            {c.lastEditedBy ? <p style={{ margin: "4px 0 0", fontSize: 10, color: "#3B82F6" }}>Edited by {c.lastEditedBy} — {c.lastEditedAt}</p> : null}
            {(c.pay && c.pay.length > 0) ? (
              <div style={{ marginTop: 6, padding: "4px 6px", background: "#F9FAFB", borderRadius: 4 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#6B7280" }}>Payments</p>
                {c.pay.map((p) => (<div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, padding: "2px 0" }}><span>{p.date} — {p.method}{p.note ? " — " + p.note : ""}</span><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontWeight: 600, color: "#059669" }}>+{fmt(p.amount)}</span><button onClick={() => rmP(c.id, p.id)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>✕</button></div></div>))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button style={sB("#EEF2FF", "#6366F1")} onClick={() => setEId(c.id)}>Edit</button>
              <button style={sB("#F0FDF4", "#059669")} onClick={() => { setPId(c.id); setNp({ id: "", date: new Date().toISOString().split("T")[0], amount: 0, method: "Fanbase", note: "" }); }}>+ Payment</button>
              <button style={sB("#FEF2F2", "#DC2626")} onClick={() => removeClient(c.id)}>Remove</button>
            </div>
            {pId === c.id ? renderPayForm(c.id) : null}
          </div>
        )}
      </div>
    );
  }

  function renderDisputes() {
    const fd = dList.filter((d) => {
      if (dFl === "ready") return d.stage.includes("Ready");
      if (dFl === "sent") return d.stage.includes("Sent");
      if (dFl === "overdue") { const dp = daysPast(d.rd); return dp !== null && dp > 0; }
      if (dFl === "overdue30") { const dp = daysPast(d.rd); return dp !== null && dp > 30; }
      if (dFl === "completed") return d.stage === "Completed";
      if (dFl === "cm") return d.stage === "CM Issue";
      return true;
    }).filter((d) => !dSr || d.n.toLowerCase().includes(dSr.toLowerCase()));

    const sortedFd = dEId ? fd : [...fd].sort((a, b) => {
      const da = daysPast(a.rd);
      const db2 = daysPast(b.rd);
      const oa = da !== null && da > 0 ? da : -1;
      const ob = db2 !== null && db2 > 0 ? db2 : -1;
      if (oa > 0 && ob <= 0) return -1;
      if (ob > 0 && oa <= 0) return 1;
      return ob - oa;
    });
    const rc = dList.filter((d) => d.stage.includes("Ready")).length;
    const sc2 = dList.filter((d) => d.stage.includes("Sent")).length;
    const oc = dList.filter((d) => { const dp = daysPast(d.rd); return dp !== null && dp > 0; }).length;
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
          <div style={{ background: "#FEF3C7", borderRadius: 8, padding: 10, textAlign: "center" }}><p style={{ margin: 0, fontSize: 10, color: "#92400E" }}>Ready</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#D97706" }}>{rc}</p></div>
          <div style={{ background: "#DBEAFE", borderRadius: 8, padding: 10, textAlign: "center" }}><p style={{ margin: 0, fontSize: 10, color: "#1E40AF" }}>Sent</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2563EB" }}>{sc2}</p></div>
          <div style={{ background: "#FEE2E2", borderRadius: 8, padding: 10, textAlign: "center" }}><p style={{ margin: 0, fontSize: 10, color: "#991B1B" }}>Overdue</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{oc}</p></div>
          <div style={{ background: "#F3F4F6", borderRadius: 8, padding: 10, textAlign: "center" }}><p style={{ margin: 0, fontSize: 10 }}>Total</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{dList.length}</p></div>
        </div>
        <input type="text" placeholder="Search..." value={dSr} onChange={(e) => setDSr(e.target.value)} style={{ ...IS.i, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {([["all", "All"], ["ready", "Ready"], ["sent", "Sent"], ["overdue", "All Overdue"], ["overdue30", "Overdue 30+"], ["cm", "CM Issue"], ["completed", "Done"]] as [string, string][]).map((x) => <button key={x[0]} style={fSt(dFl === x[0])} onClick={() => setDFl(x[0])}>{x[1]}</button>)}
        </div>
        <button style={{ marginBottom: 10, padding: "8px 16px", background: "#6366F1", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setSAD(true)}>+ Add Dispute Client</button>
        {sAD ? (
          <div style={{ ...IS.c, borderLeft: "4px solid #6366F1", marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Name</label><input value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} style={IS.i} /></div>
              <div><label style={IS.l}>Stage</label><select value={nd.stage} onChange={(e) => setNd({ ...nd, stage: e.target.value })} style={IS.s}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div><label style={IS.l}>Refresh Date</label><input type="date" value={nd.rd} onChange={(e) => setNd({ ...nd, rd: e.target.value })} style={IS.i} /></div>
              <div><label style={IS.l}>Onboarding %</label><input type="number" value={nd.out} onChange={(e) => setNd({ ...nd, out: parseInt(e.target.value) || 0 })} style={IS.i} /></div>
              <div><label style={IS.l}>Billing</label><select value={nd.bil} onChange={(e) => setNd({ ...nd, bil: e.target.value })} style={IS.s}>{BOPTS.map((b) => <option key={b}>{b}</option>)}</select></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button style={{ padding: "6px 14px", background: "#6366F1", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={addDis}>Add</button>
              <button style={{ padding: "6px 14px", background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setSAD(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {sortedFd.map((d) => {
          const dp = daysPast(d.rd); const dc2 = dueCol(dp); const sc3 = stgC(d.stage); const bc2 = BCC[d.bil] || "#6B7280"; const isE = dEId === d.id;
          return (
            <div key={d.id} style={{ ...IS.c, borderLeft: "4px solid " + sc3 }}>
              {isE ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Name</label><input value={d.n} onChange={(e) => udField(d.id, "n", e.target.value)} style={IS.i} /></div>
                    <div><label style={IS.l}>Stage</label><select value={d.stage} onChange={(e) => udField(d.id, "stage", e.target.value)} style={IS.s}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
                    <div><label style={IS.l}>Refresh Date</label><input type="date" value={d.rd} onChange={(e) => udField(d.id, "rd", e.target.value)} style={IS.i} /></div>
                    <div><label style={IS.l}>Onboarding %</label><input type="number" value={d.out} onChange={(e) => udField(d.id, "out", parseInt(e.target.value) || 0)} style={IS.i} /></div>
                    <div><label style={IS.l}>Billing</label><select value={d.bil} onChange={(e) => udField(d.id, "bil", e.target.value)} style={IS.s}>{BOPTS.map((b) => <option key={b}>{b}</option>)}</select></div>
                    <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Notes</label><input value={d.notes} onChange={(e) => udField(d.id, "notes", e.target.value)} style={IS.i} /></div>
                  </div>
                  <button style={{ marginTop: 8, padding: "6px 14px", background: "#6366F1", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }} onClick={() => setDEId(null)}>Done</button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{d.n}</p>
                      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: sc3 + "18", color: sc3 }}>{d.stage}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: bc2 + "18", color: bc2 }}>{d.bil}</span>
                        {overdueTag(dp)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Onboarding</p>
                      <div style={{ width: 50, height: 6, borderRadius: 3, background: "#E5E7EB", marginTop: 2 }}><div style={{ width: d.out + "%", height: "100%", borderRadius: 3, background: d.out > 75 ? "#EF4444" : d.out > 50 ? "#F59E0B" : "#10B981" }} /></div>
                      <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 700, color: d.out > 75 ? "#EF4444" : d.out > 50 ? "#F59E0B" : "#10B981" }}>{d.out}%</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    {d.rd ? <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Refresh</p><p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{d.rd}</p></div> : null}
                    {dp !== null ? <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Days</p><p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: dc2 }}>{dp < 0 ? "In " + Math.abs(dp) + "d" : dp === 0 ? "Today" : dp + "d ago"}</p></div> : null}
                  </div>
                  {d.notes ? <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6B7280" }}>{d.notes}</p> : null}
                  {d.lastEditedBy ? <p style={{ margin: "4px 0 0", fontSize: 10, color: "#3B82F6" }}>Edited by {d.lastEditedBy} — {d.lastEditedAt}</p> : null}
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button style={sB("#EEF2FF", "#6366F1")} onClick={() => setDEId(d.id)}>Edit</button>
                    <button style={sB("#FEF2F2", "#DC2626")} onClick={() => removeDispute(d.id)}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderRevenue() {
    const m: Record<string, { l: string; cnt: number; b: number; co: number }> = {};
    cList.forEach((c) => { const k = (c.s || []).sort().join(" + ") || "Unknown"; if (!m[k]) m[k] = { l: k, cnt: 0, b: 0, co: 0 }; m[k].cnt++; m[k].b += Number(c.tc || 0); m[k].co += Number(c.tp || 0); });
    const rows = Object.values(m).sort((a, b) => b.b - a.b);
    const tB = rows.reduce((s, r) => s + r.b, 0); const tC2 = rows.reduce((s, r) => s + r.co, 0);
    return (
      <div>
        <div style={{ ...IS.c, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "white", border: "none" }}>
          <p style={{ margin: 0, fontSize: 12, opacity: .85 }}>Revenue by Service</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><p style={{ margin: 0, fontSize: 10, opacity: .8 }}>Billed</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{fmt(tB)}</p></div>
            <div><p style={{ margin: 0, fontSize: 10, opacity: .8 }}>Collected</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{fmt(tC2)}</p></div>
            <div><p style={{ margin: 0, fontSize: 10, opacity: .8 }}>Outstanding</p><p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{fmt(tB - tC2)}</p></div>
          </div>
        </div>
        {rows.map((r, i) => {
          const o = r.b - r.co; const pct = r.b ? Math.round(r.co / r.b * 100) : 0; const bc = pct === 100 ? "#10B981" : pct >= 75 ? "#3B82F6" : pct >= 50 ? "#F59E0B" : "#EF4444";
          return (
            <div key={i} style={{ ...IS.c, borderLeft: "4px solid " + bc }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div><p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{r.l}</p><p style={{ margin: "2px 0", fontSize: 11, color: "#6B7280" }}>{r.cnt} client{r.cnt !== 1 ? "s" : ""}</p></div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: pct === 100 ? "#ECFDF5" : pct >= 50 ? "#FEF3C7" : "#FEE2E2", color: pct === 100 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626" }}>{pct}%</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Billed</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fmt(r.b)}</p></div>
                <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Collected</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmt(r.co)}</p></div>
                <div><p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>Outstanding</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: o > 0 ? "#DC2626" : "#059669" }}>{fmt(o)}</p></div>
              </div>
              <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: "#E5E7EB" }}><div style={{ width: pct + "%", height: "100%", borderRadius: 3, background: bc }} /></div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", maxWidth: 750, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 14 }}>AR</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Client Payment Master Tracker</h1>
          <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>TNPS — {cList.length} Clients — {fmt(tOu)} Outstanding</p>
          <p style={{ margin: 0, fontSize: 10, color: "#6366F1" }}>Logged in as: {userName}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)", borderRadius: 10, padding: "12px", color: "white" }}><p style={{ margin: 0, fontSize: 10, opacity: .85 }}>Billed</p><p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800 }}>{fmt(tCh)}</p></div>
        <div style={{ background: "linear-gradient(135deg,#059669,#10B981)", borderRadius: 10, padding: "12px", color: "white" }}><p style={{ margin: 0, fontSize: 10, opacity: .85 }}>Collected</p><p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800 }}>{fmt(tCo)}</p></div>
        <div style={{ background: tOu > 0 ? "linear-gradient(135deg,#DC2626,#EF4444)" : "linear-gradient(135deg,#059669,#10B981)", borderRadius: 10, padding: "12px", color: "white" }}><p style={{ margin: 0, fontSize: 10, opacity: .85 }}>Outstanding</p><p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800 }}>{fmt(tOu)}</p></div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 16, background: "#FEE2E2", color: "#DC2626", fontWeight: 600 }}>{hi.length} High</span>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 16, background: "#FEF3C7", color: "#D97706", fontWeight: 600 }}>{me.length} Med</span>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 16, background: "#EEF2FF", color: "#6366F1", fontWeight: 600 }}>{lo.length} Low</span>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 16, background: "#DBEAFE", color: "#2563EB", fontWeight: 600 }}>{pe.length} Pending</span>
        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 16, background: "#F0FDF4", color: "#059669", fontWeight: 600 }}>{cList.filter((c) => c.st === "Paid in Full").length} Paid</span>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", marginBottom: 12, overflowX: "auto" }}>
        {([["action", "Action"], ["all", "Clients"], ["disputes", "Disputes"], ["revenue", "By Service"], ["add", "+ Add"], ["report", "Report"]] as [string, string][]).map((x) => <button key={x[0]} style={tS(view === x[0])} onClick={() => setView(x[0])}>{x[1]}</button>)}
      </div>

      {view === "action" ? (
        <div>
          {renderPriBlock(hi, "HIGH PRIORITY — Collect Now", "#DC2626", "#FEF2F2")}
          {renderPriBlock(me, "MEDIUM — Follow Up", "#D97706", "#FEF3C7")}
          {renderPriBlock(lo, "LOW PRIORITY", "#6366F1", "#EEF2FF")}
          {renderPriBlock(pe, "PENDING — Tax / Pay After", "#2563EB", "#DBEAFE")}
          {cList.length === 0 ? <p style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>No clients yet — tap "+ Add" to get started</p> : null}
        </div>
      ) : null}

      {view === "all" ? (
        <div>
          <input type="text" placeholder="Search..." value={sr} onChange={(e) => setSr(e.target.value)} style={{ ...IS.i, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {([["all", "All"], ["high", "High"], ["med", "Med"], ["low", "Low"], ["partial", "Partial"], ["pending", "Pending"], ["nopay", "No Pay"], ["paid", "Paid"], ["training", "Training"], ["verify", "Unverified"]] as [string, string][]).map((x) => <button key={x[0]} style={fSt(fl === x[0])} onClick={() => setFl(x[0])}>{x[1]}</button>)}
          </div>
          {sortedFilt.map((c) => renderClient(c))}
        </div>
      ) : null}

      {view === "disputes" ? renderDisputes() : null}
      {view === "revenue" ? renderRevenue() : null}

      {view === "add" ? (
        <div style={IS.c}>
          <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>Add New Client</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Name *</label><input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} style={IS.i} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Services</label><SvcPick sel={nc.services} onChange={(v) => setNc({ ...nc, services: v })} /></div>
            <div><label style={IS.l}>Charged</label><input type="number" value={nc.totalOwed || ""} onChange={(e) => setNc({ ...nc, totalOwed: parseFloat(e.target.value) || 0 })} style={IS.i} /></div>
            <div><label style={IS.l}>Paid</label><input type="number" value={nc.totalPaid || ""} onChange={(e) => setNc({ ...nc, totalPaid: parseFloat(e.target.value) || 0 })} style={IS.i} /></div>
            <div><label style={IS.l}>Status</label><select value={nc.status} onChange={(e) => setNc({ ...nc, status: e.target.value })} style={IS.s}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label style={IS.l}>Priority</label><select value={nc.priority} onChange={(e) => setNc({ ...nc, priority: e.target.value })} style={IS.s}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Notes</label><input value={nc.note} onChange={(e) => setNc({ ...nc, note: e.target.value })} style={IS.i} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={IS.l}>Action</label><input value={nc.action} onChange={(e) => setNc({ ...nc, action: e.target.value })} style={IS.i} /></div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button style={{ padding: "8px 16px", background: "#6366F1", color: "white", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={addC}>Add Client</button>
            <button style={{ padding: "8px 16px", background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setView("action")}>Cancel</button>
          </div>
        </div>
      ) : null}

      {view === "report" ? (
        <div style={IS.c}>
          <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>AR Report for Novita</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div><p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>Billed</p><p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{fmt(tCh)}</p></div>
            <div><p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>Collected</p><p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#059669" }}>{fmt(tCo)}</p></div>
            <div><p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>Outstanding</p><p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{fmt(tOu)}</p></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 8, borderRadius: 4, background: "#E5E7EB" }}><div style={{ width: (tCh ? Math.round(tCo / tCh * 100) : 0) + "%", height: "100%", borderRadius: 4, background: "#10B981" }} /></div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7280" }}>{tCh ? Math.round(tCo / tCh * 100) : 0}% collected</p>
          </div>
          <button style={{ padding: "10px 20px", background: "#6366F1", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%" }} onClick={genR}>Copy AR Report to Clipboard</button>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>Paste and send to Novita</p>
        </div>
      ) : null}

      <div style={{ marginTop: 20, padding: 10, background: "#F9FAFB", borderRadius: 8, fontSize: 10, color: "#9CA3AF", textAlign: "center" }}>
        {cList.length} clients + {dList.length} disputes. Real-time sync — changes appear instantly for everyone.
      </div>

      <div id="page-bottom" />

      <div style={{ position: "fixed", bottom: 80, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 999 }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ width: 40, height: 40, borderRadius: 20, background: "#6366F1", color: "white", border: "none", fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
        <button onClick={() => { const el = document.getElementById("page-bottom"); if (el) el.scrollIntoView({ behavior: "smooth" }); }} style={{ width: 40, height: 40, borderRadius: 20, background: "#6366F1", color: "white", border: "none", fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>↓</button>
      </div>
    </div>
  );
}
