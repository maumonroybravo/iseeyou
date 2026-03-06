import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://ujxqcfnudmnfxylgqizc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqeHFjZm51ZG1uZnh5bGdxaXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA5ODksImV4cCI6MjA4ODMyNjk4OX0.NYlwb1SDKCbbux3hxDqrU3Y8zedqViuiob3TETS68ZM";

// Lightweight Supabase REST client (no external dependency)
const db = {
  from: (table) => ({
    select: async (cols = "*", opts = {}) => {
      let url = `${SUPABASE_URL}/rest/v1/${table}?select=${cols}`;
      if (opts.order) url += `&order=${opts.order}`;
      if (opts.eq) url += `&${opts.eq.col}=eq.${opts.eq.val}`;
      const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      return r.json();
    },
    insert: async (rows) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(rows),
      });
      return r.json();
    },
    update: async (data, eq) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${eq.col}=eq.${eq.val}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    delete: async (eq) => {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?${eq.col}=eq.${eq.val}`, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
    },
  }),
};

const STATUS_CONFIG = {
  "pending":     { label: "Pendiente",   color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  "in-progress": { label: "En progreso", color: "#F4A261", bg: "rgba(244,162,97,0.15)"  },
  "done":        { label: "Listo",       color: "#06D6A0", bg: "rgba(6,214,160,0.15)"   },
};
const PRIORITY_CONFIG = {
  "high":   { label: "Alta",  color: "#E84855", dot: "🔴" },
  "medium": { label: "Media", color: "#F4A261", dot: "🟡" },
  "low":    { label: "Baja",  color: "#06D6A0", dot: "🟢" },
};
const REPORT_SLOTS = [
  { key: "morning", label: "Inicio del día", icon: "🌅" },
  { key: "midday",  label: "Mitad del día",  icon: "☀️" },
  { key: "closing", label: "Cierre del día", icon: "🌙" },
];

export default function ISeYouApp() {
  const [screen, setScreen] = useState("home");
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeTab, setActiveTab] = useState("tasks");
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", deadline: "", comments: "" });
  const [newReport, setNewReport] = useState({ slot: "morning", text: "" });
  const [reminderInput, setReminderInput] = useState("");
  const [newReminders, setNewReminders] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const loadAll = useCallback(async () => {
    setLoading(true); setDbError(null);
    try {
      const [m, t, rem, rep] = await Promise.all([
        db.from("members").select("*", { order: "id" }),
        db.from("tasks").select("*", { order: "created_at" }),
        db.from("reminders").select("*", { order: "time" }),
        db.from("reports").select("*", { order: "created_at" }),
      ]);
      if (m.error || (Array.isArray(m) === false && m.message)) throw new Error(m.message || "Error de conexión");
      setMembers(Array.isArray(m) ? m : []);
      setTasks(Array.isArray(t) ? t : []);
      setReminders(Array.isArray(rem) ? rem : []);
      setReports(Array.isArray(rep) ? rep : []);
    } catch (e) {
      setDbError(e.message || "No se pudo conectar a Supabase");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const memberTasks = selectedMember ? tasks.filter(t => t.member_id === selectedMember.id) : [];
  const memberReports = selectedMember ? reports.filter(r => r.member_id === selectedMember.id) : [];
  const pendingCount = memberTasks.filter(t => t.status !== "done").length;
  const taskReminders = selectedTask ? reminders.filter(r => r.task_id === selectedTask.id) : [];

  const openProfile = (m) => { setSelectedMember(m); setActiveTab("tasks"); setScreen("profile"); };
  const openTask = (t) => { setSelectedTask(t); setScreen("task"); };
  const goHome = () => { setScreen("home"); setSelectedMember(null); setSelectedTask(null); };
  const goProfile = () => { setScreen("profile"); setSelectedTask(null); };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    const inserted = await db.from("tasks").insert([{
      member_id: selectedMember.id, title: newTask.title,
      priority: newTask.priority, deadline: newTask.deadline || null,
      comments: newTask.comments, status: "pending",
    }]);
    const created = Array.isArray(inserted) ? inserted[0] : null;
    if (created && newReminders.length > 0) {
      const rems = await db.from("reminders").insert(newReminders.map(t => ({ task_id: created.id, time: t })));
      setReminders(prev => [...prev, ...(Array.isArray(rems) ? rems : [])]);
    }
    if (created) setTasks(prev => [created, ...prev]);
    setNewTask({ title: "", priority: "medium", deadline: "", comments: "" });
    setNewReminders([]); setReminderInput(""); setShowNewTask(false);
    showToast("✅ Tarea creada. Recordatorio Espejo activado.");
  };

  const updateTaskStatus = async (taskId, status) => {
    await db.from("tasks").update({ status }, { col: "id", val: taskId });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, status }));
  };

  const updateTaskPriority = async (taskId, priority) => {
    await db.from("tasks").update({ priority }, { col: "id", val: taskId });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority } : t));
    if (selectedTask?.id === taskId) setSelectedTask(prev => ({ ...prev, priority }));
  };

  const deleteTask = async (taskId) => {
    await db.from("tasks").delete({ col: "id", val: taskId });
    setTasks(prev => prev.filter(t => t.id !== taskId));
    goProfile(); showToast("🗑️ Tarea eliminada");
  };

  const addReport = async () => {
    if (!newReport.text.trim()) return;
    const now = new Date();
    const inserted = await db.from("reports").insert([{
      member_id: selectedMember.id, slot: newReport.slot, text: newReport.text,
      date: now.toLocaleDateString("es-MX"),
      time: now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    }]);
    if (Array.isArray(inserted)) setReports(prev => [...inserted, ...prev]);
    setNewReport({ slot: "morning", text: "" }); setShowNewReport(false);
    showToast("📝 Reporte guardado");
  };

  const addReminder = () => {
    if (!reminderInput) return;
    setNewReminders(prev => [...prev, reminderInput]); setReminderInput("");
  };

  const s = {
    app: { minHeight: "100vh", background: "#0A0A0F", color: "#E8E8F0", fontFamily: "'DM Mono','Courier New',monospace" },
    header: { padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" },
    logo: { fontSize: "18px", fontWeight: "700", letterSpacing: "0.15em", color: "#FFF", textTransform: "uppercase" },
    accent: { color: "#3A86FF" },
    backBtn: { background: "none", border: "1px solid rgba(255,255,255,0.12)", color: "#9999AA", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    page: { padding: "24px" },
    greeting: { fontSize: "11px", color: "#555566", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "8px" },
    headline: { fontSize: "26px", fontWeight: "700", lineHeight: 1.2, marginBottom: "32px", color: "#FFF" },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" },
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "20px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", transition: "all 0.2s" },
    avatar: (c) => ({ width: "52px", height: "52px", borderRadius: "50%", background: `${c}22`, border: `2px solid ${c}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700", color: c }),
    badge: (n) => ({ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: n > 0 ? "rgba(58,134,255,0.15)" : "rgba(255,255,255,0.05)", color: n > 0 ? "#3A86FF" : "#444455", border: n > 0 ? "1px solid rgba(58,134,255,0.3)" : "1px solid rgba(255,255,255,0.05)" }),
    profHead: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px", paddingBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.07)" },
    profAvatar: (c) => ({ width: "60px", height: "60px", borderRadius: "50%", background: `${c}22`, border: `2px solid ${c}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "700", color: c }),
    tabs: { display: "flex", gap: "4px", marginBottom: "20px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "4px" },
    tab: (a) => ({ flex: 1, padding: "8px", textAlign: "center", fontSize: "11px", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", borderRadius: "7px", transition: "all 0.2s", background: a ? "rgba(58,134,255,0.2)" : "none", color: a ? "#3A86FF" : "#555566", border: a ? "1px solid rgba(58,134,255,0.3)" : "1px solid transparent" }),
    tCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "16px", marginBottom: "10px", cursor: "pointer", transition: "all 0.15s" },
    tTitle: { fontSize: "14px", fontWeight: "600", color: "#E8E8F0", marginBottom: "8px" },
    tMeta: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
    pill: (c, bg) => ({ fontSize: "10px", padding: "3px 8px", borderRadius: "20px", background: bg, color: c, fontWeight: "600" }),
    dl: { fontSize: "10px", color: "#555566", marginLeft: "auto" },
    addBtn: { width: "100%", padding: "14px", borderRadius: "10px", background: "rgba(58,134,255,0.1)", border: "1px dashed rgba(58,134,255,0.3)", color: "#3A86FF", fontSize: "13px", fontWeight: "600", cursor: "pointer", marginTop: "8px" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", zIndex: 100 },
    modal: { background: "#13131A", borderRadius: "20px 20px 0 0", padding: "24px", width: "100%", maxHeight: "85vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)" },
    mTitle: { fontSize: "16px", fontWeight: "700", marginBottom: "20px", color: "#FFF" },
    lbl: { fontSize: "10px", color: "#555566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px", display: "block" },
    inp: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 12px", color: "#E8E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "16px", fontFamily: "inherit" },
    tarea: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 12px", color: "#E8E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "16px", fontFamily: "inherit", resize: "none", minHeight: "70px" },
    sel: { width: "100%", background: "#13131A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 12px", color: "#E8E8F0", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "16px", fontFamily: "inherit" },
    rRow: { display: "flex", gap: "8px", marginBottom: "16px" },
    rTag: { background: "rgba(58,134,255,0.15)", border: "1px solid rgba(58,134,255,0.3)", color: "#3A86FF", padding: "4px 10px", borderRadius: "20px", fontSize: "11px", display: "inline-block", margin: "2px" },
    saveBtn: { width: "100%", padding: "14px", borderRadius: "10px", background: "#3A86FF", color: "#FFF", fontSize: "13px", fontWeight: "700", cursor: "pointer", border: "none" },
    cancelBtn: { width: "100%", padding: "12px", borderRadius: "10px", background: "none", color: "#555566", fontSize: "12px", cursor: "pointer", border: "none", marginTop: "8px" },
    sec: { marginBottom: "24px" },
    secLbl: { fontSize: "10px", color: "#555566", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "10px" },
    sRow: { display: "flex", gap: "8px" },
    sBtn: (a, c, bg) => ({ flex: 1, padding: "10px 4px", borderRadius: "8px", cursor: "pointer", background: a ? bg : "rgba(255,255,255,0.03)", border: a ? `1px solid ${c}44` : "1px solid rgba(255,255,255,0.06)", color: a ? c : "#444455", fontSize: "10px", fontWeight: "600", textAlign: "center", transition: "all 0.15s" }),
    delBtn: { width: "100%", padding: "12px", borderRadius: "10px", background: "rgba(232,72,85,0.1)", border: "1px solid rgba(232,72,85,0.2)", color: "#E84855", fontSize: "12px", fontWeight: "600", cursor: "pointer", marginTop: "8px" },
    mirror: { background: "rgba(58,134,255,0.06)", border: "1px solid rgba(58,134,255,0.15)", borderRadius: "10px", padding: "14px", marginBottom: "8px" },
    rCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "14px", marginBottom: "10px" },
    rSlot: { fontSize: "11px", color: "#3A86FF", letterSpacing: "0.1em", marginBottom: "6px" },
    rText: { fontSize: "13px", color: "#DDDDE8", lineHeight: 1.5 },
    rMeta: { fontSize: "10px", color: "#444455", marginTop: "6px" },
    toast: { position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: "#1E1E2E", border: "1px solid rgba(58,134,255,0.3)", color: "#E8E8F0", padding: "10px 20px", borderRadius: "100px", fontSize: "12px", zIndex: 200, whiteSpace: "nowrap" },
    divider: { height: "1px", background: "rgba(255,255,255,0.07)", margin: "20px 0" },
    empty: { textAlign: "center", color: "#333344", padding: "40px 0", fontSize: "13px" },
    center: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", flexDirection: "column", gap: "16px" },
  };

  if (loading) return (
    <div style={s.app}>
      <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
      <div style={s.center}>
        <div style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "0.15em", color: "#FFF" }}>i<span style={s.accent}>SEE</span>YOU</div>
        <div>{[0,.2,.4].map((d,i) => <span key={i} style={{ width:"8px",height:"8px",borderRadius:"50%",background:"#3A86FF",display:"inline-block",margin:"0 3px",animation:`pulse 1.2s ${d}s ease-in-out infinite` }} />)}</div>
        <div style={{ fontSize: "11px", color: "#333344", letterSpacing: "0.15em" }}>CONECTANDO...</div>
      </div>
    </div>
  );

  if (dbError) return (
    <div style={s.app}>
      <div style={s.center}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#FFF" }}>i<span style={s.accent}>SEE</span>YOU</div>
        <div style={{ fontSize: "13px", color: "#E84855", textAlign: "center", padding: "0 32px", lineHeight: 1.6 }}>⚠️ {dbError}</div>
        <div style={{ fontSize: "11px", color: "#555566", textAlign: "center", padding: "0 32px", lineHeight: 1.8 }}>
          Verifica que:<br/>
          1. Ejecutaste el SQL en Supabase<br/>
          2. RLS está desactivado<br/>
          3. Las tablas existen
        </div>
        <button onClick={loadAll} style={{ background: "#3A86FF", color: "#FFF", border: "none", padding: "12px 28px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700" }}>🔄 Reintentar</button>
      </div>
    </div>
  );

  return (
    <div style={s.app}>
      <style>{`* { box-sizing: border-box; }`}</style>

      <div style={s.header}>
        <div style={s.logo}>i<span style={s.accent}>SEE</span>YOU</div>
        {screen !== "home" && (
          <button style={s.backBtn} onClick={screen === "task" ? goProfile : goHome}>
            ← {screen === "task" ? selectedMember?.name : "Inicio"}
          </button>
        )}
      </div>

      {screen === "home" && (
        <div style={s.page}>
          <div style={s.greeting}>Panel del Manager</div>
          <div style={s.headline}>¿A quién<br/>revisamos hoy?</div>
          <div style={s.grid}>
            {members.map(m => {
              const count = tasks.filter(t => t.member_id === m.id && t.status !== "done").length;
              return (
                <div key={m.id} style={s.card} onClick={() => openProfile(m)}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                >
                  <div style={s.avatar(m.color)}>{m.avatar}</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#DDDDE8" }}>{m.name}</div>
                  <div style={s.badge(count)}>{count > 0 ? `${count} activa${count > 1 ? "s" : ""}` : "Sin tareas"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {screen === "profile" && selectedMember && (
        <div style={s.page}>
          <div style={s.profHead}>
            <div style={s.profAvatar(selectedMember.color)}>{selectedMember.avatar}</div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#FFF" }}>{selectedMember.name}</div>
              <div style={{ fontSize: "11px", color: "#555566", marginTop: "2px" }}>{pendingCount} tarea{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={s.tabs}>
            {["tasks","reports"].map(tab => (
              <div key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                {tab === "tasks" ? "📋 Tareas" : "📝 Reportes"}
              </div>
            ))}
          </div>
          {activeTab === "tasks" && (
            <>
              {memberTasks.length === 0 && <div style={s.empty}>Sin tareas asignadas</div>}
              {memberTasks.map(task => (
                <div key={task.id} style={s.tCard} onClick={() => openTask(task)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(58,134,255,0.3)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
                >
                  <div style={s.tTitle}>{task.title}</div>
                  <div style={s.tMeta}>
                    <span style={s.pill(STATUS_CONFIG[task.status].color, STATUS_CONFIG[task.status].bg)}>{STATUS_CONFIG[task.status].label}</span>
                    <span style={s.pill(PRIORITY_CONFIG[task.priority].color, `${PRIORITY_CONFIG[task.priority].color}18`)}>{PRIORITY_CONFIG[task.priority].dot} {PRIORITY_CONFIG[task.priority].label}</span>
                    {task.deadline && <span style={s.dl}>📅 {task.deadline}</span>}
                  </div>
                </div>
              ))}
              <button style={s.addBtn} onClick={() => setShowNewTask(true)}>+ Nueva tarea</button>
            </>
          )}
          {activeTab === "reports" && (
            <>
              {memberReports.length === 0 && <div style={s.empty}>Sin reportes aún</div>}
              {memberReports.map((r, i) => {
                const slot = REPORT_SLOTS.find(sl => sl.key === r.slot);
                return (
                  <div key={i} style={s.rCard}>
                    <div style={s.rSlot}>{slot?.icon} {slot?.label}</div>
                    <div style={s.rText}>{r.text}</div>
                    <div style={s.rMeta}>{r.date} · {r.time}</div>
                  </div>
                );
              })}
              <button style={s.addBtn} onClick={() => setShowNewReport(true)}>+ Nuevo reporte</button>
            </>
          )}
        </div>
      )}

      {screen === "task" && selectedTask && selectedMember && (
        <div style={s.page}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#FFF", marginBottom: "6px" }}>{selectedTask.title}</div>
          <div style={{ fontSize: "11px", color: "#555566", marginBottom: "24px" }}>Asignado a {selectedMember.name}</div>
          <div style={s.sec}>
            <div style={s.secLbl}>Estado</div>
            <div style={s.sRow}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} style={s.sBtn(selectedTask.status === key, cfg.color, cfg.bg)} onClick={() => updateTaskStatus(selectedTask.id, key)}>{cfg.label}</div>
              ))}
            </div>
          </div>
          <div style={s.sec}>
            <div style={s.secLbl}>Prioridad</div>
            <div style={s.sRow}>
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <div key={key} style={s.sBtn(selectedTask.priority === key, cfg.color, `${cfg.color}18`)} onClick={() => updateTaskPriority(selectedTask.id, key)}>{cfg.dot} {cfg.label}</div>
              ))}
            </div>
          </div>
          {selectedTask.deadline && (
            <div style={s.sec}>
              <div style={s.secLbl}>Fecha límite</div>
              <div style={{ fontSize: "15px", color: "#E8E8F0" }}>📅 {selectedTask.deadline}</div>
            </div>
          )}
          {selectedTask.comments && (
            <div style={s.sec}>
              <div style={s.secLbl}>Comentarios</div>
              <div style={{ fontSize: "13px", color: "#AAAABC", lineHeight: 1.6 }}>{selectedTask.comments}</div>
            </div>
          )}
          {taskReminders.length > 0 && (
            <div style={s.sec}>
              <div style={s.secLbl}>🔔 Recordatorio Espejo</div>
              {taskReminders.map((r, i) => (
                <div key={i} style={s.mirror}>
                  <div style={{ fontSize: "11px", color: "#3A86FF", marginBottom: "6px" }}>NOTIFICA A {selectedMember.name.toUpperCase()} + MANAGER</div>
                  <div style={{ fontSize: "13px", color: "#E8E8F0" }}>⏰ {r.time}</div>
                </div>
              ))}
            </div>
          )}
          <div style={s.divider} />
          <button style={s.delBtn} onClick={() => deleteTask(selectedTask.id)}>🗑️ Eliminar tarea</button>
        </div>
      )}

      {showNewTask && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setShowNewTask(false)}>
          <div style={s.modal}>
            <div style={s.mTitle}>Nueva tarea para {selectedMember?.name}</div>
            <label style={s.lbl}>Título *</label>
            <input style={s.inp} placeholder="Ej. Avance de Brochure" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
            <label style={s.lbl}>Prioridad</label>
            <select style={s.sel} value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}>
              <option value="high">🔴 Alta</option>
              <option value="medium">🟡 Media</option>
              <option value="low">🟢 Baja</option>
            </select>
            <label style={s.lbl}>Fecha límite</label>
            <input type="date" style={s.inp} value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} />
            <label style={s.lbl}>Comentarios</label>
            <textarea style={s.tarea} placeholder="Notas adicionales..." value={newTask.comments} onChange={e => setNewTask(p => ({ ...p, comments: e.target.value }))} />
            <label style={s.lbl}>🔔 Recordatorio Espejo</label>
            <div style={s.rRow}>
              <input type="time" style={{ ...s.inp, marginBottom: 0, flex: 1 }} value={reminderInput} onChange={e => setReminderInput(e.target.value)} />
              <button onClick={addReminder} style={{ background: "rgba(58,134,255,0.2)", border: "1px solid rgba(58,134,255,0.3)", color: "#3A86FF", padding: "10px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}>+ Agregar</button>
            </div>
            <div style={{ marginBottom: "16px" }}>{newReminders.map((r, i) => <span key={i} style={s.rTag}>⏰ {r}</span>)}</div>
            <button style={s.saveBtn} onClick={addTask}>Crear tarea</button>
            <button style={s.cancelBtn} onClick={() => setShowNewTask(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {showNewReport && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setShowNewReport(false)}>
          <div style={s.modal}>
            <div style={s.mTitle}>Reporte de {selectedMember?.name}</div>
            <label style={s.lbl}>Momento del día</label>
            <select style={s.sel} value={newReport.slot} onChange={e => setNewReport(p => ({ ...p, slot: e.target.value }))}>
              {REPORT_SLOTS.map(sl => <option key={sl.key} value={sl.key}>{sl.icon} {sl.label}</option>)}
            </select>
            <label style={s.lbl}>¿En qué estás avanzando? ({newReport.text.length}/140)</label>
            <textarea style={s.tarea} maxLength={140} placeholder="Describe tu avance..." value={newReport.text} onChange={e => setNewReport(p => ({ ...p, text: e.target.value }))} />
            <button style={s.saveBtn} onClick={addReport}>Guardar reporte</button>
            <button style={s.cancelBtn} onClick={() => setShowNewReport(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
