const DATA = window.APP_DATA;
const LS_KEY = "teoria_musical_local_app_v1";
let state = loadState();
let currentView = "home";
let quizResults = null;

function defaultState() {
  return {
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
    return Object.assign(defaultState(), JSON.parse(raw));
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

function init() {
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
  setText("topicCount", DATA.theory.length);
  setText("questionCount", DATA.quiz.length);
  setText("autoGrade", "0–5.0");
  setText("sourceCount", "2");
}
function renderTheory() {
  const wrap = $("topicGrid");
  wrap.innerHTML = DATA.theory.map(section => {
    const learned = !!state.studied[section.id];
    const sampleItems = section.items.slice(0, 4).map(x => `<li><b>${escapeHtml(x.term)}:</b> ${escapeHtml(x.body)}</li>`).join("");
    const rest = section.items.length > 4 ? `<li><b>Más:</b> ${section.items.length - 4} conceptos adicionales dentro del tema.</li>` : "";
    return `<article class="topic-card ${learned ? "done" : ""}" data-topic="${section.id}">
      <h3>${escapeHtml(section.title)}</h3>
      <p>${escapeHtml(section.subtitle)}</p>
      <ul>${sampleItems}${rest}</ul>
      <button class="soft-btn" data-study="${section.id}">${learned ? "Tema estudiado" : "Marcar como estudiado"}</button>
    </article>`;
  }).join("");
  wrap.querySelectorAll("[data-study]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.studied[btn.dataset.study] = !state.studied[btn.dataset.study];
      saveState(); renderTheory(); updateProgress();
    });
  });
  renderTheoryDetail();
}
function renderTheoryDetail() {
  const wrap = $("theoryDetail");
  wrap.innerHTML = DATA.theory.map(section => `
    <details class="panel" style="margin-bottom:14px;" ${section.id === DATA.theory[0].id ? "open" : ""}>
      <summary style="cursor:pointer; font-weight:900; font-size:1.05rem;">${escapeHtml(section.title)}</summary>
      <div style="display:grid; gap:12px; margin-top:16px;">
        ${section.items.map(item => `<div style="border-left:4px solid var(--accent-2); padding:10px 12px; background:#fffdfa; border-radius:12px;"><b>${escapeHtml(item.term)}</b><br><span style="color:var(--muted); line-height:1.5;">${escapeHtml(item.body)}</span></div>`).join("")}
      </div>
    </details>`).join("");
}
function updateProgress() {
  const done = DATA.theory.filter(s => state.studied[s.id]).length;
  const total = DATA.theory.length;
  const pct = total ? done / total : 0;
  $("studyBar").style.width = `${pct * 100}%`;
  setText("studyProgressText", `${done}/${total} temas estudiados`);
}
function resetStudy() {
  if (!confirm("¿Borrar el progreso de estudio marcado?")) return;
  state.studied = {};
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
  setText("answeredCount", `${answered}/${DATA.quiz.length} respondidas`);
  $("quizBar").style.width = `${(answered / DATA.quiz.length) * 100}%`;
  $("questionList").innerHTML = DATA.quiz.map(renderQuestion).join("");
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
function renderQuestionBody(q) {
  if (q.type === "text" || q.type === "textList") {
    return `<textarea class="answer-area" data-answer="q${q.id}" placeholder="Escriba su respuesta...">${escapeHtml(val(q.id))}</textarea>`;
  }
  if (q.type === "blanks") {
    return `<div>${q.labels.map((label,i) => `<label class="blank-row"><span>${escapeHtml(label)}</span><input class="answer-input" data-answer="q${q.id}_${i}" value="${escapeHtml(val(q.id,`_${i}`))}" placeholder="Respuesta ${i+1}"></label>`).join("")}</div>`;
  }
  if (q.type === "selectBlanks") {
    return `<div class="inline-grid">${q.labels.map((label,i) => `<label class="field"><span>${escapeHtml(label)}</span><select data-answer="q${q.id}_${i}"><option value="">Seleccione</option>${q.options.map(opt => `<option value="${escapeHtml(opt)}" ${val(q.id,`_${i}`)===opt?"selected":""}>${escapeHtml(opt)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "multipleChoice") {
    return `<div class="options">${q.choices.map((choice,i) => `<label class="option"><input type="radio" name="q${q.id}" data-answer="q${q.id}" value="${i}" ${String(val(q.id))===String(i)?"checked":""}><span>${String.fromCharCode(97+i)}) ${escapeHtml(choice)}</span></label>`).join("")}</div>`;
  }
  if (q.type === "choiceText") {
    return `<div class="options">${q.choices.map((choice,i) => `<label class="option"><input type="radio" name="q${q.id}" data-answer="q${q.id}" value="${i}" ${String(val(q.id))===String(i)?"checked":""}><span>${String.fromCharCode(97+i)}) ${escapeHtml(choice)}</span></label>`).join("")}</div><label class="field" style="margin-top:12px;"><span>${escapeHtml(q.textPrompt)}</span><input class="answer-input" data-answer="q${q.id}_text" value="${escapeHtml(val(q.id,"_text"))}" placeholder="Grados correspondientes"></label>`;
  }
  if (q.type === "classify") {
    return `<div>${q.items.map(item => `<label class="classify-row"><span>${escapeHtml(item)}</span><select data-answer="q${q.id}_${escapeAttr(item)}"><option value="">Seleccione</option>${q.options.map(opt => `<option value="${escapeHtml(opt)}" ${val(q.id,`_${item}`)===opt?"selected":""}>${escapeHtml(opt)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "match") {
    return `<div>${q.items.map(item => `<label class="match-row"><span>${escapeHtml(item)}</span><select data-answer="q${q.id}_${escapeAttr(item)}"><option value="">Seleccione</option>${q.options.map(opt => `<option value="${escapeHtml(opt)}" ${val(q.id,`_${item}`)===opt?"selected":""}>${escapeHtml(opt)}</option>`).join("")}</select></label>`).join("")}</div>`;
  }
  if (q.type === "order") {
    return `<ol class="order-list">${q.items.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ol><input class="answer-input" data-answer="q${q.id}" value="${escapeHtml(val(q.id))}" placeholder="Ejemplo: b, c, a">`;
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
  state.quiz.answers[key] = e.currentTarget.value;
  saveState();
  setText("answeredCount", `${countAnswered()}/${DATA.quiz.length} respondidas`);
  $("quizBar").style.width = `${(countAnswered() / DATA.quiz.length) * 100}%`;
}
function countAnswered() {
  return DATA.quiz.filter(q => isAnswered(q)).length;
}
function isAnswered(q) {
  if (q.type === "blanks" || q.type === "selectBlanks") return q.answers.some((_,i)=> String(val(q.id,`_${i}`)).trim());
  if (q.type === "choiceText") return String(val(q.id)).trim() || String(val(q.id,"_text")).trim();
  if (q.type === "classify" || q.type === "match") return q.items.some(item => String(val(q.id,`_${item}`)).trim());
  return String(val(q.id)).trim() !== "";
}
function submitQuiz() {
  const unanswered = DATA.quiz.length - countAnswered();
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
  const details = DATA.quiz.map(q => gradeQuestion(q));
  const raw = details.reduce((sum, d) => sum + d.points, 0);
  const max = DATA.quiz.length;
  const score = (raw / max) * 5;
  return { details, raw, max, score, percent: raw / max, student: state.quiz.student, focusWarnings: state.quiz.focusWarnings || 0, startedAt: state.quiz.startedAt, submittedAt: new Date().toISOString() };
}
function gradeQuestion(q) {
  let points = 0;
  let given = "";
  if (q.type === "text") {
    given = val(q.id);
    const hits = q.requiredGroups.filter(g => groupHit(given, g)).length;
    points = q.requiredGroups.length ? hits / q.requiredGroups.length : 0;
  } else if (q.type === "textList") {
    given = val(q.id);
    const hits = uniqueHits(given, q.acceptedTerms);
    points = clamp(hits / q.minTerms, 0, 1);
  } else if (q.type === "blanks") {
    const scores = q.answers.map((accepted, i) => accepted.some(a => answerMatches(val(q.id,`_${i}`), a)) ? 1 : 0);
    given = q.labels.map((l,i)=>`${l}: ${val(q.id,`_${i}`)}`).join(" | ");
    points = scores.reduce((a,b)=>a+b,0) / q.answers.length;
  } else if (q.type === "selectBlanks") {
    const scores = q.answers.map((ans, i) => val(q.id,`_${i}`) === ans ? 1 : 0);
    given = q.labels.map((l,i)=>`${l}: ${val(q.id,`_${i}`)}`).join(" | ");
    points = scores.reduce((a,b)=>a+b,0) / q.answers.length;
  } else if (q.type === "multipleChoice") {
    given = choiceLabel(q, val(q.id));
    points = Number(val(q.id)) === q.answer ? 1 : 0;
  } else if (q.type === "choiceText") {
    const choice = Number(val(q.id)) === q.answer ? 1 : 0;
    const text = val(q.id,"_text");
    const hits = q.requiredGroups.filter(g => groupHit(text, g)).length;
    const textScore = q.requiredGroups.length ? hits / q.requiredGroups.length : 0;
    given = `${choiceLabel(q, val(q.id))}; grados: ${text}`;
    points = (choice + textScore) / 2;
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
  state = defaultState();
  state.studied = studied;
  saveState(); hydrateStudentFields(); renderQuiz(); showView("quiz");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }

document.addEventListener("DOMContentLoaded", init);
