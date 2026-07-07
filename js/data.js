/* Fetching + merging the JSON data layer (curated/OSM/manual overrides, baked routes) into PASSES_DATA/osmPasses. */
/* Surface an UNEXPECTED data-load failure (malformed/absent core file, total OSM-load
   failure) to the user via the existing #rs toast instead of the old silent .catch(){}.
   Deliberately NOT called for expected-optional cases (a not-yet-built regional file 404s
   inside the manifest loop; the baked-routes perf cache) - those must stay quiet so this
   never cries wolf. `showRSBrief` may be absent/#rs missing in tests, hence the try/catch. */
function dataWarn(msg){if(window.console&&console.warn)console.warn("[locaClimb] "+msg);try{showRSBrief("&#x26A0;&#xFE0F; "+msg);}catch(e){}}
function loadCuratedOverrides(){fetch(DATA_DIR+"curated_overrides.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(o){PASSES_DATA.forEach(function(p){var ov=o[p.id];if(ov){if(ov.lat){p.lat=ov.lat;p.lon=ov.lon;}if(ov.versanti&&ov.versanti.length)p.versanti=ov.versanti;if(ov.difficulty)p.difficulty=ov.difficulty;if(ov.cat)p.cat=ov.cat;if(ov.updatedAt)p.updatedAt=ov.updatedAt;if(ov.algo)p.algo=ov.algo;}});applyFilters();setDataVersion();if(window.MANUAL_OV)applyManual();}).catch(function(){dataWarn("Override passi non caricati (curated_overrides.json).");});}
function getCurated(id){return PASSES_DATA.find(function(x){return x.id===id;});}
function getOsm(id){return osmPasses.find(function(x){return x.id===id;});}
function getEvts(id){var now=new Date();return BIKE_EVENTS.filter(function(e){return e.passes.indexOf(id)>=0&&new Date(e.date)>=now;}).sort(function(a,b){return new Date(a.date)-new Date(b.date);});}

/* derive climb data for an OSM pass: connected highways -> walk outward -> elevation -> versanti */
function enrichOsmPass(op){
  if(op.versanti&&op.versanti.length)return Promise.resolve(true);
  if(osmEnrichCache[op.id]){op.versanti=osmEnrichCache[op.id].versanti;op.difficulty=osmEnrichCache[op.id].difficulty;op.surfaceLabel=osmEnrichCache[op.id].surfaceLabel;return Promise.resolve(true);}
  var nid=(""+op.id).replace(/^osm-/,"");
  if(!/^\d+$/.test(nid))return Promise.resolve(false);
  var q="[out:json][timeout:25];node("+nid+")->.n;way(bn.n)[\"highway\"];out geom tags;";
  return fetch(OVERPASS+"?data="+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(data){
    var ways=(data.elements||[]).filter(function(e){return e.type==="way"&&e.geometry&&e.geometry.length>2&&rideableWay(e.tags);});
    if(!ways.length)return false;
    // pick the way whose geometry passes closest to the summit and is longest
    var best=null,bestLen=0;
    ways.forEach(function(w){var idx=closestIdx(w.geometry,op.lat,op.lon);if(idx<0)return;var len=w.geometry.length;if(len>bestLen){bestLen=len;best={w:w,idx:idx};}});
    if(!best)return false;
    var w=best.w,idx=best.idx;
    var sideA=collectSide(w.geometry,idx,-1);
    var sideB=collectSide(w.geometry,idx,1);
    var sides=[sideA,sideB].filter(function(s){return s&&s.length>=4;});
    if(!sides.length)return false;
    var surfLabel=surfaceLabelFromWay(w.tags);
    return Promise.all(sides.map(function(pts){return fetchElevs(pts).then(function(ev){return buildVersante(pts,ev,op.lat,op.lon,surfLabel,w.tags);}).catch(function(){return null;});}))
      .then(function(vs){
        vs=vs.filter(function(v){return v;});
        if(!vs.length)return false;
        // dedupe near-identical sides, keep up to 2
        vs.sort(function(a,b){return b.distance_km-a.distance_km;});vs=vs.slice(0,2);
        op.versanti=vs;
        op.difficulty=Math.max.apply(null,vs.map(function(v){return estDiff(v.distance_km,v.endElevation-v.startElevation,v.endElevation);}));
        op.surfaceLabel=surfLabel;
        osmEnrichCache[op.id]={versanti:vs,difficulty:op.difficulty,surfaceLabel:surfLabel};
        return true;
      });
  }).catch(function(){return false;});
}
function rideableWay(t){if(!t||!t.highway)return false;var bad={motorway:1,motorway_link:1,path:1,footway:1,steps:1,pedestrian:1,bridleway:1,raceway:1,construction:1,proposed:1};if(bad[t.highway])return false;if(t.motorroad==="yes")return false;if(t.bicycle==="no")return false;if(t.access==="private"||t.access==="no")return false;if(t["mtb:scale"])return false;return true;}
function closestIdx(geom,lat,lon){var bi=-1,bd=1e9;for(var i=0;i<geom.length;i++){var d=hav(lat,lon,geom[i].lat,geom[i].lon);if(d<bd){bd=d;bi=i;}}return bd<0.4?bi:-1;}
function collectSide(geom,idx,dir){
  var pts=[],dist=0,prev=geom[idx];pts.push({lat:geom[idx].lat,lon:geom[idx].lon});
  for(var i=idx+dir;i>=0&&i<geom.length;i+=dir){var g=geom[i];dist+=hav(prev.lat,prev.lon,g.lat,g.lon);pts.push({lat:g.lat,lon:g.lon});prev=g;if(dist>=16)break;}
  if(pts.length>80){var out=[],n=80;for(var k=0;k<n;k++)out.push(pts[Math.round(k*(pts.length-1)/(n-1))]);return out;}
  return pts;
}
function fetchElevs(pts){
  var la=pts.map(function(p){return p.lat.toFixed(5);}).join(",");
  var lo=pts.map(function(p){return p.lon.toFixed(5);}).join(",");
  return fetch(ELEV_API+"?latitude="+la+"&longitude="+lo).then(function(r){return r.json();}).then(function(d){return d.elevation;});
}
function buildVersante(pts,elevs,topLat,topLon,surfLabel,wtags){
  if(!elevs||elevs.length!==pts.length)return null;
  var bi=0;for(var i=1;i<elevs.length;i++){if(elevs[i]<elevs[bi])bi=i;}
  if(bi<2)return null;
  var seg=pts.slice(0,bi+1).reverse();var se=elevs.slice(0,bi+1).reverse();
  var dist=0;for(var i=1;i<seg.length;i++)dist+=hav(seg[i-1].lat,seg[i-1].lon,seg[i].lat,seg[i].lon);
  if(dist<1.5)return null;
  var gain=se[se.length-1]-se[0];if(gain<200)return null;
  var maxg=0;for(var i=1;i<seg.length;i++){var dd=hav(seg[i-1].lat,seg[i-1].lon,seg[i].lat,seg[i].lon)*1000;if(dd>80){var g=(se[i]-se[i-1])/dd*100;if(g>maxg)maxg=g;}}
  var dir=compass(seg[0].lat,seg[0].lon,topLat,topLon);
  var prof=[],n=Math.min(se.length,18);for(var i=0;i<n;i++)prof.push(Math.round(se[Math.round(i*(se.length-1)/(n-1))]));
  return {side:"Versante "+dir,startLat:seg[0].lat,startLon:seg[0].lon,startElevation:Math.round(se[0]),endElevation:Math.round(se[se.length-1]),distance_km:Math.round(dist*10)/10,avgGradient:Math.round(gain/(dist*1000)*1000)/10,maxGradient:Math.round(maxg*10)/10,traffic:"n/d",exposure:dir,elevationProfile:prof,track:seg.map(function(s){return[s.lat,s.lon];})};
}
function surfaceLabelFromWay(t){
  if(!t)return"";var s=t.surface||"";var hw=t.highway||"";
  if(s==="asphalt"||s==="paved"||s==="concrete")return"\uD83D\uDEE3\uFE0F Asfalto";
  if(s==="compacted"||s==="fine_gravel"||s==="gravel"||hw==="track")return"\uD83E\uDEA8 Sterrato/gravel";
  if(s)return"Fondo: "+s;
  return"";
}
/* prefill OSRM route cache from baked file so curated passes don't hit OSRM at runtime */
/* baked routes are a pure perf cache; failure just falls back to live OSRM, no UX loss -
   so this logs but does NOT toast (keeping dataWarn for things the user should notice). */
function loadBakedRoutes(){fetch(DATA_DIR+"routes_baked.json",{cache:"force-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(o){for(var k in o)routeCache[k]=o[k];}).catch(function(){if(window.console&&console.warn)console.warn("[locaClimb] routes_baked.json non caricato (uso OSRM live).");});}

function setDataVersion(){
  var el=document.getElementById("dataver");if(!el)return;
  var ver="";for(var i=0;i<osmPasses.length;i++){if(osmPasses[i].algo){ver=osmPasses[i].algo;break;}}
  var mx="";osmPasses.forEach(function(p){if(p.updatedAt&&p.updatedAt>mx)mx=p.updatedAt;});
  PASSES_DATA.forEach(function(p){if(p.updatedAt&&p.updatedAt>mx)mx=p.updatedAt;});
  el.innerHTML="&#x1F4E6; Dati: "+(ver||"?")+(mx?" &middot; "+fmtDate(mx):"");
}
function versSameOrigin(a,b){if(!a||!b)return false;var d=Math.abs((a.startLat||0)-(b.startLat||0))+Math.abs((a.startLon||0)-(b.startLon||0));return d<0.02;}
function mergeColocated(arr){
  // Border passes: the same valico appears in two region files (e.g. Italia + Francia), each carrying
  // only its in-country versante. Union the versanti of co-located OSM passes (<~1km) so both sides show.
  var out=[];
  arr.forEach(function(op){
    var hit=null;
    for(var i=0;i<out.length;i++){var q=out[i];if(Math.abs(q.lat-op.lat)<0.009&&Math.abs(q.lon-op.lon)<0.009){hit=q;break;}}
    if(!hit){out.push(op);return;}
    hit.versanti=hit.versanti||[];
    (op.versanti||[]).forEach(function(v){if(!hit.versanti.some(function(w){return versSameOrigin(v,w);}))hit.versanti.push(v);});
    if((op.elevation||0)>(hit.elevation||0))hit.elevation=op.elevation;
    if(!hit.name&&op.name)hit.name=op.name;
  });
  return out;
}
function adoptOsm(arr){
  if(!arr||!arr.length)return;
  arr=mergeColocated(arr);
  // drop entries too close to curated passes
  osmPasses=arr.filter(function(op){return!PASSES_DATA.some(function(p){return Math.abs(p.lat-op.lat)<0.008&&Math.abs(p.lon-op.lon)<0.008;});});
  osmPasses.forEach(function(op){if(op.surfaceLabel)op.surfaceLabel=decodeEntities(op.surfaceLabel);}); // ripulisce entità residue (cache/file esteri)
  applyFilters();setDataVersion();if(window.MANUAL_OV)applyManual();
  var b=document.getElementById("ob");if(b)b.textContent="OSM ("+osmPasses.length+")";
}
function persistOsm(){try{localStorage.setItem(OSM_CACHE_KEY,JSON.stringify(osmPasses.map(stripMarker)));}catch(e){}}
function stripMarker(op){var o={};for(var k in op){if(k!=="_marker")o[k]=op[k];}return o;}
function loadOsmBaked(){
  // Multi-country: osm_regions.json lists the per-region files to merge (e.g. ["osm_passes.json",
  // "osm_passes_sud.json","osm_passes_fr.json",...]). Missing files are skipped. No manifest -> single file.
  fetch(DATA_DIR+"osm_regions.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(list){
    if(!list||!list.length)throw 0;
    // Per-region file: a missing/failed one yields [] and is SILENT by design - a not-yet-built
    // osm_passes_xb_* 404 is expected (matches validate_data's warning). Total failure is caught below.
    return Promise.all(list.map(function(f){return fetch(DATA_DIR+f,{cache:"no-store"}).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];});})).then(function(parts){
      adoptOsm([].concat.apply([],parts));
    });
  }).catch(function(){
    fetch(DATA_DIR+"osm_passes.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(arr){adoptOsm(arr);}).catch(function(){
      // manifest, single-file, and cache all failed -> the OSM layer is genuinely empty. Warn.
      try{var c=localStorage.getItem(OSM_CACHE_KEY);if(c){adoptOsm(JSON.parse(c));return;}}catch(e){}
      dataWarn("Passi OSM non caricati (rete o dati non disponibili).");
    });
  });
}
function classifyWay(t){
  if(!t)return null;var hw=t.highway;
  var bad={path:1,footway:1,steps:1,pedestrian:1,bridleway:1,corridor:1,construction:1,proposed:1,raceway:1,via_ferrata:1};
  if(!hw||bad[hw])return null;
  if(t.bicycle==="no"||t.bicycle==="dismount")return null;
  if(t.access==="private"||t.access==="no")return null;
  if(t["mtb:scale"])return null;
  var bs={sand:1,mud:1,rock:1,pebblestone:1,grass:1};
  if(t.surface&&bs[t.surface])return null;
  return {hw:hw,surface:t.surface||""};
}
function fetchOSM(){
  var btn=document.getElementById("ob");if(!btn)return;btn.textContent="Caricamento...";btn.disabled=true;
  // pass nodes + the highways they sit on, to filter hiking-only passes
  var q='[out:json][timeout:90];(node["mountain_pass"="yes"](44.0,6.5,47.5,13.5);)->.p;way(bn.p)["highway"];(.p;._;);out body;';
  fetch(OVERPASS+"?data="+encodeURIComponent(q))
  .then(function(r){return r.json();}).then(function(data){
    var nodes=[],ways=[];
    (data.elements||[]).forEach(function(el){if(el.type==="node"&&el.tags&&el.tags.mountain_pass)nodes.push(el);else if(el.type==="way")ways.push(el);});
    var wayByNode={};
    ways.forEach(function(w){if(!w.nodes)return;w.nodes.forEach(function(nid){(wayByNode[nid]=wayByNode[nid]||[]).push(w);});});
    var added=[],ct=0,skipped=0;
    nodes.forEach(function(el){
      var elev=el.tags.ele?parseInt(el.tags.ele):0;if(isNaN(elev)||elev<200)return;
      if(PASSES_DATA.some(function(p){return Math.abs(p.lat-el.lat)<0.008&&Math.abs(p.lon-el.lon)<0.008;}))return;
      if(osmPasses.some(function(p){return Math.abs(p.lat-el.lat)<0.005&&Math.abs(p.lon-el.lon)<0.005;}))return;
      var cw=wayByNode[el.id]||[],ride=null;
      for(var i=0;i<cw.length;i++){var c=classifyWay(cw[i].tags);if(c){ride=c;break;}}
      // if pass is on ways but none rideable -> hiking pass, skip
      if(cw.length>0&&!ride){skipped++;return;}
      var name=(el.tags.name||"Passo").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
      var surfLabel=ride?surfaceLabelFromWay(ride.hw==="track"?{highway:"track",surface:ride.surface}:{surface:ride.surface||"asphalt"}):"";
      var op={id:"osm-"+el.id,name:name,lat:el.lat,lon:el.lon,elevation:elev,surfaceLabel:surfLabel};
      osmPasses.push(op);added.push(op);ct++;
    });
    added.forEach(addOsmMarker);persistOsm();
    btn.textContent="OSM (+"+ct+")";btn.disabled=false;
    if(skipped>0)showRSBrief("&#x2705; "+ct+" salite aggiunte ("+skipped+" passi escursionistici esclusi)");
  }).catch(function(){btn.textContent="OSM (err)";btn.disabled=false;});
}
function showRSBrief(msg){showRS(msg);setTimeout(hideRS,3500);}
function applyManual(){
  var ov=window.MANUAL_OV;if(!ov)return;
  for(var id in ov){var o=ov[id];
    if(o["new"]){
      var ex=PASSES_DATA.filter(function(p){return p.id===id;})[0];
      if(!ex){
        var near=null,bd=0.8; // a manual "new" pass near an existing one OVERRIDES it (no duplicate marker)
        PASSES_DATA.concat(osmPasses).forEach(function(p){if(p.lat!=null){var dd=hav(o.lat,o.lon,p.lat,p.lon);if(dd<bd){bd=dd;near=p;}}});
        if(near){near.versanti=o.versanti;near.difficulty=o.difficulty;near.cat=o.cat;near.updatedAt=o.updatedAt;near.manual=true;}
        else PASSES_DATA.push({id:id,name:o.name,lat:o.lat,lon:o.lon,elevation:o.elevation,region:o.region||"",status:o.status||"Aperto",versanti:o.versanti||[],difficulty:o.difficulty||1,cat:o.cat||null,updatedAt:o.updatedAt,manual:true});
      }
      else{ex.versanti=o.versanti;ex.difficulty=o.difficulty;ex.cat=o.cat;ex.lat=o.lat;ex.lon=o.lon;ex.elevation=o.elevation;ex.updatedAt=o.updatedAt;ex.manual=true;}
    }else{
      var hit=PASSES_DATA.filter(function(p){return p.id===id;})[0]||osmPasses.filter(function(p){return p.id===id;})[0];
      if(hit){if(o.name)hit.name=o.name;if(o.versanti)hit.versanti=o.versanti;if(o.difficulty)hit.difficulty=o.difficulty;if(o.cat)hit.cat=o.cat;if(o.updatedAt)hit.updatedAt=o.updatedAt;hit.manual=true;}
    }
  }
  applyFilters();setDataVersion();
}
function loadManualOverrides(){
  fetch(DATA_DIR+"manual_enriched.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(o){window.MANUAL_OV=o;applyManual();})
  .catch(function(){fetch(DATA_DIR+"manual_overrides.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(o){window.MANUAL_OV=o;applyManual();}).catch(function(){window.MANUAL_OV=window.MANUAL_OV||{};});});
}