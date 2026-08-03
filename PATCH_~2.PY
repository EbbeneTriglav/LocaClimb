#!/usr/bin/env python3
"""
LocaRide - fa entrare nel grafo le strade che attraversano i paesi.

Da eseguire UNA VOLTA dalla radice del repo:
    python3 patch_residential.py

IL PROBLEMA
`HW_KEEP` decide quali strade entrano nell'estratto OSM. Oggi contiene solo le
classificazioni "di collegamento" (primary/secondary/tertiary/unclassified/trunk):
manca `residential`, cioe' la strada interna ai paesi.

Su una salita alpina italiana non si nota, perche' la SS/SP mantiene la sua
classificazione anche dentro l'abitato. Ma dove la strada attraversa un paese ed
e' mappata come `residential` - tipico dei paesi di montagna austriaci e delle
localita' sciistiche - il grafo SI SPEZZA li'.

E' esattamente cio' che succede al Passo Rombo: la BFS scende dalla cima lungo la
strada a pedaggio e si ferma prima di Obergurgl; Zwieselstein e Solden restano
irraggiungibili e il versante austriaco non viene mai calcolato.

Indizio nel codice stesso: HWRANK assegna gia' un punteggio a residential,
living_street, track e service - tipi che HW_KEEP non fa mai entrare.

COSA AGGIUNGE
  residential    strada interna ai paesi (la causa del problema)
  living_street  zona residenziale a traffico moderato, usata in alcuni centri alpini
  road           classificazione non ancora definita dal mappatore

NON aggiunge `service` (parcheggi, accessi privati) ne' `track` (sterrate agricole):
gonfierebbero il grafo senza aggiungere salite vere.

ATTENZIONE ALLA MEMORIA
Le strade residenziali sono numerose: l'estratto filtrato cresce. Conviene provare
prima su una zona di CONFINE (bbox piccolo) e guardare tempi e memoria, poi
estendere ai target nazionali.

Lo script e' idempotente: se la modifica c'e' gia', lo dice e non tocca nulla.
"""
import io, os, re, sys

F = os.path.join("scripts", "build_osm_passes.mjs")

OLD = ('const HW_KEEP = ["primary","primary_link","secondary","secondary_link",'
       '"tertiary","tertiary_link","unclassified","unclassified_link","trunk","trunk_link"];')
NEW = ('const HW_KEEP = ["primary","primary_link","secondary","secondary_link",'
       '"tertiary","tertiary_link","unclassified","unclassified_link","trunk","trunk_link",'
       '"residential","living_street","road"];')

def main():
    if not os.path.exists(F):
        print("ERRORE: non trovo " + F + ". Esegui lo script dalla radice del repo.")
        sys.exit(1)
    s = io.open(F, encoding="utf-8", newline="").read()

    if '"residential"' in s and "const HW_KEEP" in s and '"residential","living_street","road"' in s:
        print("Gia' applicato: HW_KEEP contiene gia' residential.")
        return

    if OLD in s:
        s = s.replace(OLD, NEW, 1)
    else:
        # tollera differenze di spaziatura: sostituisce la riga intera
        m = re.search(r'^const HW_KEEP = \[.*?\];$', s, re.M)
        if not m:
            print("ERRORE: non trovo la riga HW_KEEP.")
            sys.exit(2)
        if '"residential"' in m.group(0):
            print("Gia' applicato.")
            return
        s = s[:m.start()] + NEW + s[m.end():]

    io.open(F, "w", encoding="utf-8", newline="").write(s)
    print("Applicato: HW_KEEP ora include residential, living_street, road.")
    print("\nRicorda: NON e' stato alzato ALGO_VERSION, quindi i passi gia' calcolati")
    print("non vengono rigenerati. La modifica vale per le zone che ricostruirai.")

if __name__ == "__main__":
    main()
