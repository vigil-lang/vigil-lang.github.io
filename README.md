# The Vigil website

A static site, in Portuguese and English (the PT/EN switch in the header; the
choice is remembered, and `?lang=pt` or `?lang=en` in a URL sets it):

- `index.html`: the home page, with a "try it" box that compiles and runs a
  filter in the browser;
- `tutorial.html`: a tutorial of the language, each example opening in the
  playground;
- `playground.html`: an editor with diagnostics, programs and maps, LLVM IR,
  the eBPF code of the certified backend, and runs on packets.

`pkg/` holds the compiler in WebAssembly, built by `../compiler/build-wasm.sh`.
The site needs no build step and no external resources, but WebAssembly must
be served over HTTP:

```sh
python3 -m http.server -d page 8000    # http://localhost:8000
```

| File | |
|---|---|
| `js/vigil.js` | loading the compiler, syntax highlighting, the editor, test packets |
| `js/i18n.js` | languages: the texts made by scripts, and the PT/EN switch |
| `js/examples.js` | the examples of the playground |
| `js/home.js`, `js/playground.js`, `js/tutorial.js` | the scripts of each page |
| `css/style.css` | the styles (light and dark) |

Static text is written in both languages in the HTML (`data-lang="pt"` and
`data-lang="en"`); CSS shows the one of `<html data-ui-lang>`.

## Publishing

This is `vigil-lang/vigil-lang.github.io`, published on GitHub Pages by
`.github/workflows/pages.yml`: the workflow clones `vigil-lang/vigil` (its
latest release) into `../compiler` and `vigil-lang/std` (the `std.ref` of that
compiler) into `../std`, builds `pkg/`, and publishes this directory.
`pkg/` is not versioned. `install.sh` (Linux, macOS) and `install.ps1`
(Windows) are the install scripts, served at
`https://vigil-lang.github.io/install.sh` and `.../install.ps1`; they
download the binaries of the releases of `vigil-lang/vigil`. The home page
shows the command of the visitor's system first.
