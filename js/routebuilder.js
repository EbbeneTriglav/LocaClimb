/* Route Builder v2: chain passes/waypoints into a route via BRouter/OSRM, with elevation + surface overlay. */
/* ===== ROUTE BUILDER v2 (waypoints + Brouter elevation/surface) ===== */
function toggleRB(){rbMode=!rbMode;setPanel("rb",rbMode);document.getElementById("rbb").classList.toggle("active",rbMode);if(rbMode){document.getElementById("be-btn").style.display="none";}else{document.getElementById("be-btn").style.display="";resetRoute();}}
function addToRoute(id){var p=getCurated(id);if(!p)return;rbStops.push({type:"pass",name:p.name,lat:p.lat,lon:p.lon,elevation:p.elevation});map.closePopup();if(!rbMode)toggleRB();updateRBList();}
function addOsmToRoute(id){var p=getOsm(id);if(!p)return;rbStops.push({type:"pass",name:p.name,lat:p.lat,lon:p.lon,elevation:p.elevation});map.closePopup();if(!rbMode)toggleRB();updateRBList();}
function addPointToRoute(lat,lon){rbStops.push({type:"point",name:"Punto "+(rbStops.length+1),lat:lat,lon:lon});updateRBList();}
function removeFromRoute(idx){rbStops.splice(idx,1);updateRBList();if(rbTrack.length&&rbStops.length>=2)calcRoute();}
function moveStop(i,dir){var j=i+dir;if(j<0||j>=rbStops.length)return;var t=rbStops[i];rbStops[i]=rbStops[j];rbStops[j]=t;updateRBList();if(rbTrack.length&&rbStops.length>=2)calcRoute();}
function updateRBList(){
  var el=document.getElementById("rb-list");
  if(!rbStops.length){el.innerHTML='<span style="color:var(--txt2);font-size:.85rem">Clicca sui passi o sulla mappa...</span>';document.getElementById("rb-go").disabled=true;document.getElementById("rb-gpx").disabled=true;}
  else{var h="";rbStops.forEach(function(s,i){h+='<div class="rb-item'+(s.type==="point"?" pt":"")+'"><span class="mv" data-act="moveStop" data-i="'+i+'" data-dir="-1" title="Sposta indietro">&#x25C0;</span>'+(i+1)+'. '+s.name+' <span class="mv" data-act="moveStop" data-i="'+i+'" data-dir="1" title="Sposta avanti">&#x25B6;</span> <span class="rm" data-act="removeFromRoute" data-i="'+i+'">&#x2715;</span></div>';});el.innerHTML=h;document.getElementById("rb-go").disabled=rbStops.length<2;}
  drawWpMarkers();
}
function drawWpMarkers(){
  wpMarkers.forEach(function(m){map.removeLayer(m);});wpMarkers=[];
  rbStops.forEach(function(s,i){
    var ic=L.divIcon({className:"",html:'<div class="wp-ic">'+(i+1)+'</div>',iconSize:[26,26],iconAnchor:[13,13]});
    var m=L.marker([s.lat,s.lon],{icon:ic,draggable:true});
    m.on("dragend",function(e){var ll=e.target.getLatLng();rbStops[i].lat=ll.lat;rbStops[i].lon=ll.lng;if(rbStops[i].type==="pass"){rbStops[i].type="point";rbStops[i].name="Punto "+(i+1);}updateRBList();if(rbTrack.length)calcRoute();});
    m.addTo(map);wpMarkers.push(m);
  });
}
function calcRoute(){
  if(rbStops.length<2)return;
  routeSurfSegs=[];if(surfOverlay){map.removeLayer(surfOverlay);surfOverlay=null;}
  var lonlats=rbStops.map(function(s){return s.lon.toFixed(5)+","+s.lat.toFixed(5);}).join("|");
  document.getElementById("rb-go").textContent="Calcolo...";document.getElementById("rb-go").disabled=true;
  showRS("Calcolo percorso ciclabile (Brouter)...");
  var prof=(document.getElementById("rb-surf")&&document.getElementById("rb-surf").value)||"trekking";
  fetch(BROUTER+"?lonlats="+lonlats+"&profile="+prof+"&alternativeidx=0&format=geojson")
  .then(function(r){return r.json();}).then(function(data){
    var f=data.features&&data.features[0];if(!f)throw new Error("no route");
    var coords=f.geometry.coordinates;
    rbTrack=coords.map(function(c){return[c[1],c[0],c[2]];});
    drawRouteLine();
    var props=f.properties||{};
    var distKm=props["track-length"]?(props["track-length"]/1000):trackDist(rbTrack);
    var asc=props["filtered ascend"]?parseInt(props["filtered ascend"]):trackAscent(rbTrack);
    var surf=surfaceFromMessages(props.messages);
    finishRoute(distKm,asc,surf,true);
  }).catch(function(){
    // fallback OSRM (geometry only) + open-meteo elevation
    osrmFallback();
  });
}
function osrmFallback(){
  var coords=rbStops.map(function(s){return s.lon+","+s.lat;}).join(";");
  fetch("https://router.project-osrm.org/route/v1/bike/"+coords+"?overview=full&geometries=geojson")
  .then(function(r){return r.json();}).then(function(data){
    if(data.code!=="Ok"||!data.routes||!data.routes.length)throw new Error("no route");
    var route=data.routes[0];var ll=route.geometry.coordinates.map(function(c){return[c[1],c[0]];});
    rbTrack=ll.map(function(c){return[c[0],c[1],null];});
    drawRouteLine();
    // sample elevation via open-meteo (max 100 pts per call)
    var samp=[];var n=Math.min(ll.length,100);for(var i=0;i<n;i++)samp.push({lat:ll[Math.round(i*(ll.length-1)/(n-1))][0],lon:ll[Math.round(i*(ll.length-1)/(n-1))][1]});
    fetchElevs(samp).then(function(ev){for(var i=0;i<n;i++){rbTrack[Math.round(i*(ll.length-1)/(n-1))][2]=ev[i];}interp(rbTrack);finishRoute(route.distance/1000,trackAscent(rbTrack),null,false);})
    .catch(function(){finishRoute(route.distance/1000,0,null,false);});
  }).catch(function(){
    hideRS();document.getElementById("rb-info").textContent="Percorso non trovato";document.getElementById("rb-go").textContent="Calcola Percorso";document.getElementById("rb-go").disabled=false;
  });
}
function drawRouteLine(){if(rbLine)map.removeLayer(rbLine);rbLine=L.polyline(rbTrack.map(function(c){return[c[0],c[1]];}),{color:"#22c55e",weight:6,opacity:0.85});rbLine.addTo(map);map.fitBounds(rbLine.getBounds().pad(0.12));}
function trackDist(t){var d=0;for(var i=1;i<t.length;i++)d+=hav(t[i-1][0],t[i-1][1],t[i][0],t[i][1]);return d;}
function trackAscent(t){var a=0;for(var i=1;i<t.length;i++){if(t[i][2]!=null&&t[i-1][2]!=null){var dv=t[i][2]-t[i-1][2];if(dv>0)a+=dv;}}return Math.round(a);}
function interp(t){var last=null;for(var i=0;i<t.length;i++){if(t[i][2]!=null)last=t[i][2];else t[i][2]=last;}var next=null;for(var i=t.length-1;i>=0;i--){if(t[i][2]!=null)next=t[i][2];else t[i][2]=next;}}
function finishRoute(distKm,asc,surf,hasSurf){
  hideRS();
  document.getElementById("rb-go").textContent="Calcola Percorso";document.getElementById("rb-go").disabled=false;document.getElementById("rb-gpx").disabled=false;
  document.getElementById("rb-info").innerHTML="&#x1F4CD; "+distKm.toFixed(1)+" km &middot; &#x2197;&#xFE0F; "+asc+" m";
  drawSurfaceOverlay();
  openRoutePanel(distKm,asc,surf,hasSurf);
  loadRouteWater();
}
/* Acqua entro 200 m dal percorso: cerchietti in mappa + gocce nell'altimetria, colore per vicinanza. */
function loadRouteWater(){
  clearRouteWater();
  if(rbTrack.length<2)return;
  var track=rbTrack.map(function(c){return[c[0],c[1]];});
  var box=bboxOfTracks([track],0.0025);
  if(!box)return;
  fetchWater(box,function(nodes,ok){
    if(!ok){var rb=document.getElementById("rwaterbox");if(rb)rb.innerHTML='<span style="color:var(--txt2)">&#x26A0;&#xFE0F; Servizio acqua non raggiungibile (Overpass sovraccarico). Riprova tra poco.</span>';return;}
    var out=[];
    nodes.forEach(function(el){
      var r=distPtToTrack(el.lat,el.lon,track);
      if(r&&r.distM<=200)out.push({lat:el.lat,lon:el.lon,name:(el.tags&&el.tags.name)||"",pot:waterPot(el.tags),along:r.along,dist:r.distM});
    });
    out.sort(function(a,b){return a.along-b.along;});
    routeWater=out;drawRouteWater();drawRouteProfile();fillRouteWaterBox(out);
  });
}
function fillRouteWaterBox(list){
  var box=document.getElementById("rwaterbox");if(!box)return;
  if(!list.length){box.innerHTML='<span style="color:var(--txt2)">Nessun punto acqua entro 200 m dal percorso.</span>';return;}
  var near=list.filter(function(w){return w.dist<=30;}).length;
  var h='<div style="margin-bottom:4px"><b>'+list.length+'</b> punti acqua &middot; '+near+' proprio sul percorso</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:.72rem;color:var(--txt2)">';
  [["#1e3a8a","sul percorso"],["#2563eb","30 m"],["#60a5fa","100 m"],["#93c5fd","200 m"]].forEach(function(x){h+='<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:'+x[0]+';display:inline-block"></span>'+x[1]+'</span>';});
  h+='</div>';
  box.innerHTML=h;
}
function surfaceFromMessages(msgs){
  routeSurfSegs=[];
  if(!msgs||msgs.length<2)return null;
  var head=msgs[0];var di=head.indexOf("Distance"),wi=head.indexOf("WayTags");
  if(wi<0)return null;
  var acc={},total=0,cum=0;
  for(var i=1;i<msgs.length;i++){var row=msgs[i];var d=parseFloat(row[di])||0;var cat=surfCat(row[wi]||"");acc[cat]=(acc[cat]||0)+d;routeSurfSegs.push({from:cum,to:cum+d,cat:cat});cum+=d;total+=d;}
  return total>0?{acc:acc,total:total}:null;
}
function drawSurfaceOverlay(){
  if(surfOverlay){map.removeLayer(surfOverlay);surfOverlay=null;}
  if(!routeSurfSegs.length||rbTrack.length<2)return;
  var cum=[0];for(var i=1;i<rbTrack.length;i++)cum.push(cum[i-1]+hav(rbTrack[i-1][0],rbTrack[i-1][1],rbTrack[i][0],rbTrack[i][1])*1000);
  surfOverlay=L.layerGroup();var any=false;
  routeSurfSegs.forEach(function(sg){
    if(sg.cat==="asfalto")return;
    var seg=[];for(var i=0;i<rbTrack.length;i++){if(cum[i]>=sg.from&&cum[i]<=sg.to)seg.push([rbTrack[i][0],rbTrack[i][1]]);}
    if(seg.length>1){L.polyline(seg,{color:(SURF_COLORS[sg.cat]||"#b45309"),weight:7,opacity:0.95,dashArray:"2,7"}).addTo(surfOverlay);any=true;}
  });
  if(any)surfOverlay.addTo(map);
}
function surfCat(wt){
  var m=/surface=([a-z_]+)/.exec(wt);var s=m?m[1]:"";
  var hm=/highway=([a-z_]+)/.exec(wt);var hw=hm?hm[1]:"";
  if(s==="asphalt"||s==="paved"||s==="concrete"||s==="paving_stones")return"asfalto";
  if(s==="compacted"||s==="fine_gravel"||s==="gravel"||s==="unpaved"||hw==="track")return"sterrato";
  if(s==="ground"||s==="dirt"||s==="grass"||s==="sand"||s==="mud")return"fondo naturale";
  if(s)return"altro";
  if(hw==="path"||hw==="footway")return"fondo naturale";
  return"asfalto";
}
function openRoutePanel(distKm,asc,surf,hasSurf){
  var h='<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start"><div>';
  h+='<h2 style="margin:0;font-size:1.3em">&#x1F6A9; Percorso</h2>';
  h+='<p style="margin:3px 0;opacity:.9">'+rbStops.length+' tappe</p>';
  h+='</div><button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px">&#x2715;</button></div></div>';
  h+='<div class="dp-body">';
  h+='<div class="rstats"><div>Distanza<b>'+distKm.toFixed(1)+' km</b></div><div>Dislivello<b>'+asc+' m</b></div><div>Tappe<b>'+rbStops.length+'</b></div></div>';
  h+='<div class="section-title">&#x1F4C8; Altimetria</div><canvas id="relev"></canvas>';
  h+='<canvas id="rwind"></canvas>';   // fascia vento, allineata all'asse km del profilo
  /* Meteo di percorso: il valore non e' "che tempo fa" ma "che tempo trovi al km X quando ci passi tu",
     quindi servono ora di partenza e un'andatura. Il default e' domani alle 8. */
  var d0=new Date(Date.now()+864e5); d0.setHours(8,0,0,0);
  var iso=d0.getFullYear()+'-'+('0'+(d0.getMonth()+1)).slice(-2)+'-'+('0'+d0.getDate()).slice(-2)+'T08:00';
  h+='<div class="section-title">&#x1F4A8; Meteo del percorso</div>';
  h+='<div class="rw-ctl"><input type="datetime-local" id="rw-when" value="'+iso+'">';
  h+='<label>Andatura <input type="number" id="rw-speed" min="10" max="35" value="22" step="1"> km/h in piano</label>';
  h+='<button class="btn" data-act="loadRideWeather">Calcola</button></div>';
  h+='<div id="rwbox" style="font-size:.8rem;margin:2px 0"><span style="color:var(--txt2)">Scegli quando parti: calcolo vento, temperatura e pioggia nell\'ora in cui passerai da ogni punto.</span></div>';
  h+='<div class="section-title">&#x2615; Ristori sul percorso</div>';
  h+='<div class="rw-ctl"><label class="rw-tg"><input type="checkbox" id="rw-stops" data-change="toggleRwStops"> Mostra bar, forni e alimentari</label>';
  h+='<select id="rw-buf" data-change="rwBufChanged"><option value="100">entro 100 m</option><option value="250" selected>entro 250 m</option><option value="500">entro 500 m</option></select></div>';
  h+='<div id="rwstopbox" style="font-size:.8rem;color:var(--txt2);margin:2px 0"></div>';
  h+='<div class="section-title">&#x1F4A7; Acqua sul percorso <span style="font-weight:400;font-size:.8em;color:var(--txt2)">(entro 200 m)</span></div>';
  h+='<div id="rwaterbox" style="font-size:.8rem;color:var(--txt2);margin:2px 0">Ricerca fontane e sorgenti&#8230;</div>';
  if(hasSurf&&surf){
    h+='<div class="section-title">&#x1FAA8; Fondo Stradale</div><div class="surf-bar">';
    var cats=Object.keys(surf.acc).sort(function(a,b){return surf.acc[b]-surf.acc[a];});
    cats.forEach(function(c){var pct=(surf.acc[c]/surf.total*100);h+='<div class="surf-seg" style="width:'+pct.toFixed(1)+'%;background:'+(SURF_COLORS[c]||"#94a3b8")+'" title="'+c+' '+pct.toFixed(0)+'%"></div>';});
    h+='</div><div class="surf-leg">';
    cats.forEach(function(c){h+='<span><span class="surf-dot" style="background:'+(SURF_COLORS[c]||"#94a3b8")+'"></span>'+c+' '+(surf.acc[c]/surf.total*100).toFixed(0)+'%</span>';});
    h+='</div>';
  }else{h+='<p style="font-size:.78rem;color:var(--txt2)">Dati fondo stradale non disponibili (motore di routing di riserva).</p>';}
  h+='<div class="section-title">&#x1F4CD; Tappe</div>';
  rbStops.forEach(function(s,i){h+='<div class="rstop"><span class="n">'+(i+1)+'</span><span>'+s.name+(s.type==="point"?' <span style="color:var(--txt2);font-size:.85em">(waypoint)</span>':'')+'</span></div>';});
  h+='<div style="margin-top:16px;text-align:center"><button data-act="downloadGPX" class="btn" style="padding:8px 20px">&#x2B07;&#xFE0F; Scarica GPX</button></div>';
  h+='</div>';
  document.getElementById("dp").innerHTML=h;setPanel("dp",true);
  setTimeout(drawRouteProfile,80);
}
function drawRouteProfile(){
  drawProfileCanvas(document.getElementById("relev"));
  drawWindStrip();
  var rc=document.getElementById("rb-elev");
  if(rc){drawProfileCanvas(rc);if(rbTrack.length)rc.classList.add("show");}
}
function drawProfileCanvas(c){
  if(!c||!rbTrack.length)return;
  var dpr=window.devicePixelRatio||1;c.width=c.offsetWidth*dpr;c.height=340;
  var ctx=c.getContext("2d");ctx.scale(dpr,dpr);var W=c.offsetWidth,H=170;
  var els=rbTrack.map(function(t){return t[2];}).filter(function(v){return v!=null;});
  if(els.length<2){ctx.fillStyle="#94a3b8";ctx.font="12px system-ui";ctx.fillText("Altimetria non disponibile",10,80);return;}
  var mn=Math.min.apply(null,els)-30,mx=Math.max.apply(null,els)+30;
  var cum=[0];for(var i=1;i<rbTrack.length;i++)cum.push(cum[i-1]+hav(rbTrack[i-1][0],rbTrack[i-1][1],rbTrack[i][0],rbTrack[i][1]));
  var tot=cum[cum.length-1]||1;
  var dk=document.body.classList.contains("dark");
  ctx.fillStyle=dk?"#1e293b":"#f8fafc";ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=dk?"#334155":"#e2e8f0";ctx.lineWidth=0.5;ctx.font="10px system-ui";ctx.fillStyle=dk?"#64748b":"#94a3b8";
  for(var i=0;i<=4;i++){var y=15+(H-35)*(1-i/4);var el=Math.round(mn+(mx-mn)*i/4);ctx.beginPath();ctx.moveTo(38,y);ctx.lineTo(W-8,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(el+"m",34,y+3);}
  if(routeSurfSegs.length){var totM=tot*1000;routeSurfSegs.forEach(function(sg){if(sg.cat==="asfalto")return;var x1=38+(Math.max(0,sg.from)/totM)*(W-46),x2=38+(Math.min(totM,sg.to)/totM)*(W-46);ctx.fillStyle=(SURF_COLORS[sg.cat]||"#b45309");ctx.globalAlpha=0.2;ctx.fillRect(x1,15,Math.max(1,x2-x1),H-35);ctx.globalAlpha=1;});}
  ctx.beginPath();
  for(var i=0;i<rbTrack.length;i++){var e=rbTrack[i][2];if(e==null)continue;var x=38+(cum[i]/tot)*(W-46);var y=15+(H-35)*(1-(e-mn)/(mx-mn));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.strokeStyle="#22c55e";ctx.lineWidth=2.5;ctx.stroke();
  ctx.lineTo(W-8,H-20);ctx.lineTo(38,H-20);ctx.closePath();ctx.globalAlpha=0.12;ctx.fillStyle="#22c55e";ctx.fill();ctx.globalAlpha=1;
  // water drops along the route (color = proximity)
  if(routeWater&&routeWater.length){
    routeWater.forEach(function(w){
      var al=Math.max(0,Math.min(tot,w.along)),xr=38+(al/tot)*(W-46);
      var e=null;for(var i=0;i<rbTrack.length;i++){if(cum[i]>=al){e=rbTrack[i][2];break;}}if(e==null)e=rbTrack[rbTrack.length-1][2];
      var yr=(e!=null)?15+(H-35)*(1-(e-mn)/(mx-mn)):(H/2);
      ctx.save();ctx.translate(xr,yr-9);
      ctx.beginPath();ctx.moveTo(0,-5);ctx.bezierCurveTo(4.6,0,3.6,6,0,6);ctx.bezierCurveTo(-3.6,6,-4.6,0,0,-5);ctx.closePath();
      ctx.fillStyle=waterColor(w.dist);ctx.strokeStyle="#fff";ctx.lineWidth=1.2;ctx.shadowColor="rgba(0,0,0,.3)";ctx.shadowBlur=2.5;ctx.fill();ctx.shadowBlur=0;ctx.stroke();
      ctx.restore();
    });
  }
  ctx.fillStyle=dk?"#94a3b8":"#475569";ctx.textAlign="right";ctx.fillText(tot.toFixed(1)+" km",W-8,H-6);
}
function resetRoute(){resetRideWeather();rbStops=[];rbTrack=[];routeSurfSegs=[];if(rbLine){map.removeLayer(rbLine);rbLine=null;}if(surfOverlay){map.removeLayer(surfOverlay);surfOverlay=null;}clearRouteWater();wpMarkers.forEach(function(m){map.removeLayer(m);});wpMarkers=[];updateRBList();document.getElementById("rb-info").innerHTML="";document.getElementById("rb-gpx").disabled=true;var rc=document.getElementById("rb-elev");if(rc)rc.classList.remove("show");}
function generateGPX(){
  var now=new Date().toISOString();
  var g='<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="LocaRide">\n<metadata><name>LocaRide Route</name><time>'+now+'</time></metadata>\n';
  rbStops.forEach(function(s){g+='<wpt lat="'+s.lat+'" lon="'+s.lon+'"><name>'+gpxEsc(s.name)+'</name>'+(s.elevation?'<ele>'+s.elevation+'</ele>':'')+'</wpt>\n';});
  g+='<trk><name>'+gpxEsc(rbStops.map(function(s){return s.name;}).join(" - "))+'</name><trkseg>\n';
  rbTrack.forEach(function(c){g+='<trkpt lat="'+c[0].toFixed(6)+'" lon="'+c[1].toFixed(6)+'">'+(c[2]!=null?'<ele>'+Math.round(c[2])+'</ele>':'')+'</trkpt>\n';});
  g+='</trkseg></trk>\n</gpx>';return g;
}
function downloadGPX(){var g=generateGPX();var b=new Blob([g],{type:"application/gpx+xml"});var u=URL.createObjectURL(b);var a=document.createElement("a");a.href=u;a.download="locaclimb_route.gpx";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}