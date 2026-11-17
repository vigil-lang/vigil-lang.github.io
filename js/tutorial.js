// The tutorial: highlighted examples that open in the playground, and a
// table of contents that follows the reading.

import { highlight, playgroundLink } from "./vigil.js";
import { mountSwitcher, onLangChange, t } from "./i18n.js";

mountSwitcher();

const links = [];
for (const pre of document.querySelectorAll("pre.code[data-try]")) {
  const code = pre.textContent;
  pre.innerHTML = highlight(code);
  const a = document.createElement("a");
  a.className = "try-link";
  a.href = playgroundLink(code);
  a.textContent = t("try");
  pre.prepend(a);
  links.push(a);
}
onLangChange(() => links.forEach((a) => (a.textContent = t("try"))));

// The table of contents: the h2 of the article, both languages in each
// entry (CSS shows the current one).
const toc = document.getElementById("toc");
const headings = [...document.querySelectorAll("article h2[id]")];
for (const h of headings) {
  const li = document.createElement("li");
  li.innerHTML = `<a href="#${h.id}">${h.innerHTML}</a>`;
  toc.append(li);
}

const entries = new Map([...toc.querySelectorAll("a")].map((a) => [a.getAttribute("href").slice(1), a]));
const observer = new IntersectionObserver(
  (items) => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      for (const a of entries.values()) a.classList.remove("active");
      entries.get(item.target.id)?.classList.add("active");
    }
  },
  { rootMargin: "-80px 0px -70% 0px" },
);
headings.forEach((h) => observer.observe(h));
