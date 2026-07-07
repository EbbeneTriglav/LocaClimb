/* In-app map-based climb editor (admin/community): draw a versante, snap to road, save to manual_overrides.json. */
/* Shared inline-input styles, reused across the editor form sections (edOpen + the admin
   save sections) - extracted to avoid repeating the same ~90-char style string 9x. */
var ED_FW="width:100%;box-sizing:border-box;padding:5px;margin-bottom:4px;border:1px solid #ccc;border-radius:6px";
var ED_FH="width:50%;box-sizing:border-box;padding:5px;border:1px solid #ccc;border-radius:6px";
function isAdmin(){return /admin/.test(location.hash)||/admin/.test(location.search);}
function edClick(e){
  if(ED._await){ED.summit={lat:e.latlng.lat,lon:e.latlng.lng};ED._await=false;if(ED._sm)map.removeLayer(ED._sm);ED._sm=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);edMsg("Cima impostata. Etichetta il versante e premi Disegna.");return;}
  if(edDraw)edAddPoint(e.latlng.lat,e.latlng.lng);
}
function edMakeMarker(p){
  var dot=L.divIcon({className:"",html:'<div style="width:14px;height:14px;border-radius:50%;background:#e11;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.6)"></div>',iconSize:[14,14],iconAnchor:[7,7]});
  var m=L.marker([p.lat,p.lon],{draggable:true,icon:dot});
  m.on("dragend",function(){var ll=m.getLatLng(),i=ED.markers.indexOf(m);if(i>=0)ED.track[i]={lat:ll.lat,lon:ll.lng};edRedraw();edStale();});
  m.on("contextmenu",function(e){if(e&&e.originalEvent)L.DomEvent.stop(e.originalEvent);var i=ED.markers.indexOf(m);if(i>=0)ED.track.splice(i,1);edRebuild();edRedraw();edStale();});
  m.addTo(map);return m;
}
function edRebuild(){ED.markers.forEach(function(m){map.removeLayer(m);});ED.markers=ED.track.map(function(p){return edMakeMarker(p);});}
function edBestInsert(p){ // insert a new point at the segment it least detours (route refinement)
  if(ED.track.length<2)return ED.track.length;
  var bi=ED.track.length,bd=Infinity;
  for(var i=0;i<ED.track.length-1;i++){var a=ED.track[i],b=ED.track[i+1];var det=hav(p.lat,p.lon,a.lat,a.lon)+hav(p.lat,p.lon,b.lat,b.lon)-hav(a.lat,a.lon,b.lat,b.lon);if(det<bd){bd=det;bi=i+1;}}
  // if it's clearly past an end, extend instead of inserting internally
  var d0=hav(p.lat,p.lon,ED.track[0].lat,ED.track[0].lon),dN=hav(p.lat,p.lon,ED.track[ED.track.length-1].lat,ED.track[ED.track.length-1].lon);
  if(d0<bd&&d0<dN)return 0; if(dN<bd)return ED.track.length;
  return bi;
}
function edAddPoint(la,lo){
  var p={lat:la,lon:lo},ins=document.getElementById("edIns");
  // disegno normale = accoda in fondo (niente aggancio a rami precedenti). "Inserisci" = correzione nel segmento piu vicino.
  var idx=(ins&&ins.checked&&ED.track.length>=2)?edBestInsert(p):ED.track.length;
  ED.track.splice(idx,0,p);edRebuild();edRedraw();edStale();
}
function edRedraw(){if(ED.anchorLine){map.removeLayer(ED.anchorLine);ED.anchorLine=null;}if(ED.track.length>1)ED.anchorLine=L.polyline(ED.track.map(function(p){return[p.lat,p.lon];}),{color:"#e11",weight:3,dashArray:"6,6",opacity:.8}).addTo(map);}
function edStale(){if(ED.roadLine){map.removeLayer(ED.roadLine);ED.roadLine=null;}ED.pending=null;if(ED.track.length>=1)edMsg("Punti aggiornati. Premi <b>Calcola</b> per ricalcolare.");}
function edUndo(){if(!ED.track.length)return;ED.track.pop();edRebuild();edRedraw();edStale();}
function edClear(){ED.track=[];ED.markers.forEach(function(m){map.removeLayer(m);});ED.markers=[];if(ED.anchorLine){map.removeLayer(ED.anchorLine);ED.anchorLine=null;}if(ED.roadLine){map.removeLayer(ED.roadLine);ED.roadLine=null;}ED.pending=null;}
function edMsg(t){var e=document.getElementById("edMsg");if(e)e.innerHTML=t;}
function edSearchPass(){var q=this.value.toLowerCase(),box=document.getElementById("edHits");box.innerHTML="";if(q.length<2)return;PASSES_DATA.concat(osmPasses).filter(function(p){return p.name&&p.name.toLowerCase().indexOf(q)>=0;}).slice(0,8).forEach(function(p){var a=document.createElement("div");a.style.cssText="padding:4px;cursor:pointer;border-bottom:1px solid #f0f0f0";a.textContent=p.name+" ("+(p.elevation||"?")+"m)";a.onclick=function(){edSetTarget(p);box.innerHTML="";document.getElementById("edSearch").value=p.name;};box.appendChild(a);});}
function edSetTarget(p){ED.pass=p;ED.isNew=false;ED.summit={lat:p.lat,lon:p.lon};ED.versanti=(p.versanti||[]).map(function(v){return v;});document.getElementById("edNewFields").style.display="none";document.getElementById("edTarget").innerHTML="Modifica: <b>"+esc(p.name)+"</b> &mdash; "+(p.versanti?p.versanti.length:0)+" versanti";edRenderList();map.setView([p.lat,p.lon],13);}
function edStartNew(){ED.isNew=true;ED.pass=null;ED.versanti=[];ED.summit=null;ED._await=true;document.getElementById("edNewFields").style.display="block";document.getElementById("edTarget").innerHTML="Nuovo passo: clicca la CIMA sulla mappa (Disegna OFF).";edMsg("Clicca la cima del passo.");}
function edDown(pts,n){if(pts.length<=n)return pts;var o=[];for(var i=0;i<n;i++)o.push(pts[Math.round(i*(pts.length-1)/(n-1))]);return o;}
function edPreviewTrack(tr){if(ED.roadLine){map.removeLayer(ED.roadLine);}ED.roadLine=L.polyline(tr.map(function(p){return[p[0],p[1]];}),{color:"#2a7",weight:5,opacity:.9}).addTo(map);}
function snapRoute(wps){ // wps:[{lat,lon}] base..summit -> Promise of road polyline [{lat,lon}] or null
  var lonlats=wps.map(function(s){return s.lon.toFixed(5)+","+s.lat.toFixed(5);}).join("|");
  return fetch(BROUTER+"?lonlats="+lonlats+"&profile=trekking&alternativeidx=0&format=geojson").then(function(r){return r.json();}).then(function(data){
    var f=data.features&&data.features[0];if(!f)throw 0;return f.geometry.coordinates.map(function(c){return{lat:c[1],lon:c[0],ele:c[2]};});
  }).catch(function(){
    var coords=wps.map(function(s){return s.lon+","+s.lat;}).join(";");
    return fetch("https://router.project-osrm.org/route/v1/bike/"+coords+"?overview=full&geometries=geojson").then(function(r){return r.json();}).then(function(d){
      if(!d.routes||!d.routes.length)throw 0;return d.routes[0].geometry.coordinates.map(function(c){return{lat:c[1],lon:c[0]};});
    }).catch(function(){return null;});
  });
}
function edDownPts(pts,n){if(pts.length<=n)return pts;var o=[];for(var i=0;i<n;i++)o.push(pts[Math.round(i*(pts.length-1)/(n-1))]);return o;}
function fetchElevs1(pts,tries){ // ONE open-meteo call (<=100 pts), retry on 429
  tries=tries||0;
  var la=pts.map(function(p){return p.lat.toFixed(5);}).join(","),lo=pts.map(function(p){return p.lon.toFixed(5);}).join(",");
  return fetch(ELEV_API+"?latitude="+la+"&longitude="+lo).then(function(r){
    if(r.status===429&&tries<3)return new Promise(function(res){setTimeout(res,1200*(tries+1));}).then(function(){return fetchElevs1(pts,tries+1);});
    return r.json().then(function(d){return d.elevation;});
  });
}
function edCalc(){
  ED.label=document.getElementById("edLabel").value.trim();ED.desc=document.getElementById("edDesc").value.trim();
  if(ED.track.length<1){edMsg("Clicca almeno il fondovalle (partenza).");return;}
  if(!ED.summit){edMsg("Manca la cima: seleziona un passo o clicca la cima.");return;}
  var doSnap=document.getElementById("edSnap")&&document.getElementById("edSnap").checked;
  var wps=ED.track.slice();wps.push({lat:ED.summit.lat,lon:ED.summit.lon});
  edMsg(doSnap?"Aggancio strada...":"Calcolo quote...");
  (doSnap&&wps.length>=2?snapRoute(wps):Promise.resolve(null)).then(function(road){
    var b2s=(road&&road.length>3)?road:wps; // FULL snapped geometry (tornanti), or raw anchors
    if(doSnap&&!road)edMsg("Router non disponibile: uso i punti grezzi...");
    var pts=b2s.slice().reverse(); // summit->base
    var haveEle=pts[0]&&pts[0].ele!=null&&!isNaN(pts[0].ele);
    var elP;
    if(haveEle){elP=Promise.resolve(pts.map(function(p){return p.ele;}));}        // BRouter quotes -> no open-meteo
    else{pts=edDownPts(pts,90);elP=fetchElevs1(pts);}                              // freehand/OSRM -> 1 call, capped
    return elP.then(function(el){
      if(!el||el.length!==pts.length){edMsg("Quote non disponibili ora (limite richieste). Riprova tra qualche secondo.");return;}
      var v=buildVersante(pts,el,ED.summit.lat,ED.summit.lon,"",null);
      if(!v){edMsg("Salita non valida (serve &gt;200 m disl., &gt;1.5 km, e il fondo come punto piu basso).");return;}
      if(ED.label)v.side=ED.label;v.cat=climbCat(v.distance_km,v.endElevation-v.startElevation,v.endElevation);if(ED.desc)v.note=ED.desc;v.manual=true;
      var tk=document.getElementById("edTruck");if(tk&&tk.value)v.trucks=tk.value;
      edPreviewTrack(v.track);ED.pending=v;
      edMsg("OK &rarr; "+v.distance_km+" km, +"+(v.endElevation-v.startElevation)+" m, media "+v.avgGradient+"%, max "+v.maxGradient+"%, cat "+(v.cat||"-")+". Premi <b>Aggiungi versante</b>.");
    });
  }).catch(function(){edMsg("Errore rete (quote/router), riprova.");});
}
function edAddVersante(){if(!ED.pending){edMsg("Prima premi Calcola.");return;}ED.versanti=ED.versanti.filter(function(v){return v.side!==ED.pending.side;});ED.versanti.push(ED.pending);edClear();document.getElementById("edLabel").value="";document.getElementById("edDesc").value="";edRenderList();edMsg("Aggiunto. Totale "+ED.versanti.length+". Ricordati di Scaricare.");}
function edEditVersante(i){ // carica un versante gia calcolato per correggerlo senza rifarlo
  var v=ED.versanti[i];if(!v||!v.track||v.track.length<2){edMsg("Questo versante non ha una traccia modificabile.");return;}
  var summit=ED.pass?{lat:ED.pass.lat,lon:ED.pass.lon}:ED.summit;
  // geometria fitta -> pochi punti-ancora trascinabili (n proporzionale alla lunghezza)
  var n=Math.min(20,Math.max(6,Math.round((v.distance_km||5)*1.6)));
  var anchors=edDownPts(v.track.map(function(c){return{lat:c[0],lon:c[1]};}),n);
  // orienta base->cima: il primo ancora deve essere il piu lontano dalla cima
  if(summit){var dF=hav(anchors[0].lat,anchors[0].lon,summit.lat,summit.lon),dL=hav(anchors[n-1].lat,anchors[n-1].lon,summit.lat,summit.lon);if(dF<dL)anchors.reverse();}
  ED.track=anchors;if(summit)ED.summit=summit;ED.pending=null;
  if(ED.roadLine){map.removeLayer(ED.roadLine);ED.roadLine=null;}
  ED.label=v.side||"";var lbl=document.getElementById("edLabel");if(lbl)lbl.value=ED.label;
  var dsc=document.getElementById("edDesc");if(dsc)dsc.value=v.note||"";
  var tk=document.getElementById("edTruck");if(tk)tk.value=v.trucks||"";
  ED.versanti.splice(i,1); // rimosso dall'elenco: ri-aggiunto con la stessa etichetta al prossimo "Aggiungi"
  edRebuild();edRedraw();edRenderList();
  map.setView([anchors[0].lat,anchors[0].lon],13);
  edMsg("Versante <b>"+esc(v.side||"")+"</b> caricato. Trascina i punti (o &#9998; Disegna per aggiungerne), poi <b>Calcola</b> e <b>Aggiungi versante</b>.");
}
function edRenderList(){var box=document.getElementById("edList");if(!box)return;box.innerHTML="";ED.versanti.forEach(function(v,i){var r=document.createElement("div");r.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #f3f3f3";r.innerHTML="<span>"+esc(v.side)+" &middot; "+v.distance_km+"km "+v.avgGradient+"%</span>";var act=document.createElement("span");act.style.cssText="white-space:nowrap";var ed=document.createElement("span");ed.innerHTML="&#9998;";ed.title="Modifica traccia";ed.style.cssText="cursor:pointer;color:#27a;padding:0 6px"+(v.track&&v.track.length>1?"":";opacity:.3;pointer-events:none");ed.onclick=function(){edEditVersante(i);};var x=document.createElement("span");x.textContent="\u2715";x.style.cssText="cursor:pointer;color:#c00;padding:0 4px";x.onclick=function(){ED.versanti.splice(i,1);edRenderList();};act.appendChild(ed);act.appendChild(x);r.appendChild(act);box.appendChild(r);});}
function edCommitStore(){
  if(!ED.versanti.length){edMsg("Nessun versante da salvare.");return false;}
  var today=new Date().toISOString().slice(0,10),id,entry;
  if(ED.isNew){if(!ED.summit){edMsg("Manca la cima.");return false;}var nm=(document.getElementById("edName").value||"Nuovo passo").trim();id="manual-"+nm.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");entry={"new":true,name:nm,lat:ED.summit.lat,lon:ED.summit.lon,elevation:parseInt(document.getElementById("edElev").value)||Math.max.apply(null,ED.versanti.map(function(v){return v.endElevation;})),region:(document.getElementById("edRegion").value||"").trim(),status:"Aperto",versanti:ED.versanti};}
  else{if(!ED.pass){edMsg("Seleziona un passo.");return false;}id=ED.pass.id;entry={versanti:ED.versanti};}
  entry.difficulty=Math.max.apply(null,ED.versanti.map(function(v){return estDiff(v.distance_km,v.endElevation-v.startElevation,v.endElevation);}));
  entry.cat=ED.versanti.map(function(v){return v.cat;}).filter(Boolean).sort(function(a,b){return catRank(b)-catRank(a);})[0]||null;entry.updatedAt=today;entry.manual=true;
  ED.store[id]=entry;window.MANUAL_OV=ED.store;return true;
}
function edDownload(){if(!edCommitStore())return;var blob=new Blob([JSON.stringify(ED.store,null,1)+"\n"],{type:"application/json"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="manual_overrides.json";document.body.appendChild(a);a.click();a.remove();edMsg("Scaricato. Caricalo nel repo GitHub come gli altri file.");}
function edOpen(){
  var ex=document.getElementById("edPanel");if(ex){ex.style.display="block";return;}
  ED.store=window.MANUAL_OV?JSON.parse(JSON.stringify(window.MANUAL_OV)):{};
  var d=document.createElement("div");d.id="edPanel";
  d.style.cssText="position:fixed;top:84px;left:10px;z-index:1200;width:300px;max-height:84vh;overflow:auto;background:#fff;border:1px solid #ccc;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:12px;font:13px/1.4 system-ui,sans-serif;color:#222";
  d.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>&#9998; Editor salite</b><span id="edClose" style="cursor:pointer;font-size:18px;padding:0 6px">&times;</span></div><input id="edSearch" placeholder="Cerca passo da modificare..." style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #ccc;border-radius:6px"/><div id="edHits" style="max-height:120px;overflow:auto"></div><button id="edNew" style="width:100%;margin:8px 0;padding:6px;border:1px solid #ccc;border-radius:6px;background:#f6f6f6;cursor:pointer">+ Nuovo passo</button><div id="edTarget" style="font-size:12px;color:#555;margin-bottom:8px"></div><div id="edNewFields" style="display:none;margin-bottom:8px"><input id="edName" placeholder="Nome passo" style="'+ED_FW+'"/><div style="display:flex;gap:4px"><input id="edElev" placeholder="Quota m" style="'+ED_FH+'"/><input id="edRegion" placeholder="Regione" style="'+ED_FH+'"/></div></div><hr style="border:none;border-top:1px solid #eee;margin:8px 0"/><div style="font-weight:600;margin-bottom:4px">Versante</div><input id="edLabel" placeholder="Etichetta (es. Da Mazzo)" style="'+ED_FW+'"/><div style="display:flex;gap:4px;margin-bottom:4px"><button id="edDrawBtn" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:6px;cursor:pointer">&#9998; Disegna</button><button id="edUndoBtn" style="padding:6px;border:1px solid #ccc;border-radius:6px;cursor:pointer">Annulla</button><button id="edClearBtn" style="padding:6px;border:1px solid #ccc;border-radius:6px;cursor:pointer">Pulisci</button></div><label style="font-size:12px;display:block;margin-bottom:4px;cursor:pointer"><input type="checkbox" id="edSnap" checked/> Aggancia a strada (pochi punti)</label><label style="font-size:12px;display:block;margin-bottom:4px;cursor:pointer"><input type="checkbox" id="edIns"/> Inserisci tra i punti (correzione, invece di accodare)</label><div style="font-size:11px;color:#777;margin-bottom:4px">Disegno normale: ogni click <b>accoda</b> in fondo (niente aggancio a rami gia fatti).<br><b>Correggere senza rifare</b>: trascina un punto per spostarlo, click destro per rimuoverlo; per aggiungere un punto in mezzo attiva <b>Inserisci</b>. Poi premi di nuovo <b>Calcola</b>.<br>Un versante gia in elenco si modifica col tasto &#9998;.</div><textarea id="edDesc" placeholder="Note locali (fondo, pericoli, lore...)" style="'+ED_FW+';height:42px"></textarea><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px"><span>Camion:</span><select id="edTruck" style="flex:1;padding:4px;border:1px solid #ccc;border-radius:6px"><option value="">(auto)</option><option value="no">Nessuno</option><option value="rari">Rari</option><option value="possibili">Possibili</option><option value="si">Frequenti</option></select></div><div style="display:flex;gap:4px;margin-bottom:6px"><button id="edCalcBtn" style="flex:1;padding:6px;border:none;background:#2a7;color:#fff;border-radius:6px;cursor:pointer">Calcola</button><button id="edAddBtn" style="flex:1;padding:6px;border:none;background:#27a;color:#fff;border-radius:6px;cursor:pointer">Aggiungi versante</button></div><div id="edMsg" style="font-size:12px;color:#444;min-height:16px;margin-bottom:6px"></div><div id="edList" style="font-size:12px;margin-bottom:8px"></div><hr style="border:none;border-top:1px solid #eee;margin:8px 0"/><button id="edPrev" style="width:100%;margin-bottom:6px;padding:6px;border:1px solid #ccc;border-radius:6px;background:#f6f6f6;cursor:pointer">Applica in anteprima</button><button id="edDl" style="width:100%;padding:8px;border:none;background:#c60;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">&#11015; Scarica manual_overrides.json</button><div style="font-size:11px;color:#777;margin-top:6px">Poi carica il file nel repo GitHub, come gli altri.</div>';
  document.body.appendChild(d);
  document.getElementById("edClose").onclick=function(){d.style.display="none";edDraw=false;ED._await=false;};
  document.getElementById("edNew").onclick=edStartNew;
  document.getElementById("edSearch").oninput=edSearchPass;
  document.getElementById("edDrawBtn").onclick=function(){edDraw=!edDraw;this.style.background=edDraw?"#fe9":"#fff";edMsg(edDraw?"Disegno ON: clicca sulla mappa.":"");};
  document.getElementById("edUndoBtn").onclick=edUndo;
  document.getElementById("edClearBtn").onclick=edClear;
  document.getElementById("edCalcBtn").onclick=edCalc;
  document.getElementById("edAddBtn").onclick=edAddVersante;
  document.getElementById("edPrev").onclick=function(){if(edCommitStore()){applyManual();edMsg("Anteprima applicata sulla mappa.");}};
  document.getElementById("edDl").onclick=edDownload;
  if(isAdmin()){edAddGhSection(d);if(VPS_API_CONFIG.endpoint)edAddVpsSection(d);}
}
function edAddGhSection(d){
  var o=(function(){try{return sessionStorage.getItem("gh_owner");}catch(e){return null;}})()||"EbbeneTriglav";
  var rp=(function(){try{return sessionStorage.getItem("gh_repo");}catch(e){return null;}})()||"LocaClimb";
  var tk=(function(){try{return sessionStorage.getItem("gh_tok");}catch(e){return null;}})()||"";
  var s=document.createElement("div");s.style.cssText="margin-top:10px;padding-top:8px;border-top:2px solid #c60";
  s.innerHTML='<div style="font-weight:600;color:#c60;margin-bottom:4px">&#128274; Salva diretto (admin)</div>'
    +'<div style="display:flex;gap:4px;margin-bottom:4px"><input id="ghOwner" placeholder="owner" value="'+o+'" style="'+ED_FH+'"/><input id="ghRepo" placeholder="repo" value="'+rp+'" style="'+ED_FH+'"/></div>'
    +'<input id="ghTok" type="password" placeholder="token GitHub (fine-grained)" value="'+tk+'" style="'+ED_FW+'"/>'
    +'<button id="ghSaveBtn" style="width:100%;padding:8px;border:none;background:#c60;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">&#128190; Salva su GitHub</button>'
    +'<div style="font-size:10px;color:#999;margin-top:5px">Token fine-grained, SOLO questo repo, permesso Contents: read &amp; write. Resta solo in questa sessione. Non committarlo mai.</div>';
  d.appendChild(s);
  document.getElementById("ghSaveBtn").onclick=ghSave;
}
function ghSave(){
  if(!edCommitStore())return;
  var owner=document.getElementById("ghOwner").value.trim(),repo=document.getElementById("ghRepo").value.trim(),tok=document.getElementById("ghTok").value.trim();
  if(!owner||!repo||!tok){edMsg("Inserisci owner, repo e token.");return;}
  try{sessionStorage.setItem("gh_owner",owner);sessionStorage.setItem("gh_repo",repo);sessionStorage.setItem("gh_tok",tok);}catch(e){}
  var api="https://api.github.com/repos/"+owner+"/"+repo+"/contents/data/manual_overrides.json";
  var content=btoa(unescape(encodeURIComponent(JSON.stringify(ED.store,null,1)+"\n")));
  edMsg("Salvataggio su GitHub...");
  fetch(api,{headers:{Authorization:"token "+tok,Accept:"application/vnd.github+json"}}).then(function(r){return r.ok?r.json():null;}).then(function(cur){
    var body={message:"data: edit manual climbs (in-app editor)",content:content,branch:"main"};
    if(cur&&cur.sha)body.sha=cur.sha;
    return fetch(api,{method:"PUT",headers:{Authorization:"token "+tok,Accept:"application/vnd.github+json","Content-Type":"application/json"},body:JSON.stringify(body)});
  }).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});}).then(function(res){
    if(res.ok)edMsg("&#10003; Salvato su GitHub. L'Action sta generando le quote Terrarium.");
    else edMsg("Errore GitHub: "+((res.j&&res.j.message)||"controlla token e permessi Contents."));
  }).catch(function(){edMsg("Errore rete verso GitHub.");});
}
function edAddVpsSection(d){
  var ak=(function(){try{return sessionStorage.getItem("vps_admin_key");}catch(e){return null;}})()||"";
  var s=document.createElement("div");s.style.cssText="margin-top:10px;padding-top:8px;border-top:2px solid #27a";
  s.innerHTML='<div style="font-weight:600;color:#27a;margin-bottom:4px">&#128274; Salva su server (VPS)</div>'
    +'<input id="vpsKey" type="password" placeholder="Passphrase admin" value="'+esc(ak)+'" style="'+ED_FW+'"/>'
    +'<button id="vpsSaveBtn" style="width:100%;padding:8px;border:none;background:#27a;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">&#128190; Salva su server</button>'
    +'<div style="font-size:10px;color:#999;margin-top:5px">Il token GitHub resta sul server; qui serve solo la passphrase admin di questa installazione.</div>';
  d.appendChild(s);
  document.getElementById("vpsSaveBtn").onclick=vpsSave;
}
function vpsSave(){
  if(!edCommitStore())return;
  var key=document.getElementById("vpsKey").value.trim();
  if(!key){edMsg("Inserisci la passphrase admin.");return;}
  try{sessionStorage.setItem("vps_admin_key",key);}catch(e){}
  edMsg("Salvataggio sul server...");
  fetch(VPS_API_CONFIG.endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Key":key},body:JSON.stringify(ED.store)})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(res){
      if(res.ok)edMsg("&#10003; Salvato sul server. L'enrichment Terrarium partira' a breve.");
      else edMsg("Errore server: "+((res.j&&res.j.error)||"controlla passphrase e configurazione."));
    }).catch(function(){edMsg("Errore rete verso il server.");});
}
function edInit(){
  if(typeof map==="undefined"||!map){setTimeout(edInit,300);return;}
  map.on("click",edClick);
  loadManualOverrides();
  var eb=document.getElementById("ed");if(eb)eb.addEventListener("click",edOpen);
}