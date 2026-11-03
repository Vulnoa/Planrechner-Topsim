#!/usr/bin/env bash
# Prüft, dass die mitgelieferten Bibliotheken in vendor/ byte-genau den offiziellen
# Paketen aus dem npm-Register entsprechen (keine Veränderung, kein eingeschleuster Code).
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
check() { # paket@version  pfad-im-paket  datei-in-vendor
  local pkg=$1 inner=$2 file=$3
  (cd "$tmp" && npm pack --silent "$pkg" >/dev/null)
  local tgz; tgz=$(ls "$tmp"/*.tgz | head -1)
  mkdir -p "$tmp/x" && tar -xzf "$tgz" -C "$tmp/x"
  local a b; a=$(sha256sum "$tmp/x/package/$inner" | cut -d' ' -f1); b=$(sha256sum "vendor/$file" | cut -d' ' -f1)
  rm -rf "$tmp/x" "$tgz"
  if [ "$a" = "$b" ]; then echo "OK      $file  =  $pkg/$inner"; else echo "FEHLER  $file weicht von $pkg/$inner ab"; exit 1; fi
}
check jspdf@2.5.1            dist/jspdf.umd.min.js               jspdf.umd.min.js
check jspdf-autotable@3.8.2  dist/jspdf.plugin.autotable.min.js  jspdf.plugin.autotable.min.js
check jszip@3.10.1           dist/jszip.min.js                   jszip.min.js
check pdfjs-dist@3.11.174    build/pdf.min.js                    pdf.min.js
check pdfjs-dist@3.11.174    build/pdf.worker.min.js             pdf.worker.min.js
(cd vendor && sha256sum -c CHECKSUMS.sha256 --quiet) && echo "OK      vendor/CHECKSUMS.sha256 stimmt"
