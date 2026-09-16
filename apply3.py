#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LocaRide - indice di ombreggiatura (rilievi + bosco + esposizione, mese per mese).

Uso, dalla radice del repo:   python3 apply3.py   (oppure --check)

  1. index.html            -> js/sunexposure.js sostituito da js/shadeindex.js
  2. index.html            -> CSS della cella ombra (il vecchio .sunx puo' restare)
  3. osm-expand.yml        -> due comandi osmium estraggono il bosco dal PBF gia'
                              scaricato, poi build_shade.mjs. Step PROTETTO: se
                              fallisce non intacca il build dei passi.
  4. js/sunexposure.js     -> rimosso (sostituito da shadeindex.js)

js/panel.js NON viene toccato: shadeindex.js espone gli stessi sunCellStub() e
renderSunCells() che panel.js gia' chiama.
"""
import io, os, re, sys, time

CHECK = "--check" in sys.argv
CHANGES, WRITES, REMOVE = [], {}, []

CSS = """
/* --- indice di ombra (js/shadeindex.js) --- */
.shx{line-height:1.25;text-align:center}
.shx-h{font-weight:700;font-size:1.02rem}
.shx-w{font-size:.73rem;color:var(--txt);font-weight:600}
.shx-sub{font-size:.68rem;color:var(--txt2);margin-top:1px}
.shx-yr{display:flex;gap:1px;align-items:flex-end;justify-content:center;height:17px;margin-top:5px}
.shx-yr i{display:block;width:4px;border-radius:1px;opacity:.55}
.shx-yr i.on{opacity:1;outline:1px solid var(--txt2);outline-offset:1px}
.shx-wait,.shx-na{color:var(--txt2);font-size:.78rem}
"""

YML_STEP = """
      # --- bosco -> indice di ombra (aggiunta, non blocca il build dei passi) ---
      - name: Ombra (bosco + rilievi)
        continue-on-error: true
        run: |
          set +e
          # l'output 'pbf' e' un URL: qui serve il file gia' scaricato nel job.
          # Prendo il .osm.pbf piu' grande presente (se sono stati uniti, e' il merge).
          PBF_ONE=$(ls -S *.osm.pbf /tmp/*.osm.pbf 2>/dev/null | head -1)
          if [ -z "$PBF_ONE" ]; then echo "nessun PBF locale: salto l'ombra"; exit 0; fi
          echo "bosco da: $PBF_ONE"
          osmium tags-filter "$PBF_ONE" wa/landuse=forest wa/natural=wood wa/landcover=trees \\
            -o /tmp/forest.pbf --overwrite || exit 0
          osmium export /tmp/forest.pbf -f geojsonseq --geometry-types=polygon \\
            -o /tmp/forest.geojsonseq --overwrite || exit 0
          node scripts/build_shade.mjs --forest /tmp/forest.geojsonseq \\
            --passes "data/${{ steps.__ID__.outputs.out }}" --minutes 60 || true
          rm -f /tmp/forest.pbf /tmp/forest.geojsonseq
"""


def die(msg, detail=""):
    print("\nSTOP: " + msg)
    if detail:
        print(detail)
    print("\nNiente e' stato scritto.")
    sys.exit(2)


def read(p):
    if not os.path.exists(p):
        die("non trovo " + p + ". Sei nella radice del repo?")
    return io.open(p, encoding="utf-8", newline="").read()


def do_index():
    p = "index.html"
    s = read(p)
    orig = s
    ver = str(int(time.time()))

    if "js/shadeindex.js" in s:
        print("  = script tag gia' aggiornato")
    else:
        m = re.search(r'[ \t]*<script[^>]*src="js/sunexposure\.js[^"]*"[^>]*>\s*</script>\n?', s)
        if not m:
            die("non trovo il tag di js/sunexposure.js in index.html",
                "Mandami:  grep -n 'sunexposure' index.html")
        indent = re.match(r"[ \t]*", m.group(0)).group(0)
        s = s[:m.start()] + indent + '<script src="js/shadeindex.js?v=' + ver + '"></script>\n' + s[m.end():]
        CHANGES.append((p, "js/sunexposure.js -> js/shadeindex.js"))

    if ".shx-yr" in s:
        print("  = CSS ombra gia' presente")
    else:
        k = s.rfind("</style>")
        if k < 0:
            die("non trovo </style> in index.html")
        s = s[:k] + CSS + s[k:]
        CHANGES.append((p, "aggiunto CSS della cella ombra"))

    if s != orig:
        WRITES[p] = s


def do_workflow():
    p = os.path.join(".github", "workflows", "osm-expand.yml")
    if not os.path.exists(p):
        print("  ! " + p + " non trovato: salto lo step CI (potrai aggiungerlo a mano)")
        return
    s = read(p)
    if "build_shade.mjs" in s:
        print("  = step ombra gia' nel workflow")
        return
    # quale step espone "out=..."? Lo ricavo dal file invece di indovinarlo.
    sid = None
    for m in re.finditer(r"^[ \t]*id:[ \t]*([A-Za-z0-9_-]+)[ \t]*$", s, re.M):
        tail = s[m.end():m.end() + 6000]
        nxt = re.search(r"^[ \t]*- name:", tail, re.M)
        if "out=osm_passes" in (tail[:nxt.start()] if nxt else tail):
            sid = m.group(1); break
    if not sid:
        die("non capisco quale step produca l'output 'out'",
            "Mandami:  grep -n 'id:' .github/workflows/osm-expand.yml")
    print("  step che risolve il target: id '" + sid + "'")
    step = YML_STEP.replace("__ID__", sid)

    # inserisce PRIMA dello step che committa, cosi' shade.json entra nello stesso commit
    m = None
    for pat in (r"\n[ \t]*- name: [^\n]*[Cc]ommit[^\n]*\n", r"\n[ \t]*- name: [^\n]*[Pp]ush[^\n]*\n",
                r"\n[ \t]*- name: [^\n]*[Mm]anifest[^\n]*\n"):
        m = re.search(pat, s)
        if m:
            break
    if m:
        s = s[:m.start()] + "\n" + step.rstrip("\n") + "\n" + s[m.start():]
    else:
        print("  ! nessuno step di commit riconosciuto: metto l'ombra in fondo al job")
        s = s.rstrip("\n") + "\n" + step.rstrip("\n") + "\n"
    CHANGES.append((p, "aggiunto step 'Ombra' prima del commit (continue-on-error)"))
    WRITES[p] = s


def main():
    if not os.path.isdir(".git"):
        die("questa non sembra la radice del repo")
    for f in ("js/shadeindex.js", "scripts/build_shade.mjs"):
        if not os.path.exists(f):
            die("manca " + f, "Scompatta lo zip nella radice del repo prima di lanciare apply3.py.")
    print("File nuovi: presenti.")
    print("Controllo index.html ...")
    do_index()
    print("Controllo .github/workflows/osm-expand.yml ...")
    do_workflow()
    if os.path.exists("js/sunexposure.js"):
        REMOVE.append("js/sunexposure.js")

    if not CHANGES and not REMOVE:
        print("\nTutto gia' applicato.")
        return
    print("\nModifiche:")
    for f, d in CHANGES:
        print("  - " + f + ": " + d)
    for f in REMOVE:
        print("  - rimuovo " + f + " (sostituito da js/shadeindex.js)")
    if CHECK:
        print("\n(--check) Niente scritto.")
        return
    for f, c in WRITES.items():
        io.open(f, "w", encoding="utf-8", newline="").write(c)
    for f in REMOVE:
        os.remove(f)
    print("\nApplicato.")


if __name__ == "__main__":
    main()
