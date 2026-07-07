/* Leaflet map: init, markers, filters/search, route-line drawing, traffic + fountain overlays. */
function initMap(){
  map=L.map("map",{center:[45.8,10.5],zoom:7,zoomControl:false});
  L.control.zoom({position:"topright"}).addTo(map);
  var osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"OSM"});
  var cyc=L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",{maxZoom:18,attribution:"CyclOSM"});
  var topo=L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"Topo"});
  var sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles &copy; Esri World Imagery"});
  osm.addTo(map);
  L.control.layers({"OSM":osm,"CyclOSM":cyc,"Topo":topo,"Ortofoto (Esri)":sat},{},{position:"topleft"}).addTo(map);
  L.control.scale({metric:true,imperial:false,position:"bottomright"}).addTo(map);
  markers=L.markerClusterGroup({maxClusterRadius:50});map.addLayer(markers);
  addMarkers(PASSES_DATA);populateRegions();
}
function populateRegions(){var rs={};PASSES_DATA.forEach(function(p){rs[p.region]=1;});var sel=document.getElementById("fr");Object.keys(rs).sort().forEach(function(r){var o=document.createElement("option");o.value=r;o.textContent=r;sel.appendChild(o);});}

function addMarkers(data){
  markers.clearLayers();
  data.forEach(function(p){
    ensureCat(p);
    var c;
    if(p.cat){var ic=L.divIcon({className:"",html:'<div class="cat-pill'+(isGravel(p)?" grv":"")+'" style="background:'+catColor(p.cat)+'">'+catLabel(p.cat)+'</div>',iconSize:[34,26],iconAnchor:[17,13]});c=L.marker([p.lat,p.lon],{icon:ic});}
    else c=L.circleMarker([p.lat,p.lon],{radius:10,fillColor:sc(p.status),color:"#fff",weight:2,fillOpacity:0.9});
    var evts=getEvts(p.id);
    var evTag=evts.length>0?"<br>&#x1F6B4; <b>"+evts.length+" Bike Day!</b>":"";
    c.bindPopup(function(){
      return '<div style="min-width:200px"><b style="font-size:1.05em">'+esc(p.name)+'</b><br>&#x26F0;&#xFE0F; '+p.elevation+' m &middot; '+sl(p.status)+'<br><span style="color:#f59e0b;letter-spacing:1px">'+ds(p.difficulty)+'</span> ('+p.difficulty+'/10)<br>&#x1F4CD; '+esc(p.region)+evTag+'<br><button data-act="openD" data-id="'+esc(p.id)+'" style="margin-top:6px;padding:7px 14px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Dettagli</button> <button data-act="addToRoute" data-id="'+esc(p.id)+'" style="margin-top:6px;padding:7px 14px;background:#22c55e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">+ Route</button></div>';
    });
    markers.addLayer(c);
  });
  if(showOsm){
    var q=(document.getElementById("search")?document.getElementById("search").value.toLowerCase():""),
        dmin=parseInt(document.getElementById("fd")?document.getElementById("fd").value:1)||1;
    osmPasses.forEach(function(op){
      if(q&&(op.name||"").toLowerCase().indexOf(q)<0)return;
      if(dmin>1&&(op.difficulty||1)<dmin)return;
      addOsmMarker(op);
    });
  }
}
function osmDupCurated(op){
  for(var i=0;i<PASSES_DATA.length;i++){var p=PASSES_DATA[i];
    if(hav(op.lat,op.lon,p.lat,p.lon)<2.0)return true;}
  return false;
}
function addOsmMarker(op){
  if(!(op.versanti&&op.versanti.length)&&!op.snapped)return;
  if(osmDupCurated(op))return; // curated version wins
  ensureCat(op);
  var c;
  if(op.cat){var ic=L.divIcon({className:"",html:'<div class="cat-pill'+(isGravel(op)?" grv":"")+'" style="background:'+catColor(op.cat)+'">'+catLabel(op.cat)+'</div>',iconSize:[34,26],iconAnchor:[17,13]});c=L.marker([op.lat,op.lon],{icon:ic});}
  else c=L.circleMarker([op.lat,op.lon],{radius:8,fillColor:(op.versanti&&op.versanti.length?diffColor(op.difficulty||5):"#a78bfa"),color:"#fff",weight:2,fillOpacity:0.85});
  var diffTag=op.difficulty?' &middot; <span style="color:#f59e0b">'+ds(op.difficulty)+'</span>':'';
  var surfTag=op.surfaceLabel?'<br>'+esc(op.surfaceLabel):'';
  c.bindPopup('<div style="min-width:190px"><b>'+esc(op.name)+'</b> <span style="color:#7c3aed;font-size:.72em;font-weight:600">OSM</span><br>&#x26F0;&#xFE0F; '+op.elevation+' m'+diffTag+surfTag+'<br><button data-act="openOsmD" data-id="'+esc(op.id)+'" style="margin-top:6px;padding:6px 13px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Dettagli</button> <button data-act="addOsmToRoute" data-id="'+esc(op.id)+'" style="margin-top:6px;padding:6px 13px;background:#22c55e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">+ Route</button></div>');
  markers.addLayer(c);op._marker=c;
}
function clearRoutes(){routeLines.forEach(function(l){map.removeLayer(l);});routeLines=[];clearVers();clearClimbWater();}
function clearVers(){versStartMarkers.forEach(function(m){map.removeLayer(m);});versStartMarkers=[];versLayers=[];}
function regLine(i,line){if(!line)return;if(!versLayers[i])versLayers[i]={lines:[],marker:null};versLayers[i].lines.push(line);line.on("click",function(){selectVers(i);});}
function addStartMarker(i,lat,lon){
  if(lat==null||lon==null)return;
  var col=VCOLS[i%VCOLS.length];
  var ic=L.divIcon({className:"",html:'<div class="vstart" style="background:'+col+'">'+(i+1)+'</div>',iconSize:[24,24],iconAnchor:[12,12]});
  var m=L.marker([lat,lon],{icon:ic,zIndexOffset:600});
  m.on("click",function(){selectVers(i);});m.addTo(map);versStartMarkers.push(m);
  if(!versLayers[i])versLayers[i]={lines:[],marker:null};versLayers[i].marker=m;
}
function highlightVersante(sel){
  for(var i=0;i<versLayers.length;i++){var vl=versLayers[i];if(!vl)continue;
    var on=(sel<0||sel===i);
    vl.lines.forEach(function(ln){if(ln.setStyle)ln.setStyle({opacity:on?0.95:0.16});});
    if(vl.marker&&vl.marker.setOpacity)vl.marker.setOpacity(on?1:0.35);
  }
}
function selectVers(i){setElev(i);}
function showRS(msg){var el=document.getElementById("rs");el.innerHTML=msg;el.classList.add("show");}
function hideRS(){document.getElementById("rs").classList.remove("show");}

/* ===== OSRM ROAD ROUTING FOR CURATED VERSANTI ===== */
function fetchVersanteRoute(v,p,colorIdx){
  // Use the track computed by the build (the actual climbed road), NOT an OSRM re-route:
  // OSRM picked its own road start->summit and diverged from the real climb.
  var coords=(v.track&&v.track.length>1)?v.track:[[v.startLat,v.startLon],[p.lat,p.lon]];
  var line=L.polyline(coords,{color:VCOLS[colorIdx],weight:5,opacity:0.85});
  line.addTo(map);routeLines.push(line);
  return Promise.resolve(line);
}
function drawOsmTracks(op){
  clearRoutes();var lines=[];
  (op.versanti||[]).forEach(function(v,i){
    if(!v.track||v.track.length<2)return;
    var pr=v.elevationProfile||[],np=pr.length,nt=v.track.length;
    for(var t=1;t<nt;t++){
      var g=0;
      if(np>1){var fi=(t/(nt-1))*(np-1),lo=Math.floor(fi);if(lo>=np-1)lo=np-2;var seg=(v.distance_km*1000)/(np-1);g=(pr[lo+1]-pr[lo])/seg*100;}
      var ln=L.polyline([v.track[t-1],v.track[t]],{color:gradeColor(g),weight:6,opacity:0.9});
      ln.addTo(map);routeLines.push(ln);lines.push(ln);regLine(i,ln);
    }
    addStartMarker(i,v.startLat,v.startLon);
  });
  highlightVersante(elevSel);
  if(lines.length)map.fitBounds(L.featureGroup(lines).getBounds().pad(0.15),{maxZoom:13});
  else map.setView([op.lat,op.lon],12);
}

/* ===== FILTERS / SEARCH / DARK / EVENTS ===== */
function openFP(){document.getElementById("fp").classList.toggle("open");}
function closeFP(){document.getElementById("fp").classList.remove("open");}
function applyFilters(){var reg=document.getElementById("fr").value,diff=parseInt(document.getElementById("fd").value),sta=document.getElementById("fs").value,trk=(document.getElementById("ftruck")||{}).value||"",q=document.getElementById("search").value.toLowerCase();showOsm=document.getElementById("fosm").checked;var f=PASSES_DATA.filter(function(p){if(reg&&p.region!==reg)return false;if(p.difficulty<diff)return false;if(sta&&p.status!==sta)return false;if(trk){var lv=passTruck(p);if(trk==="no"&&lv!=="no")return false;if(trk==="low"&&(lv==="possibili"||lv==="si"))return false;}if(q&&p.name.toLowerCase().indexOf(q)<0&&p.region.toLowerCase().indexOf(q)<0)return false;return true;});addMarkers(f);}
function resetFilters(){document.getElementById("fr").value="";document.getElementById("fd").value="1";document.getElementById("fdv").textContent="1";document.getElementById("fs").value="";document.getElementById("search").value="";document.getElementById("fosm").checked=true;showOsm=true;addMarkers(PASSES_DATA);closeSearch();}
function closeSearch(){var b=document.getElementById("sresults");if(b){b.classList.remove("open");b.innerHTML="";}searchItems=[];}
function searchList(q){
  q=(q||"").trim().toLowerCase();var out=[];if(q.length<2)return out;
  PASSES_DATA.forEach(function(p){if(p.name.toLowerCase().indexOf(q)>=0||(p.region||"").toLowerCase().indexOf(q)>=0)out.push({id:p.id,name:p.name,sub:p.region||"",lat:p.lat,lon:p.lon,osm:false,el:p.elevation});});
  osmPasses.forEach(function(op){if((op.name||"").toLowerCase().indexOf(q)>=0)out.push({id:op.id,name:op.name,sub:"OSM",lat:op.lat,lon:op.lon,osm:true,el:op.elevation});});
  out.sort(function(a,b){return (b.el||0)-(a.el||0);});return out.slice(0,8);
}
function renderSearch(){
  var box=document.getElementById("sresults");if(!box)return;
  searchItems=searchList(document.getElementById("search").value);
  if(!searchItems.length){closeSearch();return;}
  var h="";searchItems.forEach(function(it,i){h+='<div class="sr-item" data-act="pickSearch" data-i="'+i+'"><span>&#x26F0;&#xFE0F; '+esc(it.name)+(it.osm?' <span class="osm-badge">OSM</span>':'')+'</span><small>'+(it.el?it.el+'m':'')+(it.sub&&it.sub!=="OSM"?' &middot; '+esc(it.sub):'')+'</small></div>';});
  box.innerHTML=h;box.classList.add("open");
}
function pickSearch(i){
  var it=searchItems[i];if(!it)return;
  document.getElementById("search").value=it.name;closeSearch();
  map.setView([it.lat,it.lon],12);
  if(it.osm)openOsmD(it.id);else openD(it.id);
}
function onSearchInput(){applyFilters();renderSearch();}
function onSearchKey(e){if(e.key==="Enter"&&searchItems.length){pickSearch(0);}else if(e.key==="Escape"){closeSearch();}}
function toggleBE(){var pn=document.getElementById("be-panel");pn.style.display=pn.style.display==="block"?"none":"block";if(pn.style.display!=="block")return;var now=new Date();var evts=BIKE_EVENTS.filter(function(e){return new Date(e.date)>=now;}).sort(function(a,b){return new Date(a.date)-new Date(b.date);}).slice(0,8);var h='<h3 style="margin:0 0 10px">&#x1F6B4; Prossimi Bike Day</h3>';if(!evts.length)h+='<p style="color:var(--txt2)">Nessun evento</p>';else evts.forEach(function(e){var d=new Date(e.date);var diff=Math.ceil((d-now)/86400000);h+='<div class="evt-card"><b>'+esc(e.name)+'</b><br>'+d.toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"long"});if(diff<=30)h+=' <b style="color:var(--err)">(tra '+diff+'gg!)</b>';h+='<br>'+esc(e.hours)+'</div>';});pn.innerHTML=h;}

/* ===== VEHICULAR TRAFFIC OVERLAY (defined colored roads, not a blurry blob) ===== */
function buildTraffic(){
  var grp=L.layerGroup();
  function road(coords,lvl){if(!coords||coords.length<2)return;L.polyline(coords,{color:trafColor(lvl),weight:2.5+lvl*0.55,opacity:0.82}).addTo(grp);}
  PASSES_DATA.forEach(function(p){(p.versanti||[]).forEach(function(v){
    if(v.track)road(v.track,versTraffic(v,p).wkd);
  });});
  osmPasses.forEach(function(op){(op.versanti||[]).forEach(function(v){road(v.track,versTraffic(v,op).wkd);});});
  return grp;
}
function toggleHeat(){
  heatOn=!heatOn;document.getElementById("tb").classList.toggle("active",heatOn);
  var leg=document.getElementById("traf-leg");
  if(heatOn){if(trafficLayer)map.removeLayer(trafficLayer);trafficLayer=buildTraffic();trafficLayer.addTo(map);if(leg)leg.classList.add("show");}
  else{if(trafficLayer){map.removeLayer(trafficLayer);trafficLayer=null;}if(leg)leg.classList.remove("show");}
}
function getFountIcon(){if(!fountIcon)fountIcon=L.divIcon({className:"fount-ic",html:'<div style="font-size:17px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))">&#x1F4A7;</div>',iconSize:[20,20],iconAnchor:[10,10],popupAnchor:[0,-8]});return fountIcon;}
function toggleFount(){
  fountOn=!fountOn;var b=document.getElementById("fountBtn");if(b)b.classList.toggle("active",fountOn);
  if(fountOn){if(!fountLayer)fountLayer=L.layerGroup().addTo(map);map.on("moveend",fountMove);loadFountains();}
  else{map.off("moveend",fountMove);if(fountLayer)fountLayer.clearLayers();fountIds={};showFountHint(false);}
}
function fountMove(){clearTimeout(fountTimer);fountTimer=setTimeout(loadFountains,600);}
function showFountHint(on){var h=document.getElementById("fount-hint");if(h)h.classList.toggle("show",!!on);}
function loadFountains(){
  if(!fountOn||!fountLayer)return;
  if(map.getZoom()<MIN_FOUNT_ZOOM){ // bbox troppo ampio: niente marker (perf) + suggerimento a zoomare
    fountLayer.clearLayers();fountIds={};showFountHint(true);return;
  }
  showFountHint(false);
  var bb=map.getBounds(),box="("+bb.getSouth().toFixed(4)+","+bb.getWest().toFixed(4)+","+bb.getNorth().toFixed(4)+","+bb.getEast().toFixed(4)+")";
  var q='[out:json][timeout:25];(node["amenity"="drinking_water"]'+box+';node["man_made"="water_tap"]["drinking_water"!="no"]'+box+';node["amenity"="fountain"]["drinking_water"="yes"]'+box+';node["natural"="spring"]["drinking_water"="yes"]'+box+';);out body;';
  fountFetch(shuffledMirrors(),0,q);
}
function fountFetch(urls,i,q){
  if(i>=urls.length||!fountOn)return;
  overpassPost(urls[i],q,12000).then(function(d){
    (d.elements||[]).forEach(function(el){if(el.type!=="node"||fountIds[el.id])return;fountIds[el.id]=1;addFountain(el);});
  }).catch(function(){fountFetch(urls,i+1,q);});
}
/* ===== SHARED WATER FETCH (fontanelle + sorgenti) for climb/route buffers ===== */
function waterQuery(box){return '[out:json][timeout:15];(node["amenity"="drinking_water"]'+box+';node["man_made"="water_tap"]["drinking_water"!="no"]'+box+';node["amenity"="fountain"]["drinking_water"="yes"]'+box+';node["natural"="spring"]["drinking_water"!="no"]'+box+';);out body;';}
function bboxOfTracks(tracks,padDeg){
  var mnLa=90,mxLa=-90,mnLo=180,mxLo=-180,seen=false;
  (tracks||[]).forEach(function(t){(t||[]).forEach(function(c){seen=true;if(c[0]<mnLa)mnLa=c[0];if(c[0]>mxLa)mxLa=c[0];if(c[1]<mnLo)mnLo=c[1];if(c[1]>mxLo)mxLo=c[1];});});
  if(!seen)return null;padDeg=padDeg||0.002;
  return "("+(mnLa-padDeg).toFixed(4)+","+(mnLo-padDeg).toFixed(4)+","+(mxLa+padDeg).toFixed(4)+","+(mxLo+padDeg).toFixed(4)+")";
}
function overpassPost(url,q,ms){                              // POST con timeout (evita richieste appese all'infinito)
  var ac=(typeof AbortController!=="undefined")?new AbortController():null;
  var to=ac?setTimeout(function(){ac.abort();},ms||12000):null;
  return fetch(url,{method:"POST",body:"data="+encodeURIComponent(q),signal:ac?ac.signal:undefined})
    .then(function(r){if(to)clearTimeout(to);if(!r.ok)throw new Error(r.status);return r.json();})
    .catch(function(e){if(to)clearTimeout(to);throw e;});
}
function shuffledMirrors(){var a=WATER_MIRRORS.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
/* cb(nodes, ok). Cache per bbox + dedup delle richieste concorrenti + fallback tra mirror CORS. */
function fetchWater(box,cb){
  if(waterCache[box]){cb(waterCache[box],true);return;}
  if(waterInflight[box]){waterInflight[box].push(cb);return;}
  waterInflight[box]=[cb];
  function done(nodes,ok){if(ok)waterCache[box]=nodes;var cbs=waterInflight[box]||[];delete waterInflight[box];cbs.forEach(function(f){f(nodes,ok);});}
  if(typeof fetch!=="function"){done([],false);return;}
  var q=waterQuery(box),order=shuffledMirrors();
  (function tryUrl(i){
    if(i>=order.length){done([],false);return;}
    overpassPost(order[i],q,12000)
      .then(function(d){done((d.elements||[]).filter(function(e){return e.type==="node"&&e.lat!=null;}),true);})
      .catch(function(){tryUrl(i+1);});
  })(0);
}
/* ---- Acqua sulla singola SALITA (buffer 100m, evidenziata in mappa) ---- */
function getClimbWaterIcon(){if(!climbWaterIcon)climbWaterIcon=L.divIcon({className:"climb-water-ic",html:'<div class="cw-drop">&#x1F4A7;</div>',iconSize:[22,22],iconAnchor:[11,11],popupAnchor:[0,-9]});return climbWaterIcon;}
function clearClimbWater(){if(climbWaterLayer&&map&&map.removeLayer)map.removeLayer(climbWaterLayer);climbWaterLayer=null;climbWater=[];}
function drawClimbWater(){
  if(climbWaterLayer&&map&&map.removeLayer)map.removeLayer(climbWaterLayer);
  if(!climbWater.length){climbWaterLayer=null;return;}
  climbWaterLayer=L.layerGroup();
  climbWater.forEach(function(w){
    var pop='&#x1F4A7; <b>'+esc(w.name||"Acqua")+'</b><br>'+esc(w.pot)+'<br><span style="color:#888">~'+Math.round(w.dist)+' m dalla salita</span>';
    L.marker([w.lat,w.lon],{icon:getClimbWaterIcon(),zIndexOffset:500}).bindPopup(pop).addTo(climbWaterLayer);
  });
  if(map&&map.addLayer)climbWaterLayer.addTo(map);
}
/* ---- Acqua sul PERCORSO (buffer 200m, colore per vicinanza) ---- */
function clearRouteWater(){if(routeWaterLayer&&map&&map.removeLayer)map.removeLayer(routeWaterLayer);routeWaterLayer=null;routeWater=[];}
function drawRouteWater(){
  if(routeWaterLayer&&map&&map.removeLayer)map.removeLayer(routeWaterLayer);
  if(!routeWater.length){routeWaterLayer=null;return;}
  routeWaterLayer=L.layerGroup();
  routeWater.forEach(function(w){
    var col=waterColor(w.dist);
    var pop='&#x1F4A7; <b>'+esc(w.name||"Acqua")+'</b><br>'+esc(w.pot)+'<br><span style="color:#888">~'+Math.round(w.dist)+' m dal percorso</span>';
    L.circleMarker([w.lat,w.lon],{radius:w.dist<=15?7:6,fillColor:col,color:"#fff",weight:2,fillOpacity:0.95,zIndexOffset:500}).bindPopup(pop).addTo(routeWaterLayer);
  });
  if(map&&map.addLayer)routeWaterLayer.addTo(map);
}
function addFountain(el){
  if(!fountLayer)return;var t=el.tags||{},nm=t.name||"";
  var pot=(t.drinking_water==="no")?"Non potabile":(t.drinking_water==="yes"||t.amenity==="drinking_water"?"Acqua potabile":"Potabilita non indicata");
  var pop="&#x1F4A7; <b>"+(nm||"Fontanella")+"</b><br>"+pot+(t.operator?"<br><span style='color:#888'>"+t.operator+"</span>":"");
  L.marker([el.lat,el.lon],{icon:getFountIcon()}).bindPopup(pop).addTo(fountLayer);
}