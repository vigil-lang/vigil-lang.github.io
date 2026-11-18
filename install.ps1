# Installs the Vigil compiler, `vigil.exe`, on Windows, from the binaries
# of the GitHub releases of its repository:
#
#     irm https://vigil-lang.github.io/install.ps1 | iex
#
# The standard library is built into the binary, so the install is one
# file, put in a directory of the user (no administrator needed) that is
# added to the user's PATH.  Settings, as environment variables:
#
#     VIGIL_VERSION       a release tag (`v0.1.0`); the latest one by default
#     VIGIL_INSTALL_DIR   where to put `vigil.exe`;
#                         `%LOCALAPPDATA%\Programs\vigil` by default
#     VIGIL_DOWNLOAD_URL  where the archives are, instead of the releases
#
# clang 15 or newer is needed only to build eBPF objects through LLVM
# (`winget install LLVM.LLVM`); the certified backend
# (`vigil build --certified`) and `--emit ir` do without.
#
# Everything is in a function, called on the last line: a download cut
# short runs nothing.

function Install-Vigil {
    $ErrorActionPreference = 'Stop'
    # Windows PowerShell 5 shows a progress bar that makes downloads slow
    $ProgressPreference = 'SilentlyContinue'
    $repo = 'vigil-lang/vigil'

    function Say($text) { [Console]::Error.WriteLine("vigil-install: $text") }
    function Fail($text) {
        Say "error: $text"
        throw "vigil-install: $text"
    }

    # the architecture of the system, not of this PowerShell: a 32-bit or
    # emulated PowerShell gives its own in PROCESSOR_ARCHITECTURE
    $arch = $env:PROCESSOR_ARCHITEW6432
    if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
    switch ($arch) {
        'AMD64' { $target = 'x86_64-pc-windows-msvc' }
        'ARM64' { $target = 'aarch64-pc-windows-msvc' }
        default {
            Fail ("no binary for the architecture $arch; build from source: " +
                "git clone https://github.com/$repo compiler; " +
                "git clone https://github.com/vigil-lang/std std; " +
                "cargo install --path compiler/crates/vigil-cli")
        }
    }

    $version = if ($env:VIGIL_VERSION) { $env:VIGIL_VERSION } else { 'latest' }
    if ($env:VIGIL_DOWNLOAD_URL) {
        $base = $env:VIGIL_DOWNLOAD_URL.TrimEnd('/')
    } elseif ($version -eq 'latest') {
        $base = "https://github.com/$repo/releases/latest/download"
    } else {
        $base = "https://github.com/$repo/releases/download/$version"
    }
    $dir = if ($env:VIGIL_INSTALL_DIR) {
        $env:VIGIL_INSTALL_DIR
    } else {
        Join-Path $env:LOCALAPPDATA 'Programs\vigil'
    }
    $archive = "vigil-$target.zip"

    # older Windows PowerShell may not offer TLS 1.2 by default
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("vigil-install-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        Say "downloading $archive ($version)"
        foreach ($file in @($archive, "$archive.sha256")) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri "$base/$file" -OutFile (Join-Path $tmp $file)
            } catch {
                Fail "could not download $base/$file"
            }
        }
        $expected = ((Get-Content -Raw (Join-Path $tmp "$archive.sha256")).Trim() -split '\s+')[0].ToLower()
        $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $archive)).Hash.ToLower()
        if ($expected -ne $actual) {
            Fail "the checksum of $archive does not match (expected $expected, got $actual)"
        }

        Expand-Archive -Path (Join-Path $tmp $archive) -DestinationPath $tmp -Force
        $exe = Join-Path $tmp 'vigil.exe'
        if (-not (Test-Path $exe)) { Fail "$archive has no vigil.exe" }
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        # through a temporary name in the same directory, so that a
        # `vigil.exe` already there is replaced at once, never half written
        $new = Join-Path $dir '.vigil.new.exe'
        Copy-Item $exe $new -Force
        Move-Item $new (Join-Path $dir 'vigil.exe') -Force
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }

    $installed = & (Join-Path $dir 'vigil.exe') --version 2>$null
    if (-not $installed) { $installed = 'vigil.exe' }
    Say "installed $installed in $dir"

    # the user's PATH, kept in the registry, and this session's
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    if ($entries -notcontains $dir) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $dir) -join ';'), 'User')
        Say "added $dir to the user's PATH; open a new terminal to use vigil"
    }
    if (($env:Path -split ';') -notcontains $dir) {
        $env:Path = "$env:Path;$dir"
    }

    $clang = if ($env:VIGIL_CLANG) { $env:VIGIL_CLANG } else { 'clang' }
    if (-not (Get-Command $clang -ErrorAction SilentlyContinue)) {
        Say 'clang not found: needed only for `vigil build` to objects through LLVM (winget install LLVM.LLVM)'
    }
}

Install-Vigil
