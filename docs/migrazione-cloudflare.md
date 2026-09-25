# Migrazione di locaride.app su Cloudflare — guida passo passo

**Obiettivo:** stesso sito, servito da Cloudflare invece che da GitHub Pages.
Il repo, le Actions, i bot e il golden set **restano su GitHub, identici**. Cambia solo chi
consegna i file ai visitatori.

**Principio:** zero downtime e sempre una via di ritorno. GitHub Pages resta acceso finché
Cloudflare non ha funzionato per una settimana.

| Fase | Cosa | Tempo | Rischio |
|---|---|---|---|
| A | Prepara il repo | 10 min | nullo |
| B | Crea il sito Cloudflare e provalo su un indirizzo di test | 20 min | nullo |
| C | Sposta il dominio locaride.app | 30 min + attesa DNS | basso, reversibile |
| D | Pulizia | 5 min, dopo 1 settimana | nullo |
| E | Beta privata protetta | 20 min | nullo |

---

## Fase A — Prepara il repo (Codespaces)

- [x] **A1. Dimensioni dei file: verificato ✅** (Cloudflare accetta file fino a 25 MB).
  Il più grande è `data/osm_passes.json` con **14 MB** (poi fr 7.0, es_n 6.2, sud 5.6,
  fr_ra 4.8). Il nuovo test `test/asset-size.test.mjs` avvisa da 20 MB e blocca a 24 MB,
  così un'espansione futura non rompe il deploy senza preavviso.
- [ ] **A2. Copia nella root del repo** i file dello zip: `wrangler.jsonc`, `.assetsignore`,
  `_headers`, `cf/worker.js`, più `test/asset-size.test.mjs` (i file che iniziano con il punto: usa il terminale, non il browser).
- [ ] **A3. Pubblica:**
  ```bash
  git add wrangler.jsonc .assetsignore _headers cf/worker.js test/asset-size.test.mjs
  node --test "test/*.test.mjs"   # deve essere tutto verde
  git commit -m "cloudflare: static assets config"
  git push
  ```
  GitHub Pages ignora questi file: il sito attuale non cambia.

## Fase B — Crea il sito su Cloudflare e provalo

- [ ] **B1.** Vai su **dash.cloudflare.com** → registrati (piano **Free**, nessuna carta).
- [ ] **B2.** Menu a sinistra **Workers & Pages** → **Create** → **Import a repository**
  (Workers). Collega GitHub e autorizza **solo** il repo `EbbeneTriglav/LocaClimb`.
- [ ] **B3.** Impostazioni del progetto:
  - Project name: `locaride`
  - Production branch: `main`
  - Build command: **vuoto**
  - Deploy command: lascia quello proposto (`npx wrangler deploy`)
  - Root directory: `/`
  - Builds per i branch non di produzione / preview: **disattivale**. Le prove le fai sulla
    beta privata (Fase E), che è protetta; le anteprime sarebbero raggiungibili da chiunque abbia il link.
- [ ] **B4.** **Deploy.** Dopo circa 1 minuto ottieni un indirizzo tipo
  `https://locaride.<tuo-nome>.workers.dev`.
- [ ] **B5. Login Google sul nuovo indirizzo:** Firebase Console → Authentication →
  Settings → **Authorized domains** → Add → incolla `locaride.<tuo-nome>.workers.dev`.
- [ ] **B6. Collaudo sull'indirizzo di test** (telefono e PC):
  - [ ] mappa, marker e passi OSM compaiono
  - [ ] ricerca "Stelvio" → pannello con versanti e profilo
  - [ ] meteo del giro, fontanelle, route builder, GPX
  - [ ] **Accedi con Google** funziona
  - [ ] DevTools → Network → un file `data/…json` → nelle intestazioni della risposta
    c'è `strict-transport-security` (prova che `_headers` è attivo)
  - [ ] DevTools → Console: eventuali righe "Content-Security-Policy-Report-Only"
    **mandamele** (non bloccano nulla, servono a stringere la sicurezza dopo)

Se qualcosa non va, **fermati qui**: il sito vero è ancora intatto su GitHub Pages.

## Fase C — Sposta il dominio

**C1. Registrar: Porkbun.** Il dominio resta registrato e pagato su Porkbun: cambi solo
i nameserver, cioè chi risponde per il DNS.

- [ ] **C2.** Cloudflare → **Add a domain** → `locaride.app` → piano **Free**.
  Cloudflare copia i record DNS attuali. **Controlla che ci siano quelli di GitHub Pages**
  (record `A` verso `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`, oppure un
  `CNAME` verso `ebbenetriglav.github.io`). Imposta questi record su **DNS only**
  (nuvola grigia), così GitHub Pages continua a funzionare identico.
- [ ] **C3. Su Porkbun** (dove hai comprato il dominio):
  1. **porkbun.com** → login → **Domain Management** → riga `locaride.app` → **Details**.
  2. **DNSSEC:** se risulta attivo, **disattivalo prima** (cancella i record DS).
     Altrimenti, al cambio di nameserver, il dominio smette di rispondere.
  3. **Authoritative Nameservers** → **Edit** → cancella i nameserver di Porkbun
     (`*.porkbun.com`) → incolla i **2 nameserver di Cloudflare** → **Submit**.
  4. Attendi la mail di Cloudflare "domain is now active" (di solito meno di 1 ora, massimo 24 h).
     Nel frattempo il sito continua a funzionare da GitHub Pages.
  5. *(Opzionale, dopo la fase D)* puoi riattivare DNSSEC da Cloudflare → DNS → Settings,
     copiando il record DS su Porkbun.

- [ ] **C4. Il passaggio vero (1–2 minuti di possibile interruzione):**
  1. Cloudflare → **DNS** → cancella i record `A`/`CNAME` di GitHub Pages per
     `locaride.app` (e `www` se c'è). **Fai prima uno screenshot**: servono per tornare indietro.
  2. **Workers & Pages** → `locaride` → **Settings** → **Domains & Routes** → **Add** →
     **Custom domain** → `locaride.app`. Ripeti per `www.locaride.app` se lo usi.
  3. Attendi il certificato (di solito pochi minuti).
- [ ] **C5. Verifica** su https://locaride.app: stesso collaudo della B6, compreso il login
  Google (`locaride.app` è già tra i domini autorizzati di Firebase).

- [ ] **C6. Login Google "di prima parte" (il motivo vero per cui conviene Cloudflare).**
  Oggi il login su telefono passa da `locaride-ce1ad.firebaseapp.com`, un dominio diverso dal
  sito: Safari/iOS e i browser che isolano lo storage di terze parti possono perdere il
  risultato del redirect (sembri non loggato). `cf/worker.js` serve `/__/auth/*` da
  `locaride.app` stesso. Da fare SOLO dopo C5, in quest'ordine:
  1. Verifica il proxy: apri `https://locaride.app/__/auth/handler` → deve comparire una
     pagina Firebase (anche vuota o con errore "missing parameters"), non un 404.
  2. Google Cloud Console → progetto `locaride-ce1ad` → **APIs & Services → Credentials** →
     client OAuth "Web client (auto created by Google Service)" → **Authorized redirect URIs**
     → aggiungi `https://locaride.app/__/auth/handler` → Save.
  3. Nel repo, `js/state.js`: l'authDomain diventa condizionale (fuori da locaride.app, es. la
     beta o workers.dev, resta quello di Firebase):
     ```bash
     sed -i 's#authDomain:"locaride-ce1ad.firebaseapp.com"#authDomain:(location.hostname==="locaride.app"?"locaride.app":"locaride-ce1ad.firebaseapp.com")#' js/state.js
     grep -c 'location.hostname==="locaride.app"' js/state.js   # deve stampare 1
     ```
     poi bump di `?v=` e push. Prova il login da iPhone (Safari) e Android.
  **Tornare indietro:** ripristina la riga di `state.js`; il proxy non dà fastidio.

**Tornare indietro (se serve):** togli il custom domain dal Worker e ricrea i record dello
screenshot (DNS only). GitHub Pages è ancora configurato, quindi il sito torna com'era in pochi minuti.

## Fase D — Pulizia (dopo 7 giorni senza problemi)

- [ ] **D1.** GitHub → Settings → **Pages** → rimuovi il custom domain e disattiva Pages.
  Le **Actions continuano a funzionare** (bot news, enrich, build OSM, test, agenti).
- [ ] **D2.** Se nel repo c'è un file `CNAME`, cancellalo (commit).
- [ ] **D3.** Firebase → Authorized domains: rimuovi il vecchio `*.github.io`.
- [ ] **D4.** Mandami le righe CSP raccolte: passiamo la CSP da "report-only" a "enforced".

## Fase E — La tua versione privata: beta.locaride.app (dopo C)

Una seconda copia dell'app che vedi **solo tu**, dove finiscono le modifiche degli agenti prima
di arrivare agli utenti.

- [ ] **E1.** Nel repo crea il branch `beta`: GitHub → Branches → New branch → `beta` (da `main`).
- [ ] **E2.** Cloudflare → Workers & Pages → Create → **Import a repository** → stesso repo:
  - Project name: `locaride-beta`
  - Production branch: **`beta`**
  - Deploy command: `npx wrangler deploy --name locaride-beta`
  - Builds per altri branch / preview: **disattivate**
- [ ] **E3.** `locaride-beta` → Settings → Domains & Routes → Custom domain → `beta.locaride.app`.
- [ ] **E4. Il lucchetto (Cloudflare Access, gratis):** Cloudflare → **Zero Trust** (la prima
  volta scegli il piano Free) → Access → **Applications** → Add → **Self-hosted**:
  - Domain: `beta.locaride.app`
  - Policy: Action **Allow** → Include **Emails** → la tua email
  - Metodo di accesso: **One-time PIN** (ti arriva un codice via mail)
  Prova: in una finestra anonima `beta.locaride.app` deve chiederti l'email.
- [ ] **E5.** Firebase → Authorized domains → aggiungi `beta.locaride.app`.
  ⚠️ Beta e produzione usano **lo stesso Firebase**: recensioni o voti di prova finiscono
  nei dati reali. Cancellali dopo il test, oppure più avanti creiamo un Firebase separato.

**Come la usi:** le PR verdi dell'agente finiscono in beta **da sole**. Per provare un'altra
PR metti l'etichetta **`beta`** (lo fa `beta-deploy.yml`). Se ti convince fai merge su `main`,
e da lì va in produzione.

## Cosa cambia per te, in pratica

| Prima | Dopo |
|---|---|
| push su `main` → GitHub Pages pubblica | push su `main` → Cloudflare pubblica (~1 min) |
| nessun controllo sugli header | `_headers`: HSTS, anti-sniffing, CSP |
| cache fissa, uguale per tutto | dati sempre rivalidati, JS con cache di 5 min |
| nessuna anteprima | beta privata `beta.locaride.app` protetta da Access |

**Non cambiano:** repo, Codespaces, Actions, golden set, Firebase, costi (0 €).
