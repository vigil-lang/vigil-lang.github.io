// Languages of the site: Portuguese and English.
//
// Static text is written twice in the HTML, as `<span data-lang="pt">` and
// `<span data-lang="en">` (or blocks), and CSS shows the one of the current
// language (`<html data-ui-lang>`, set by an inline script in each page
// before it is drawn). Text made by scripts comes from `t(key)`.

const KEY = "vigil-lang";
export const LANGS = ["pt", "en"];
const listeners = [];

export function getLang() {
  const lang = document.documentElement.dataset.uiLang;
  return LANGS.includes(lang) ? lang : "pt";
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  document.documentElement.dataset.uiLang = lang;
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // The choice is just not remembered.
  }
  applyAttributes();
  for (const b of document.querySelectorAll(".lang-switch button")) {
    b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
  }
  for (const f of listeners) f(lang);
}

export function onLangChange(f) {
  listeners.push(f);
}

/** The text of `key` in the current language; `{0}`, `{1}`... are replaced by `args`. */
export function t(key, ...args) {
  const entry = STRINGS[key];
  const text = entry ? entry[getLang()] ?? entry.pt : key;
  return text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));
}

/** A value with a version per language (`{pt, en}`) in the current one. */
export function pick(value) {
  return typeof value === "string" ? value : value[getLang()] ?? value.pt;
}

/** Attributes that cannot hold two spans: `data-i18n-title="key"`, `data-i18n-placeholder`, `data-i18n-aria-label`. */
function applyAttributes() {
  for (const attr of ["title", "placeholder", "aria-label"]) {
    for (const el of document.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
  const title = document.querySelector("meta[name='i18n-title']");
  if (title) document.title = t(title.content);
}

/** The PT/EN buttons of the header. */
export function mountSwitcher() {
  for (const box of document.querySelectorAll(".lang-switch")) {
    box.innerHTML = LANGS.map(
      (l) => `<button type="button" data-set-lang="${l}" aria-pressed="${l === getLang()}">${l.toUpperCase()}</button>`,
    ).join("");
    box.addEventListener("click", (e) => {
      const lang = e.target.closest("button")?.dataset.setLang;
      if (lang) setLang(lang);
    });
  }
  setLang(getLang());
}

const STRINGS = {
  // Page titles.
  "title.home": { pt: "Vigil — eBPF com a sintaxe de Python", en: "Vigil — eBPF with the syntax of Python" },
  "title.tutorial": { pt: "Tutorial — Vigil", en: "Tutorial — Vigil" },
  "title.playground": { pt: "Playground — Vigil", en: "Playground — Vigil" },

  // Shared.
  "try": { pt: "Experimentar ▶", en: "Try it ▶" },
  "editor.label": { pt: "Código Vigil", en: "Vigil code" },
  "load.failed": {
    pt: "Não foi possível carregar o compilador (WebAssembly). Sirva a pasta page/ por HTTP, depois de gerar page/pkg/ com compiler/build-wasm.sh (veja o README).",
    en: "Could not load the compiler (WebAssembly). Serve the page/ directory over HTTP, after building page/pkg/ with compiler/build-wasm.sh (see the README).",
  },

  // Home page.
  "home.compiling": { pt: "Compilando…", en: "Compiling…" },
  "home.notCore": {
    pt: "Compilou, mas só programas de Vigil Core rodam no navegador. Abra o playground para ver o LLVM IR.",
    en: "It compiles, but only programs of Vigil Core run in the browser. Open the playground to see the LLVM IR.",
  },
  "home.result": {
    pt: "{0} instruções eBPF, {1} executadas, compilado em {2} ms",
    en: "{0} eBPF instructions, {1} executed, compiled in {2} ms",
  },
  "home.packet": { pt: "Pacote", en: "Packet" },

  // Packets.
  "packet.dns": { pt: "IPv4/UDP para a porta 53 (DNS)", en: "IPv4/UDP to port 53 (DNS)" },
  "packet.ntp": { pt: "IPv4/UDP para a porta 123 (NTP)", en: "IPv4/UDP to port 123 (NTP)" },
  "packet.telnet": { pt: "IPv4/TCP para a porta 23 (telnet)", en: "IPv4/TCP to port 23 (telnet)" },
  "packet.ttl": { pt: "IPv4/UDP com TTL 3", en: "IPv4/UDP with TTL 3" },
  "packet.arp": { pt: "ARP", en: "ARP" },
  "packet.ones": { pt: "8 bytes 0xff", en: "8 bytes 0xff" },
  "packet.empty": { pt: "Pacote vazio", en: "Empty packet" },
  "packet.custom": { pt: "Personalizado", en: "Custom" },
  "packet.placeholder": { pt: "bytes do pacote em hexadecimal", en: "bytes of the packet in hexadecimal" },

  // Playground.
  "pg.compileTitle": { pt: "Ctrl+Enter compila", en: "Ctrl+Enter compiles" },
  "pg.loading": { pt: "Carregando o compilador…", en: "Loading the compiler…" },
  "pg.notFormatted": { pt: "Não formatado:", en: "Not formatted:" },
  "pg.copied": { pt: "Link copiado para a área de transferência.", en: "Link copied to the clipboard." },
  "pg.linkPrompt": { pt: "Link do programa:", en: "Link to the program:" },
  "pg.compiled": { pt: "✓ compilado", en: "✓ compiled" },
  "pg.errors": { pt: "✗ {0} erro(s)", en: "✗ {0} error(s)" },
  "pg.target": { pt: "alvo: {0}, {1}", en: "target: {0}, {1}" },
  "pg.noErrors": {
    pt: "<strong>Nenhum erro.</strong> O programa passa pelas verificações de tipos e pelas regras do verificador do eBPF. Veja o código gerado nas abas ao lado.",
    en: "<strong>No errors.</strong> The program passes type checking and the rules of the eBPF verifier. See the generated code in the other tabs.",
  },
  "pg.line": { pt: "linha {0}", en: "line {0}" },
  "pg.note": { pt: "nota", en: "note" },
  "pg.help": { pt: "ajuda", en: "help" },
  "sev.error": { pt: "erro", en: "error" },
  "sev.warning": { pt: "aviso", en: "warning" },
  "sev.note": { pt: "nota", en: "note" },
  "pg.rawOutput": { pt: "Saída do compilador (texto)", en: "Compiler output (text)" },
  "pg.fixForPrograms": { pt: "Corrija os erros para ver os programas e mapas.", en: "Fix the errors to see the programs and maps." },
  "pg.noPrograms": {
    pt: "Nenhum programa: funções com <code>@xdp</code>, <code>@tc</code>, <code>@kprobe</code>… são programas. Funções comuns são incorporadas (inline) nos programas que as chamam.",
    en: "No programs: functions with <code>@xdp</code>, <code>@tc</code>, <code>@kprobe</code>… are programs. Other functions are inlined into the programs that call them.",
  },
  "pg.programs": { pt: "Programas", en: "Programs" },
  "pg.maps": { pt: "Mapas", en: "Maps" },
  "pg.section": { pt: "seção {0}", en: "section {0}" },
  "pg.map": { pt: "Mapa", en: "Map" },
  "pg.kind": { pt: "Tipo", en: "Kind" },
  "pg.key": { pt: "Chave", en: "Key" },
  "pg.value": { pt: "Valor", en: "Value" },
  "pg.entries": { pt: "Entradas", en: "Entries" },
  "pg.fixForIr": { pt: "Corrija os erros para ver o LLVM IR.", en: "Fix the errors to see the LLVM IR." },
  "pg.irNotice": {
    pt: "O LLVM IR que <code>vigil build</code> entrega ao <code>clang -target bpfel</code> para gerar o objeto eBPF (com relocações CO-RE e BTF). O clang não roda no navegador: para objetos de qualquer programa, use o compilador na linha de comando.",
    en: "The LLVM IR that <code>vigil build</code> hands to <code>clang -target bpfel</code> to make the eBPF object (with CO-RE relocations and BTF). Clang does not run in the browser: for the objects of any program, use the command-line compiler.",
  },
  "pg.fixForEbpf": { pt: "Corrija os erros para ver o código eBPF.", en: "Fix the errors to see the eBPF code." },
  "pg.noPacketPrograms": { pt: "Nenhum programa XDP ou TC.", en: "No XDP or TC programs." },
  "pg.ebpfNotice": {
    pt: "O <strong>backend certificado</strong> compila programas de Vigil Core direto para instruções eBPF, sem LLVM — instrução por instrução, o compilador formalizado em Lean. Abaixo, o programa em Vigil Core e as instruções para o kernel.",
    en: "The <strong>certified backend</strong> compiles programs of Vigil Core straight to eBPF instructions, without LLVM — instruction for instruction, the compiler formalized in Lean. Below, the program in Vigil Core and the instructions for the kernel.",
  },
  "pg.ebpfHeader": { pt: "{0} instruções, {1} B de pilha", en: "{0} instructions, {1} B of stack" },
  "pg.notInCore": {
    pt: "Este programa não está no subconjunto do backend certificado (o LLVM IR continua disponível):",
    en: "This program is outside the subset of the certified backend (the LLVM IR is still available):",
  },
  "pg.noRunnable": {
    pt: "Nenhum programa deste código está em Vigil Core. Experimente os exemplos “executáveis”.",
    en: "No program of this code is in Vigil Core. Try the “runnable” examples.",
  },
  "pg.fixToRun": { pt: "Corrija os erros para executar.", en: "Fix the errors to run." },
  "pg.r0": { pt: "Valor de retorno (r0)", en: "Return value (r0)" },
  "pg.steps": { pt: "Instruções executadas", en: "Instructions executed" },
  "pg.packetAfter": { pt: "Pacote depois da execução", en: "Packet after the run" },
  "pg.empty": { pt: "(vazio)", en: "(empty)" },
  "pg.loadFailed": {
    pt: "<strong>Não foi possível carregar o compilador.</strong> Sirva a pasta <code>page/</code> por HTTP (por exemplo <code>python3 -m http.server -d page</code>) depois de gerar <code>page/pkg/</code> com <code>compiler/build-wasm.sh</code>.",
    en: "<strong>Could not load the compiler.</strong> Serve the <code>page/</code> directory over HTTP (for example <code>python3 -m http.server -d page</code>) after building <code>page/pkg/</code> with <code>compiler/build-wasm.sh</code>.",
  },
};
