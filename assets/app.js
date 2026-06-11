const DATA = window.APP_DATA;
normalizeData();
const LS_KEY = "teoria_musical_local_app_v1";
let state = loadState();
let currentView = "home";
let quizResults = null;
let activeTheoryId = initialTheoryId();

function normalizeData() {
  if (!DATA.modules) {
    DATA.modules = [{
      id: "armonia-funcional-i",
      title: "Armonía Funcional I",
      subtitle: "Escalas, intervalos, acordes, enlace, tonalidad y rearmonización.",
      theory: DATA.theory || [],
      quiz: DATA.quiz || []
    }];
  }
}
function activeModule() {
  return DATA.modules.find(module => module.id === state.moduleId) || DATA.modules[0];
}
function moduleTheory() { return activeModule()?.theory || []; }
function moduleQuiz() { return activeModule()?.quiz || []; }
function defaultState() {
  return {
    moduleId: DATA.modules?.[0]?.id || "armonia-funcional-i",
    studied: {},
    quiz: {
      active: false,
      submitted: false,
      startedAt: null,
      submittedAt: null,
      student: { name: "", course: "", date: "" },
      answers: {},
      focusWarnings: 0,
      result: null
    }
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const loaded = Object.assign(defaultState(), JSON.parse(raw));
    if (!DATA.modules.some(module => module.id === loaded.moduleId)) {
      loaded.moduleId = DATA.modules[0]?.id || defaultState().moduleId;
      loaded.quiz = defaultState().quiz;
    }
    return loaded;
  } catch (e) { return defaultState(); }
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function $(id) { return document.getElementById(id); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[º°]/g, "")
    .replace(/[.,;:()\[\]{}¿?¡!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function compactSymbol(value) {
  return String(value || "").trim().replace(/\s+/g, "").replace(/º/g,"°");
}
function answerMatches(value, accepted) {
  const vRaw = String(value || "").trim();
  const aRaw = String(accepted || "").trim();
  if (!vRaw) return false;
  if (/\d/.test(aRaw) || /[+#b°]/.test(aRaw)) {
    return compactSymbol(vRaw) === compactSymbol(aRaw);
  }
  return normalizeText(vRaw).includes(normalizeText(aRaw));
}
function groupHit(value, group) {
  const text = normalizeText(value);
  return group.some(term => {
    if (/\d/.test(term) || /[+#b°]/.test(term)) return answerMatches(value, term);
    return text.includes(normalizeText(term));
  });
}
function termHit(value, term) {
  return groupHit(value, [term]);
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function percent(n) { return Math.round(n * 100); }
function initialTheoryId() {
  const hashId = decodeURIComponent(location.hash || "").replace(/^#topic-/, "");
  return moduleTheory().some(section => section.id === hashId) ? hashId : moduleTheory()[0]?.id;
}

function init() {
  renderModules();
  renderHome();
  renderTheory();
  updateProgress();
  hydrateStudentFields();
  wireEvents();
  if (state.quiz.active && !state.quiz.submitted) {
    showView("quiz");
    renderQuiz();
    applyQuizLock(true);
  } else if (state.quiz.submitted && state.quiz.result) {
    showView("quiz");
    renderQuizResult(state.quiz.result);
  } else {
    showView("home");
  }
}
function wireEvents() {
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (state.quiz.active && !state.quiz.submitted && view !== "quiz") {
        alert("El cuestionario está activo. Debe entregarse antes de volver al módulo teórico.");
        showView("quiz");
        return;
      }
      showView(view);
    });
  });
  $("startQuizBtn").addEventListener("click", startQuiz);
  $("startQuizBtn2").addEventListener("click", () => showView("quiz"));
  $("goTheoryBtn").addEventListener("click", () => showView("theory"));
  $("submitQuizBtn").addEventListener("click", submitQuiz);
  $("printResultBtn").addEventListener("click", () => window.print());
  $("downloadCsvBtn").addEventListener("click", downloadCSV);
  $("newAttemptBtn").addEventListener("click", newAttempt);
  $("resetStudyBtn").addEventListener("click", resetStudy);
  ["studentName","studentCourse","studentDate"].forEach(id => {
    $(id).addEventListener("input", updateStudentMeta);
  });
  window.addEventListener("beforeunload", (e) => {
    if (state.quiz.active && !state.quiz.submitted) {
      e.preventDefault(); e.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.quiz.active && !state.quiz.submitted) {
      state.quiz.focusWarnings = (state.quiz.focusWarnings || 0) + 1;
      saveState();
      setText("focusWarnings", state.quiz.focusWarnings);
    }
  });
  history.pushState({app:true}, "");
  window.addEventListener("popstate", () => {
    if (state.quiz.active && !state.quiz.submitted) {
      history.pushState({app:true}, "");
      showView("quiz");
      alert("Navegación bloqueada durante el cuestionario.");
    }
  });
}
function showView(view) {
  if (state.quiz.active && !state.quiz.submitted && view !== "quiz") view = "quiz";
  currentView = view;
  ["homeView","theoryView","quizView"].forEach(id => $(id).classList.add("hidden"));
  $(`${view}View`).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  if (view === "quiz") renderQuiz();
  window.scrollTo({top: 0, behavior: "smooth"});
}
function applyQuizLock(on) {
  document.body.classList.toggle("quiz-lock", !!on);
  $("lockBanner").classList.toggle("hidden", !on);
}
function renderHome() {
  const module = activeModule();
  setText("topicCount", moduleTheory().length);
  setText("questionCount", moduleQuiz().length);
  setText("autoGrade", "0–5.0");
  setText("sourceCount", String(module.sourceCount || 1));
  setText("moduleIntro", module.subtitle || "Lectura guiada y cuestionario autocorregible con nota final de 0 a 5.0.");
}
function renderModules() {
  const wrap = $("moduleTabs");
  if (!wrap) return;
  wrap.innerHTML = DATA.modules.map(module => {
    const active = module.id === state.moduleId;
    return `<button class="module-tab ${active ? "active" : ""}" data-module="${escapeAttr(module.id)}" type="button">
      <em>${escapeHtml(module.level || "Módulo")}</em>
      <span>${escapeHtml(module.title)}</span>
      <small>${module.theory.length} temas · ${module.quiz.length} preguntas</small>
    </button>`;
  }).join("");
  wrap.querySelectorAll("[data-module]").forEach(btn => {
    btn.addEventListener("click", () => selectModule(btn.dataset.module));
  });
}
function selectModule(id) {
  if (state.quiz.active && !state.quiz.submitted) {
    alert("Debe entregar el cuestionario activo antes de cambiar de módulo.");
    showView("quiz");
    return;
  }
  if (!DATA.modules.some(module => module.id === id) || state.moduleId === id) return;
  state.moduleId = id;
  state.quiz = defaultState().quiz;
  activeTheoryId = moduleTheory()[0]?.id;
  history.replaceState(history.state, "", location.pathname);
  saveState();
  renderModules();
  renderHome();
  renderTheory();
  hydrateStudentFields();
  showView("home");
}
function renderTheory() {
  const wrap = $("topicGrid");
  wrap.innerHTML = moduleTheory().map(section => {
    const learned = !!state.studied[section.id];
    const active = section.id === activeTheoryId;
    return `<button class="topic-link ${learned ? "done" : ""} ${active ? "active" : ""}" data-topic-select="${escapeAttr(section.id)}" type="button">
      <span class="topic-link-number">${escapeHtml(section.title.split(".")[0])}</span>
      <span>
        <b>${escapeHtml(section.title.replace(/^\d+\.\s*/, ""))}</b>
        <small>${section.items.length} conceptos · ${learned ? "estudiado" : "pendiente"}</small>
      </span>
    </button>`;
  }).join("");
  renderTheoryDetail();
  wrap.querySelectorAll("[data-topic-select]").forEach(btn => {
    btn.addEventListener("click", () => selectTheoryTopic(btn.dataset.topicSelect));
  });
  document.querySelectorAll("[data-study]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.studied[btn.dataset.study] = !state.studied[btn.dataset.study];
      saveState(); renderTheory(); updateProgress();
    });
  });
  document.querySelectorAll("[data-topic-step]").forEach(btn => {
    btn.addEventListener("click", () => selectTheoryStep(Number(btn.dataset.topicStep)));
  });
}
function selectTheoryTopic(id) {
  if (!moduleTheory().some(section => section.id === id)) return;
  activeTheoryId = id;
  history.replaceState(history.state, "", `#topic-${id}`);
  renderTheory();
  $("theoryDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function selectTheoryStep(delta) {
  const theory = moduleTheory();
  const index = theory.findIndex(section => section.id === activeTheoryId);
  const next = theory[index + delta];
  if (next) selectTheoryTopic(next.id);
}
function renderTheoryDetail() {
  const wrap = $("theoryDetail");
  const theory = moduleTheory();
  const index = Math.max(0, theory.findIndex(section => section.id === activeTheoryId));
  const section = theory[index] || theory[0];
  if (!section) {
    wrap.innerHTML = "";
    return;
  }
  const prev = theory[index - 1];
  const next = theory[index + 1];
  wrap.innerHTML = `
    <article class="theory-section panel" id="topic-${escapeAttr(section.id)}">
      <header class="theory-section-head">
        <div>
          <p class="kicker">${section.items.length} conceptos</p>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.subtitle)}</p>
        </div>
        <span class="study-badge ${state.studied[section.id] ? "done" : ""}">${state.studied[section.id] ? "Estudiado" : "Pendiente"}</span>
      </header>
      <div class="concept-list">
        ${section.items.map(item => `<section class="concept-item">
          <h4>${escapeHtml(item.term)}</h4>
          ${renderConceptBody(item.body)}
        </section>`).join("")}
      </div>
      <footer class="theory-actions">
        <button class="ghost-btn" data-topic-step="-1" ${prev ? "" : "disabled"}>Tema anterior</button>
        <button class="soft-btn study-toggle" data-study="${section.id}">${state.studied[section.id] ? "Marcar como pendiente" : "Marcar tema como estudiado"}</button>
        <button class="ghost-btn" data-topic-step="1" ${next ? "" : "disabled"}>Tema siguiente</button>
      </footer>
    </article>`;
}
function renderConceptBody(body) {
  const blocks = conceptBlocks(body);
  if (!blocks.some(block => block.type === "table")) {
    return `<div class="concept-body"><p>${escapeHtml(body)}</p></div>`;
  }
  return `<div class="concept-body">${blocks.map(block => {
    if (block.type === "table") return renderChordTable(block.rows);
    return `<p>${escapeHtml(block.text)}</p>`;
  }).join("")}</div>`;
}
function conceptBlocks(body) {
  const chunks = splitConceptChunks(body);
  const blocks = [];
  chunks.forEach(chunk => {
    const row = chordRowFromChunk(chunk.text) || noteCipherRowFromChunk(chunk.text);
    if (row) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "table" && last.tableKind === row.kind) last.rows.push(row);
      else blocks.push({ type: "table", tableKind: row.kind, rows: [row] });
      return;
    }
    if (chunk.text) {
      blocks.push({ type: "text", text: `${chunk.text}${chunk.punctuation}`.trim() });
    }
  });
  return blocks;
}
function splitConceptChunks(body) {
  const chunks = [];
  const re = /([^.;]+)([.;]?)/g;
  let match;
  while ((match = re.exec(body))) {
    const text = match[1].trim();
    if (text) chunks.push({ text, punctuation: match[2] || "" });
  }
  return chunks;
}
function chordRowFromChunk(chunk) {
  const interval = "(?:bb7\\(6\\)|#11\\(#4\\)|bb7|b13|#11|#9|b9|b7|#5|b5|b3|#4|13|11|9|7|6|5|4|3|2|1|\\((?:bb7|b13|#11|#9|b9|b7|#5|b5|b3|#4|13|11|9|7|6|5|4|3|2|1)(?: opcional)?\\))";
  const formulaRe = new RegExp(`(?:^|\\s)(1(?:\\s+${interval}){2,})`);
  const match = formulaRe.exec(chunk);
  if (!match) return null;
  const formulaStart = match.index + match[0].indexOf(match[1]);
  const formula = match[1];
  const afterFormula = chunk.slice(formulaStart + formula.length).trimStart();
  const notes = readBalancedNotes(afterFormula);
  if (!notes) return null;
  const before = chunk.slice(0, formulaStart).trim();
  const afterNotes = afterFormula.slice(notes.raw.length).trim();
  const label = chordLabel(before, afterNotes);
  return { kind: "chord", label, formula, notes: notes.value };
}
function noteCipherRowFromChunk(chunk) {
  const note = "(?:[A-G](?:bb|##|b|#)?)";
  const notesRe = new RegExp(`^((?:${note}(?:,\\s*|\\s+)){2,}${note})\\s+corresponde a\\s+(.+)$`, "i");
  const match = notesRe.exec(chunk.trim());
  if (!match) return null;
  return {
    kind: "noteCipher",
    notes: match[1].replace(/,\s*/g, " ").replace(/\s+/g, " ").trim(),
    cipher: match[2].replace(/[.;]$/, "").trim()
  };
}
function readBalancedNotes(text) {
  if (!text.startsWith("(")) return null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") depth -= 1;
    if (depth === 0) {
      return { raw: text.slice(0, i + 1), value: text.slice(1, i) };
    }
  }
  return null;
}
function chordLabel(before, afterNotes) {
  const correspondence = afterNotes.match(/^corresponde a\s+(.+)$/i);
  if (correspondence) return correspondence[1].replace(/[.;]$/, "").trim();
  return before
    .replace(/[=:]+$/g, "")
    .replace(/\s+contiene$/i, "")
    .replace(/\s+es$/i, "")
    .replace(/\s+significa.*$/i, "")
    .trim() || "Ejemplo en C";
}
function renderChordTable(rows) {
  if (rows[0]?.kind === "noteCipher") {
    return `<div class="chord-table-wrap"><table class="chord-table note-cipher-table">
      <thead><tr><th>Notas</th><th>Cifrado</th></tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td><code>${escapeHtml(row.notes)}</code></td>
        <td>${escapeHtml(row.cipher)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }
  return `<div class="chord-table-wrap"><table class="chord-table">
    <thead><tr><th>Acorde o caso</th><th>Intervalos</th><th>Notas del ejemplo</th></tr></thead>
    <tbody>${rows.map(row => `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td><code>${escapeHtml(row.formula)}</code></td>
      <td><code>${escapeHtml(row.notes)}</code></td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}
function updateProgress() {
  const done = moduleTheory().filter(s => state.studied[s.id]).length;
  const total = moduleTheory().length;
  const pct = total ? done / total : 0;
  $("studyBar").style.width = `${pct * 100}%`;
  setText("studyProgressText", `${done}/${total} temas estudiados`);
}
function resetStudy() {
  if (!confirm("¿Borrar el progreso de estudio marcado?")) return;
  const currentIds = new Set(moduleTheory().map(section => section.id));
  Object.keys(state.studied).forEach(id => {
    if (currentIds.has(id)) delete state.studied[id];
  });
  saveState(); renderTheory(); updateProgress();
}
function hydrateStudentFields() {
  $("studentName").value = state.quiz.student.name || "";
  $("studentCourse").value = state.quiz.student.course || "";
  $("studentDate").value = state.quiz.student.date || new Date().toISOString().slice(0,10);
  updateStudentMeta();
}
function updateStudentMeta() {
  state.quiz.student = {
    name: $("studentName").value.trim(),
    course: $("studentCourse").value.trim(),
    date: $("studentDate").value || new Date().toISOString().slice(0,10)
  };
  saveState();
}
function startQuiz() {
  updateStudentMeta();
  if (!state.quiz.student.name) {
    alert("Ingrese el nombre del estudiante antes de iniciar.");
    $("studentName").focus();
    return;
  }
  state.quiz.active = true;
  state.quiz.submitted = false;
  state.quiz.startedAt = new Date().toISOString();
  state.quiz.submittedAt = null;
  state.quiz.answers = state.quiz.answers || {};
  state.quiz.focusWarnings = 0;
  state.quiz.result = null;
  saveState();
  applyQuizLock(true);
  showView("quiz");
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
function renderQuiz() {
  if (state.quiz.submitted && state.quiz.result) {
    renderQuizResult(state.quiz.result);
    return;
  }
  $("quizStartPanel").classList.toggle("hidden", state.quiz.active);
  $("quizActivePanel").classList.toggle("hidden", !state.quiz.active);
  $("quizResultPanel").classList.add("hidden");
  applyQuizLock(state.quiz.active && !state.quiz.submitted);
  if (!state.quiz.active) return;
  setText("activeStudent", state.quiz.student.name || "Sin nombre");
  setText("focusWarnings", state.quiz.focusWarnings || 0);
  const answered = countAnswered();
  setText("answeredCount", `${answered}/${moduleQuiz().length} respondidas`);
  $("quizBar").style.width = `${(answered / moduleQuiz().length) * 100}%`;
  $("questionList").innerHTML = moduleQuiz().map(renderQuestion).join("");
  bindAnswerEvents();
}
function renderQuestion(q) {
  const body = renderQuestionBody(q);
  return `<article class="question-card" id="q-${q.id}">
    <div class="section-label">${escapeHtml(q.section || "")}</div>
    <div class="question-head"><div class="qnum">${q.id}.</div><h3>${escapeHtml(q.prompt)}</h3></div>
    ${body}
  </article>`;
}
function val(qid, suffix="") { return state.quiz.answers[`q${qid}${suffix}`] ?? ""; }
function optionValue(option) { return typeof option === "object" ? option.value : option; }
function optionLabel(option) { return typeof option === "object" ? option.label : option; }
function dropdownOptions(q, item) {
  return q.optionsByItem?.[item] || q.options || [];
}
function renderQuestionBody(q) {
  if (q.type === "selectBlanks") {
    return `<div class="inline-grid">${q.labels.map((label,i) => `<label class="field"><span>${escapeHtml(label)}</span><select data-answer="q${q.id}_${i}"><option value="">Seleccione</option>${q.options.map(opt => `<option value="${escapeHtml(optionValue(opt))}" ${val(q.id,`_${i}`)===optionValue(opt)?"selected":""}>${escapeHtml(optionLabel(opt))}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "multipleChoice") {
    return `<div class="options">${q.choices.map((choice,i) => `<label class="option"><input type="radio" name="q${q.id}" data-answer="q${q.id}" value="${i}" ${String(val(q.id))===String(i)?"checked":""}><span>${String.fromCharCode(97+i)}) ${escapeHtml(choice)}</span></label>`).join("")}</div>`;
  }
  if (q.type === "multiSelect") {
    return `<div class="multi-note">Seleccione todas las respuestas correctas.</div><div class="options">${q.choices.map((choice,i) => `<label class="option"><input type="checkbox" data-answer="q${q.id}_${i}" value="${escapeHtml(choice)}" ${val(q.id,`_${i}`) ? "checked" : ""}><span>${escapeHtml(choice)}</span></label>`).join("")}</div>`;
  }
  if (q.type === "classify") {
    return `<div>${q.items.map(item => `<label class="classify-row"><span>${escapeHtml(item)}</span><select data-answer="q${q.id}_${escapeAttr(item)}"><option value="">Seleccione</option>${dropdownOptions(q, item).map(opt => `<option value="${escapeHtml(opt)}" ${val(q.id,`_${item}`)===opt?"selected":""}>${escapeHtml(opt)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "match") {
    return `<div>${q.items.map(item => `<label class="match-row"><span>${escapeHtml(item)}</span><select data-answer="q${q.id}_${escapeAttr(item)}"><option value="">Seleccione</option>${dropdownOptions(q, item).map(opt => `<option value="${escapeHtml(opt)}" ${val(q.id,`_${item}`)===opt?"selected":""}>${escapeHtml(opt)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "trueFalse") {
    return `<div class="options"><label class="option"><input type="radio" name="q${q.id}" data-answer="q${q.id}" value="true" ${val(q.id)==="true"?"checked":""}><span>V</span></label><label class="option"><input type="radio" name="q${q.id}" data-answer="q${q.id}" value="false" ${val(q.id)==="false"?"checked":""}><span>F</span></label></div>`;
  }
  return "";
}
function bindAnswerEvents() {
  document.querySelectorAll("[data-answer]").forEach(el => {
    el.addEventListener("input", saveAnswer);
    el.addEventListener("change", saveAnswer);
  });
}
function saveAnswer(e) {
  const key = e.currentTarget.dataset.answer;
  if (e.currentTarget.type === "radio" && !e.currentTarget.checked) return;
  if (e.currentTarget.type === "checkbox") {
    if (e.currentTarget.checked) state.quiz.answers[key] = e.currentTarget.value;
    else delete state.quiz.answers[key];
  } else {
    state.quiz.answers[key] = e.currentTarget.value;
  }
  saveState();
  setText("answeredCount", `${countAnswered()}/${moduleQuiz().length} respondidas`);
  $("quizBar").style.width = `${(countAnswered() / moduleQuiz().length) * 100}%`;
}
function countAnswered() {
  return moduleQuiz().filter(q => isAnswered(q)).length;
}
function isAnswered(q) {
  if (q.type === "selectBlanks") return q.answers.some((_,i)=> String(val(q.id,`_${i}`)).trim());
  if (q.type === "multiSelect") return q.choices.some((_,i)=> String(val(q.id,`_${i}`)).trim());
  if (q.type === "classify" || q.type === "match") return q.items.some(item => String(val(q.id,`_${item}`)).trim());
  return String(val(q.id)).trim() !== "";
}
function submitQuiz() {
  const unanswered = moduleQuiz().length - countAnswered();
  if (unanswered > 0 && !confirm(`Faltan ${unanswered} preguntas por responder. ¿Entregar de todos modos?`)) return;
  const result = gradeQuiz();
  state.quiz.submitted = true;
  state.quiz.active = false;
  state.quiz.submittedAt = new Date().toISOString();
  state.quiz.result = result;
  saveState();
  applyQuizLock(false);
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  renderQuizResult(result);
}
function gradeQuiz() {
  const details = moduleQuiz().map(q => gradeQuestion(q));
  const raw = details.reduce((sum, d) => sum + d.points, 0);
  const max = moduleQuiz().length;
  const score = (raw / max) * 5;
  return { details, raw, max, score, percent: raw / max, student: state.quiz.student, focusWarnings: state.quiz.focusWarnings || 0, startedAt: state.quiz.startedAt, submittedAt: new Date().toISOString() };
}
function gradeQuestion(q) {
  let points = 0;
  let given = "";
  if (q.type === "selectBlanks") {
    const scores = q.answers.map((ans, i) => val(q.id,`_${i}`) === ans ? 1 : 0);
    given = q.labels.map((l,i)=>`${l}: ${val(q.id,`_${i}`)}`).join(" | ");
    points = scores.reduce((a,b)=>a+b,0) / q.answers.length;
  } else if (q.type === "multipleChoice") {
    given = choiceLabel(q, val(q.id));
    points = Number(val(q.id)) === q.answer ? 1 : 0;
  } else if (q.type === "multiSelect") {
    const selected = q.choices.filter((_, i) => String(val(q.id,`_${i}`)).trim());
    const expected = q.answers || [];
    const correct = selected.filter(choice => expected.includes(choice)).length;
    const extra = selected.filter(choice => !expected.includes(choice)).length;
    given = selected.length ? selected.join(" | ") : "";
    points = clamp((correct - extra) / expected.length, 0, 1);
  } else if (q.type === "classify" || q.type === "match") {
    const scores = q.items.map(item => val(q.id,`_${item}`) === q.answers[item] ? 1 : 0);
    given = q.items.map(item => `${item}: ${val(q.id,`_${item}`)}`).join(" | ");
    points = scores.reduce((a,b)=>a+b,0) / q.items.length;
  } else if (q.type === "order") {
    given = val(q.id);
    const normalized = normalizeText(given).replace(/\s/g, "").split(/[,-]/).join("");
    points = normalized === q.answer.join("") ? 1 : 0;
  } else if (q.type === "trueFalse") {
    given = val(q.id) === "true" ? "V" : val(q.id) === "false" ? "F" : "";
    points = String(q.answer) === String(val(q.id)) ? 1 : 0;
  }
  points = Math.round(points * 1000) / 1000;
  return { id: q.id, prompt: q.prompt, points, given, sampleAnswer: q.sampleAnswer, status: points >= .999 ? "correct" : points > 0 ? "partial" : "wrong" };
}
function uniqueHits(text, terms) {
  const clean = normalizeText(text);
  const hits = new Set();
  terms.forEach(term => {
    const norm = normalizeText(term);
    if (clean.includes(norm)) hits.add(norm);
  });
  return hits.size;
}
function choiceLabel(q, value) {
  if (value === "" || value === undefined) return "";
  const i = Number(value);
  if (Number.isNaN(i) || !q.choices[i]) return "";
  return `${String.fromCharCode(97+i)}) ${q.choices[i]}`;
}
function renderQuizResult(result) {
  $("quizStartPanel").classList.add("hidden");
  $("quizActivePanel").classList.add("hidden");
  $("quizResultPanel").classList.remove("hidden");
  applyQuizLock(false);
  const score = result.score.toFixed(1);
  const raw = result.raw.toFixed(2).replace(/\.00$/, "");
  $("scoreCircle").style.setProperty("--score-deg", `${result.percent * 360}deg`);
  setText("finalScore", score);
  setText("rawPoints", `${raw}/${result.max} puntos`);
  setText("resultStudent", result.student.name || "Sin nombre");
  setText("resultCourse", result.student.course || "Sin curso");
  setText("resultDate", result.student.date || "Sin fecha");
  setText("resultWarnings", result.focusWarnings || 0);
  const wrap = $("reviewList");
  wrap.innerHTML = result.details.map(d => {
    const label = d.status === "correct" ? "Correcta" : d.status === "partial" ? "Parcial" : "Incorrecta";
    return `<details class="review-item">
      <summary>${d.id}. ${escapeHtml(label)} · ${d.points.toFixed(2)} punto(s)</summary>
      <div class="review-meta"><b>Pregunta:</b> ${escapeHtml(d.prompt)}</div>
      <div class="review-meta"><b>Respuesta del estudiante:</b> ${escapeHtml(d.given || "Sin respuesta")}</div>
      <div class="review-meta"><b>Respuesta esperada:</b> ${escapeHtml(d.sampleAnswer)}</div>
    </details>`;
  }).join("");
}
function downloadCSV() {
  const result = state.quiz.result;
  if (!result) return;
  const rows = [["Estudiante","Curso","Fecha","Calificacion_0_5","Puntos","Maximo","Advertencias_foco"]];
  rows.push([result.student.name, result.student.course, result.student.date, result.score.toFixed(1), result.raw.toFixed(2), result.max, result.focusWarnings || 0]);
  rows.push([]);
  rows.push(["Pregunta","Puntos","Respuesta estudiante","Respuesta esperada"]);
  result.details.forEach(d => rows.push([d.id, d.points, d.given, d.sampleAnswer]));
  const csv = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `resultado_${(result.student.name || "estudiante").replace(/\s+/g,"_")}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function newAttempt() {
  if (!confirm("¿Crear un nuevo intento? Se borrarán las respuestas actuales y el resultado guardado en este navegador.")) return;
  const studied = state.studied;
  const moduleId = state.moduleId;
  state = defaultState();
  state.studied = studied;
  state.moduleId = moduleId;
  saveState(); hydrateStudentFields(); renderQuiz(); showView("quiz");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }

document.addEventListener("DOMContentLoaded", init);
