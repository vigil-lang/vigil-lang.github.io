#!/bin/sh
# Installs the Vigil compiler, `vigil`, from the binaries of the GitHub
# releases of its repository:
#
#     curl -fsSL https://vigil-lang.github.io/install.sh | sh
#
# The standard library is built into the binary, so the install is one
# file.  Settings, as environment variables:
#
#     VIGIL_VERSION       a release tag (`v0.1.0`); the latest one by default
#     VIGIL_INSTALL_DIR   where to put `vigil`; `~/.local/bin` by default
#     VIGIL_DOWNLOAD_URL  where the archives are, instead of the releases
#
# clang 15 or newer is needed only to build eBPF objects through LLVM; the
# certified backend (`vigil build --certified`) and `--emit ir` do without.
#
# Everything is in functions, called on the last line: a download cut short
# runs nothing.

set -eu

REPO="vigil-lang/vigil"
STD_REPO="vigil-lang/std"

say() {
    printf 'vigil-install: %s\n' "$*" >&2
}

die() {
    say "error: $*"
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || die "needs \`$1\`"
}

# The Rust target of the binary for this machine.
target() {
    os=$(uname -s)
    arch=$(uname -m)
    case "$arch" in
        x86_64 | amd64) arch=x86_64 ;;
        aarch64 | arm64) arch=aarch64 ;;
        *) die "no binary for the architecture $arch; build from source: $(from_source)" ;;
    esac
    case "$os" in
        Linux) echo "$arch-unknown-linux-musl" ;;
        Darwin) echo "$arch-apple-darwin" ;;
        # Git Bash, MSYS2 or Cygwin: the binary for Windows is a zip,
        # installed by the PowerShell script
        MINGW* | MSYS* | CYGWIN*)
            die "on Windows, install from PowerShell: irm https://vigil-lang.github.io/install.ps1 | iex" ;;
        *) die "no binary for $os; build from source: $(from_source)" ;;
    esac
}

# The compiler embeds the standard library from `../std`, a repository of
# its own, so the two are cloned side by side.
from_source() {
    echo "git clone https://github.com/$REPO compiler && git clone https://github.com/$STD_REPO std && cargo install --path compiler/crates/vigil-cli"
}

download() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --proto '=https,http' -o "$2" "$1"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$2" "$1"
    else
        die "needs \`curl\` or \`wget\`"
    fi
}

sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d ' ' -f 1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d ' ' -f 1
    else
        die "needs \`sha256sum\` or \`shasum\` to check the download"
    fi
}

main() {
    need uname
    need tar
    target=$(target)
    version=${VIGIL_VERSION:-latest}
    if [ -n "${VIGIL_DOWNLOAD_URL:-}" ]; then
        base=$VIGIL_DOWNLOAD_URL
    elif [ "$version" = latest ]; then
        base="https://github.com/$REPO/releases/latest/download"
    else
        base="https://github.com/$REPO/releases/download/$version"
    fi
    dir=${VIGIL_INSTALL_DIR:-$HOME/.local/bin}
    archive="vigil-$target.tar.gz"

    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT INT TERM

    say "downloading $archive ($version)"
    download "$base/$archive" "$tmp/$archive" ||
        die "could not download $base/$archive"
    download "$base/$archive.sha256" "$tmp/$archive.sha256" ||
        die "could not download $base/$archive.sha256"
    expected=$(cut -d ' ' -f 1 <"$tmp/$archive.sha256")
    actual=$(sha256 "$tmp/$archive")
    [ "$expected" = "$actual" ] ||
        die "the checksum of $archive does not match (expected $expected, got $actual)"

    tar -xzf "$tmp/$archive" -C "$tmp"
    [ -f "$tmp/vigil" ] || die "$archive has no \`vigil\`"
    mkdir -p "$dir"
    # Through a temporary name in the same directory, so that a `vigil`
    # already there is replaced at once, never left half written.
    cp "$tmp/vigil" "$dir/.vigil.new"
    chmod 755 "$dir/.vigil.new"
    mv -f "$dir/.vigil.new" "$dir/vigil"

    say "installed $("$dir/vigil" --version) in $dir"
    case ":$PATH:" in
        *":$dir:"*) ;;
        *) say "$dir is not in PATH; add it, e.g.: export PATH=\"$dir:\$PATH\"" ;;
    esac
    if ! command -v "${VIGIL_CLANG:-clang}" >/dev/null 2>&1; then
        say "clang not found: needed only for \`vigil build\` to objects through LLVM"
    fi
}

main "$@"
