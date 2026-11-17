// The home page: highlighted snippets, and the "try it" box, which
// compiles a filter of Vigil Core in the browser and runs it on a packet.

import { Editor, PACKETS, compile, highlight, playgroundLink, run } from "./vigil.js";
import { mountSwitcher, onLangChange, t } from "./i18n.js";
import { EXAMPLES } from "./examples.js";

mountSwitcher();

for (const pre of document.querySelectorAll("pre.code[data-code]")) {
  const code = pre.textContent;
  pre.innerHTML = highlight(code);
  const link = document.querySelector(`[data-try="${pre.dataset.code}"]`);
  if (link) link.href = playgroundLink(code);
}

// The install command names the script of the site it is on, so that it
// stays right wherever the site is published.
const installCmd = document.getElementById("install-cmd");
installCmd.textContent = `curl -fsSL ${new URL("install.sh", location.href)} | sh`;
const installCopy = document.getElementById("install-copy");
installCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(installCmd.textContent);
    installCopy.dataset.done = "";
    setTimeout(() => delete installCopy.dataset.done, 1500);
  } catch {
    // Without access to the clipboard, select the command to copy by hand.
    getSelection().selectAllChildren(installCmd);
  }
});

const example = EXAMPLES.find((e) => e.id === "dns_drop");
const editor = new Editor(document.getElementById("try-editor"), {
  value: example.code,
  minLines: 16,
  onRun: go,
});

const select = document.getElementById("try-packet");
function labelPackets() {
  const value = select.value || String(example.packet);
  select.innerHTML = "";
  PACKETS.forEach((p, i) => select.add(new Option(t(p.key), i)));
  select.value = value;
}
labelPackets();

const output = document.getElementById("try-output");
const button = document.getElementById("try-run");
button.addEventListener("click", go);
select.addEventListener("change", go);

// The last run, to show it again in the other language.
let shown = null;
onLangChange(() => {
  labelPackets();
  editor.input.setAttribute("aria-label", t("editor.label"));
  if (shown) output.textContent = shown();
});

function show(f) {
  shown = f;
  output.textContent = f();
}

async function go() {
  button.disabled = true;
  show(() => t("home.compiling"));
  try {
    const source = editor.value;
    const result = await compile(source);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    editor.mark(errors.flatMap((d) => d.labels.filter((l) => l.primary).map((l) => [l.line, "error"])));
    if (!result.ok) {
      show(() => result.rendered || result.error);
      return;
    }
    const certified = result.certified.find((c) => c.ok);
    if (!certified) {
      show(() => t("home.notCore") + "\n\n" + (result.certified[0]?.error ?? ""));
      return;
    }
    const packet = PACKETS[Number(select.value)];
    const outcome = await run(source, certified.name, packet.hex());
    show(() =>
      outcome.ok
        ? `${certified.name}(${t(packet.key)}) → ${outcome.verdict}\n` +
          t("home.result", certified.insns, outcome.steps, result.time.toFixed(0))
        : outcome.error,
    );
  } catch (e) {
    show(() => t("load.failed") + "\n" + e);
  } finally {
    button.disabled = false;
  }
}
