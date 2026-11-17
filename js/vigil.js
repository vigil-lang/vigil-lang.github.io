import { t } from "./i18n.js";

// Shared code of the site: loading the compiler (WebAssembly), syntax
// highlighting of Vigil, a small code editor, and packets for the runs.

let compilerPromise = null;

/** Loads the compiler once; resolves to the module of `pkg/vigil_wasm.js`. */
export function loadCompiler() {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const base = new URL("../pkg/", import.meta.url);
      const mod = await import(new URL("vigil_wasm.js", base).href);
      await mod.default({ module_or_path: new URL("vigil_wasm_bg.wasm", base) });
      return mod;
    })();
  }
  return compilerPromise;
}

/** The settings of a compilation, as the playground and the home page use. */
export const DEFAULT_SETTINGS = { kernel: "6.1", arch: "x86_64", optimize: true };

export async function compile(source, settings = DEFAULT_SETTINGS) {
  const vigil = await loadCompiler();
  const start = performance.now();
  const result = JSON.parse(
    vigil.compile(source, settings.kernel, settings.arch, settings.optimize),
  );
  result.time = performance.now() - start;
  return result;
}

export async function run(source, program, packetHex, settings = DEFAULT_SETTINGS) {
  const vigil = await loadCompiler();
  return JSON.parse(vigil.run(source, settings.kernel, settings.arch, program, packetHex));
}

export async function format(source) {
  const vigil = await loadCompiler();
  return JSON.parse(vigil.format(source));
}

// ---------------------------------------------------------------------------
// Syntax highlighting

const KEYWORDS = new Set(
  ("and as break case comptime const continue def elif else enum for from if import in " +
    "match not or pass return struct while map event protocol type")
    .split(" "),
);
const CONSTANTS = new Set(["True", "False", "None", "Some", "self"]);
const TYPES = new Set(
  "u8 u16 u32 u64 usize i8 i16 i32 i64 bool bytes f64 fixed kptr ref Option".split(" "),
);
const BUILTINS = new Set(
  ("print range min max clamp saturating_add saturating_sub stage exp log sqrt tanh floor round")
    .split(" "),
);

const TOKEN = new RegExp(
  [
    String.raw`(?<comment>#.*)`,
    String.raw`(?<string>[fb]?"(?:[^"\\]|\\.)*"?|[fb]?'(?:[^'\\]|\\.)*'?)`,
    String.raw`(?<decorator>@[A-Za-z_][\w.]*)`,
    String.raw`(?<number>\b(?:0x[\da-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d+)?(?:e-?\d+)?)\b)`,
    String.raw`(?<word>[A-Za-z_]\w*)`,
    String.raw`(?<op>->|[-+*/%&|^~<>=!]=?|\?)`,
  ].join("|"),
  "g",
);

export function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** One line of Vigil as HTML with `tok-*` spans. */
export function highlightLine(line) {
  let out = "";
  let last = 0;
  let afterDef = false;
  for (const m of line.matchAll(TOKEN)) {
    out += escapeHtml(line.slice(last, m.index));
    last = m.index + m[0].length;
    const g = m.groups;
    let cls = null;
    if (g.comment) cls = "comment";
    else if (g.string) cls = "string";
    else if (g.decorator) cls = "decorator";
    else if (g.number) cls = "number";
    else if (g.op) cls = "op";
    else if (g.word) {
      const w = g.word;
      if (afterDef) cls = "fn";
      else if (KEYWORDS.has(w)) cls = "keyword";
      else if (CONSTANTS.has(w)) cls = "constant";
      else if (TYPES.has(w) || /^[A-Z][a-z0-9]/.test(w)) cls = "type";
      else if (/^[A-Z][A-Z0-9_]+$/.test(w)) cls = "constant";
      else if (BUILTINS.has(w)) cls = "builtin";
      afterDef = w === "def" || w === "struct" || w === "enum" || w === "protocol";
      if (afterDef && cls !== "keyword") afterDef = false;
    }
    if (!g.word) afterDef = false;
    const text = escapeHtml(m[0]);
    out += cls ? `<span class="tok-${cls}">${text}</span>` : text;
  }
  return out + escapeHtml(line.slice(last));
}

export function highlight(code) {
  return code.split("\n").map(highlightLine).join("\n");
}

/** Highlights LLVM IR or eBPF listings, lightly. */
export function highlightAsm(text) {
  return text
    .split("\n")
    .map((line) => {
      const esc = escapeHtml(line);
      if (/^\s*;/.test(line)) return `<span class="tok-comment">${esc}</span>`;
      return esc
        .replace(/(^|\s)(define|declare|call|ret|br|icmp|load|store|getelementptr|alloca|phi|select|switch|exit|goto|if)\b/g,
          '$1<span class="tok-keyword">$2</span>')
        .replace(/([@%][\w.$-]+)/g, '<span class="tok-fn">$1</span>')
        .replace(/\b(r\d+|w\d+)\b/g, '<span class="tok-type">$1</span>')
        .replace(/(^\s*\d+:)/, '<span class="tok-comment">$1</span>');
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// The editor: a textarea over a highlighted copy of its text.

export class Editor {
  constructor(root, { value = "", onChange = () => {}, onRun = () => {}, minLines = 8 } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.onRun = onRun;
    this.marks = new Map();
    root.classList.add("editor");
    root.innerHTML = `
      <div class="editor-gutter" aria-hidden="true"></div>
      <div class="editor-body">
        <pre class="editor-highlight" aria-hidden="true"></pre>
        <textarea class="editor-input" spellcheck="false" autocapitalize="off"
          autocomplete="off" autocorrect="off" ></textarea>
      </div>`;
    this.gutter = root.querySelector(".editor-gutter");
    this.pre = root.querySelector(".editor-highlight");
    this.input = root.querySelector("textarea");
    this.root.style.setProperty("--min-lines", minLines);
    this.input.setAttribute("aria-label", t("editor.label"));
    this.input.value = value;
    this.input.addEventListener("input", () => {
      this.marks.clear();
      this.render();
      this.onChange(this.value);
    });
    this.input.addEventListener("scroll", () => this.sync());
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.render();
  }

  get value() {
    return this.input.value;
  }

  set value(text) {
    this.input.value = text;
    this.marks.clear();
    this.render();
  }

  /** Marks lines (from 1) with a severity: `error` or `warning`. */
  mark(lines) {
    this.marks = new Map(lines);
    this.render();
  }

  render() {
    const lines = this.input.value.split("\n");
    this.pre.innerHTML =
      lines
        .map((l, i) => {
          const m = this.marks.get(i + 1);
          return `<span class="editor-line${m ? " mark-" + m : ""}">${highlightLine(l) || " "}</span>`;
        })
        .join("") + "<span class='editor-line'> </span>";
    this.gutter.innerHTML = lines
      .map((_, i) => {
        const m = this.marks.get(i + 1);
        return `<div class="${m ? "mark-" + m : ""}">${i + 1}</div>`;
      })
      .join("");
    this.sync();
  }

  sync() {
    this.pre.style.transform = `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-this.input.scrollTop}px)`;
  }

  /** Puts the cursor on a line and column (from 1). */
  goto(line, col = 1) {
    const lines = this.input.value.split("\n");
    let offset = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    offset += col - 1;
    this.input.focus();
    this.input.setSelectionRange(offset, offset);
    const lineHeight = parseFloat(getComputedStyle(this.input).lineHeight) || 20;
    this.input.scrollTop = Math.max(0, (line - 4) * lineHeight);
  }

  insert(text) {
    // `insertText` keeps the undo history of the textarea.
    if (!document.execCommand("insertText", false, text)) {
      this.input.setRangeText(text, this.input.selectionStart, this.input.selectionEnd, "end");
      this.input.dispatchEvent(new Event("input"));
    }
  }

  key(e) {
    const ta = this.input;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      this.onRun();
      return;
    }
    if (e.key === "Tab" && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const start = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      if (e.shiftKey) {
        const spaces = /^ {1,4}/.exec(ta.value.slice(start))?.[0].length ?? 0;
        if (spaces) {
          const caret = ta.selectionStart;
          ta.setSelectionRange(start, start + spaces);
          this.insert("");
          ta.setSelectionRange(Math.max(start, caret - spaces), Math.max(start, caret - spaces));
        }
      } else {
        this.insert("    ");
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const start = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      const line = ta.value.slice(start, ta.selectionStart);
      let indent = /^ */.exec(line)[0];
      if (/:\s*(#.*)?$/.test(line)) indent += "    ";
      this.insert("\n" + indent);
    }
  }
}

// ---------------------------------------------------------------------------
// Packets for the runs of programs of Vigil Core.

function hex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

const MAC_A = [0x02, 0x00, 0x00, 0x00, 0x00, 0x01];
const MAC_B = [0x02, 0x00, 0x00, 0x00, 0x00, 0x02];

/** An Ethernet frame with an IPv4 header and a UDP or TCP header. */
export function ipv4Packet({ protocol = 17, ttl = 64, sport = 40000, dport = 53, payload = 8 } = {}) {
  const l4 = protocol === 6 ? 20 : 8;
  const total = 20 + l4 + payload;
  const ip = [
    0x45, 0x00, total >> 8, total & 0xff, 0x12, 0x34, 0x40, 0x00,
    ttl, protocol, 0x00, 0x00, 10, 0, 0, 1, 10, 0, 0, 2,
  ];
  const ports = [sport >> 8, sport & 0xff, dport >> 8, dport & 0xff];
  const transport =
    protocol === 6
      ? [...ports, 0, 0, 0, 1, 0, 0, 0, 0, 0x50, 0x02, 0xfa, 0xf0, 0, 0, 0, 0]
      : [...ports, (l4 + payload) >> 8, (l4 + payload) & 0xff, 0, 0];
  return hex([...MAC_A, ...MAC_B, 0x08, 0x00, ...ip, ...transport, ...new Array(payload).fill(0x61)]);
}

/** Packets to run programs on; `key` names them (see i18n.js). */
export const PACKETS = [
  { key: "packet.dns", hex: () => ipv4Packet({ dport: 53 }) },
  { key: "packet.ntp", hex: () => ipv4Packet({ dport: 123 }) },
  { key: "packet.telnet", hex: () => ipv4Packet({ protocol: 6, dport: 23 }) },
  { key: "packet.ttl", hex: () => ipv4Packet({ ttl: 3, dport: 9999 }) },
  {
    key: "packet.arp",
    hex: () => hex([...MAC_A, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x08, 0x06, 0, 1, 8, 0, 6, 4, 0, 1]),
  },
  { key: "packet.ones", hex: () => hex(new Array(8).fill(0xff)) },
  { key: "packet.empty", hex: () => "" },
];

/** The code of a program as a link to the playground. */
export function playgroundLink(code, base = "playground.html") {
  const bytes = new TextEncoder().encode(code);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base}#code=${b64}`;
}

export function codeFromHash(hash = location.hash) {
  const m = /code=([\w-]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
