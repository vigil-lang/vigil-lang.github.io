// The playground: an editor, the compiler in WebAssembly, and its outputs.

import {
  Editor, PACKETS, codeFromHash, compile, escapeHtml, format, highlight, highlightAsm,
  loadCompiler, playgroundLink, run,
} from "./vigil.js";
import { mountSwitcher, onLangChange, pick, t } from "./i18n.js";
import { EXAMPLES } from "./examples.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "vigil-playground-code";

mountSwitcher();

function stored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private windows: the code is just not kept.
  }
}

// ------------------------------------------------------------------ setup

const fromHash = codeFromHash();
const editor = new Editor($("editor"), {
  value: fromHash ?? stored() ?? EXAMPLES[0].code,
  minLines: 20,
  onChange: (code) => {
    store(code);
    $("examples").value = "";
    schedule();
  },
  onRun: () => recompile(),
});
if (fromHash) history.replaceState(null, "", location.pathname);

$("examples").addEventListener("change", (ev) => {
  const e = EXAMPLES.find((x) => x.id === ev.target.value);
  if (!e) return;
  editor.value = e.code;
  store(e.code);
  if (e.packet !== null) {
    $("run-preset").value = String(e.packet);
    $("run-packet").value = PACKETS[e.packet].hex();
  }
  recompile();
  showTab(e.runnable ? "run" : "diagnostics");
});

$("run-packet").value = PACKETS[0].hex();
$("run-preset").addEventListener("change", (ev) => {
  if (ev.target.value !== "custom") $("run-packet").value = PACKETS[Number(ev.target.value)].hex();
});
$("run-packet").addEventListener("input", () => ($("run-preset").value = "custom"));

/** The texts of the selects, in the current language. */
function labelSelects() {
  const example = $("examples").value;
  $("examples").innerHTML = "";
  $("examples").add(new Option("—", ""));
  for (const e of EXAMPLES) $("examples").add(new Option(pick(e.title), e.id));
  $("examples").value = example;

  const preset = $("run-preset").value || "0";
  $("run-preset").innerHTML = "";
  PACKETS.forEach((p, i) => $("run-preset").add(new Option(t(p.key), i)));
  $("run-preset").add(new Option(t("packet.custom"), "custom"));
  $("run-preset").value = preset;
}
labelSelects();

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
}

function showTab(name) {
  for (const x of document.querySelectorAll(".tab")) x.classList.toggle("active", x.dataset.tab === name);
  for (const p of document.querySelectorAll(".panel")) p.classList.toggle("active", p.id === `panel-${name}`);
}

for (const id of ["kernel", "arch", "optimize"]) $(id).addEventListener("change", () => recompile());
$("compile").addEventListener("click", () => recompile());
$("run").addEventListener("click", () => execute());

$("format").addEventListener("click", async () => {
  const result = await format(editor.value);
  if (result.ok) {
    editor.value = result.text;
    store(result.text);
    recompile();
  } else {
    status(`<span class="err">${t("pg.notFormatted")}</span> ${escapeHtml(result.error)}`);
  }
});

$("share").addEventListener("click", async () => {
  const url = new URL(playgroundLink(editor.value), location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    status(t("pg.copied"));
  } catch {
    prompt(t("pg.linkPrompt"), url);
  }
});

// ------------------------------------------------------------ compilation

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(recompile, 450);
}

function settings() {
  return { kernel: $("kernel").value, arch: $("arch").value, optimize: $("optimize").checked };
}

function status(html) {
  $("status").innerHTML = html;
}

// The last compilation and run, drawn again when the language changes.
let last = null;
let lastRun = null;

onLangChange(() => {
  labelSelects();
  editor.input.setAttribute("aria-label", t("editor.label"));
  if (last) render();
  if (lastRun) renderRun(lastRun);
});

async function recompile() {
  clearTimeout(timer);
  const source = editor.value;
  let result;
  try {
    result = await compile(source, settings());
  } catch (e) {
    loadFailed(e);
    return;
  }
  if (source !== editor.value) return; // stale
  if (last?.source !== source) lastRun = null;
  last = { source, result };
  render();
}

function render() {
  const { result } = last;
  if (result.error) {
    status(`<span class="err">${escapeHtml(result.error)}</span>`);
    return;
  }
  renderDiagnostics(result);
  renderPrograms(result);
  renderIr(result);
  renderEbpf(result);
  renderRunTargets(result);
  const verdict = result.ok
    ? `<span class="ok">${t("pg.compiled")}</span>`
    : `<span class="err">${t("pg.errors", result.errors)}</span>`;
  status(
    `${verdict}<span>${result.time.toFixed(0)} ms</span>` +
      `<span>${escapeHtml(t("pg.target", result.profile, settings().arch))}</span>` +
      `<span>${t("pg.compileTitle")}</span>`,
  );
}

function loadFailed(e) {
  $("panel-diagnostics").innerHTML = `<div class="notice">${t("pg.loadFailed")}<br>${escapeHtml(String(e))}</div>`;
}

function renderDiagnostics(result) {
  const panel = $("panel-diagnostics");
  const badge = $("badge-diag");
  const shown = result.diagnostics;
  badge.textContent = result.errors ? result.errors : result.warnings ? result.warnings : "✓";
  badge.className = "badge " + (result.errors ? "err" : result.warnings ? "" : "ok");

  const marks = [];
  for (const d of shown) {
    for (const l of d.labels) {
      if (l.file === result.file && l.primary) marks.push([l.line, d.severity === "error" ? "error" : "warning"]);
    }
  }
  editor.mark(marks);

  if (!shown.length) {
    panel.innerHTML = `<div class="notice success">${t("pg.noErrors")}</div>`;
    return;
  }
  panel.innerHTML =
    shown
      .map((d, i) => {
        const primary = d.labels.find((l) => l.primary) ?? d.labels[0];
        const where = primary ? `${primary.file}:${primary.line}:${primary.col}` : "";
        const items = [
          ...d.labels.map(
            (l) => `${l.file === result.file ? t("pg.line", l.line) : l.file + ":" + l.line}: ${escapeHtml(l.message)}`,
          ),
          ...d.notes.map((n) => `${t("pg.note")}: ${escapeHtml(n)}`),
          ...d.help.map((h) => `${t("pg.help")}: ${escapeHtml(h)}`),
        ];
        return `<div class="diag ${d.severity}" data-index="${i}">
        <div class="head"><span class="sev">${t("sev." + d.severity)}</span>${d.code ? `[${d.code}] ` : ""}${escapeHtml(d.message)}</div>
        <div class="where">${escapeHtml(where)}</div>
        ${items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
      </div>`;
      })
      .join("") +
    `<details><summary>${t("pg.rawOutput")}</summary><pre class="code small">${escapeHtml(result.rendered)}</pre></details>`;
  panel.querySelectorAll(".diag").forEach((el) => {
    el.addEventListener("click", () => {
      const d = shown[Number(el.dataset.index)];
      const l = d.labels.find((x) => x.primary && x.file === result.file);
      if (l) editor.goto(l.line, l.col);
    });
  });
}

function renderPrograms(result) {
  const panel = $("panel-programs");
  if (!result.ok) {
    panel.innerHTML = `<div class="notice">${t("pg.fixForPrograms")}</div>`;
    return;
  }
  const programs = result.programs.length
    ? `<div class="cards">${result.programs
        .map(
          (p) => `<div class="card"><div class="k">${escapeHtml(p.kind)} · ${t("pg.line", p.line)}</div>
          <div class="v">${escapeHtml(p.name)}</div><div class="k">${escapeHtml(t("pg.section", p.section))}</div></div>`,
        )
        .join("")}</div>`
    : `<div class="notice">${t("pg.noPrograms")}</div>`;
  const maps = result.maps.length
    ? `<table class="maps"><thead><tr><th>${t("pg.map")}</th><th>${t("pg.kind")}</th><th>${t("pg.key")}</th>
        <th>${t("pg.value")}</th><th>${t("pg.entries")}</th></tr></thead><tbody>${result.maps
        .map(
          (m) => `<tr><td><code>${escapeHtml(m.name)}</code></td><td>${escapeHtml(m.kind)}</td>
          <td>${m.keySize} B</td><td>${m.valueSize} B</td><td>${m.maxEntries}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";
  panel.innerHTML = `<h3>${t("pg.programs")}</h3>${programs}${maps ? `<h3>${t("pg.maps")}</h3>${maps}` : ""}`;
}

function renderIr(result) {
  const panel = $("panel-ir");
  if (!result.ir) {
    panel.innerHTML = `<div class="notice">${t("pg.fixForIr")}</div>`;
    return;
  }
  panel.innerHTML = `<div class="notice">${t("pg.irNotice")}</div><pre class="code small">${highlightAsm(result.ir)}</pre>`;
}

function renderEbpf(result) {
  const panel = $("panel-ebpf");
  if (!result.ok) {
    panel.innerHTML = `<div class="notice">${t("pg.fixForEbpf")}</div>`;
    return;
  }
  if (!result.certified.length) {
    panel.innerHTML = `<div class="notice">${t("pg.noPacketPrograms")}</div>`;
    return;
  }
  panel.innerHTML =
    `<div class="notice">${t("pg.ebpfNotice")}</div>` +
    result.certified
      .map((c) =>
        c.ok
          ? `<h3><code>${escapeHtml(c.name)}</code> — ${t("pg.ebpfHeader", c.insns, c.stack)}</h3>
             <details><summary>Vigil Core</summary><pre class="code small">${highlight(c.core)}</pre></details>
             <pre class="code small">${highlightAsm(c.asm)}</pre>`
          : `<div class="notice">${t("pg.notInCore")}</div><pre class="code small">${escapeHtml(c.error)}</pre>`,
      )
      .join("");
}

function renderRunTargets(result) {
  const select = $("run-program");
  const previous = select.value;
  select.innerHTML = "";
  const runnable = result.ok ? result.certified.filter((c) => c.ok) : [];
  for (const c of runnable) select.add(new Option(c.name, c.name));
  if (runnable.some((c) => c.name === previous)) select.value = previous;
  $("run").disabled = runnable.length === 0;
  if (!runnable.length) {
    lastRun = null;
    $("run-result").innerHTML = `<div class="notice">${t(result.ok ? "pg.noRunnable" : "pg.fixToRun")}</div>`;
  } else if (!lastRun) {
    $("run-result").innerHTML = "";
  }
}

async function execute() {
  if (!last || !last.result.ok) return;
  const program = $("run-program").value;
  lastRun = await run(last.source, program, $("run-packet").value, settings());
  renderRun(lastRun);
}

function renderRun(outcome) {
  if (!outcome.ok) {
    $("run-result").innerHTML = `<pre class="code small">${escapeHtml(outcome.error)}</pre>`;
    return;
  }
  const cls = /DROP|SHOT|ABORTED/.test(outcome.verdict) ? "drop" : /PASS|OK/.test(outcome.verdict) ? "pass" : "";
  $("run-result").innerHTML = `
    <p><span class="verdict ${cls}">${escapeHtml(outcome.verdict)}</span></p>
    <div class="cards">
      <div class="card"><div class="k">${t("pg.r0")}</div><div class="v">${outcome.value}</div></div>
      <div class="card"><div class="k">${t("pg.steps")}</div><div class="v">${outcome.steps}</div></div>
    </div>
    <details><summary>${t("pg.packetAfter")}</summary><pre class="code small">${escapeHtml(outcome.packet || t("pg.empty"))}</pre></details>`;
}

// Start: load the compiler, then compile what is in the editor.
status(t("pg.compileTitle"));
loadCompiler().then(recompile, loadFailed);
