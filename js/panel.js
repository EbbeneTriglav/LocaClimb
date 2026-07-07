/* Curated + OSM pass detail panel: render, elevation profile chart, weather, GPX export, news. */
function stravaSection(p){
  var seg=STRAVA_SEGMENTS[p.id];var h='<div class="section-title">&#x1F3C6; Strava</div>';
  if(seg){Object.keys(seg).forEach(function(side){h+='<a href="https://www.strava.com/segments/'+seg[side]+'" target="_blank" class="btn" style="display:inline-block;text-decoration:none;margin:2px;background:#fc4c02;color:#fff;border-color:#fc4c02">'+esc(side)+' &#x2197;&#xFE0F;</a>';});}
  h+='<a href="https://www.strava.com/segments/explore?bounds='+(p.lat-0.05)+','+(p.lon-0.05)+','+(p.lat+0.05)+','+(p.lon+0.05)+'" target="_blank" class="btn" style="display:inline-block;text-decoration:none;margin:2px">&#x1F50D; Cerca segmenti</a>';
  return h;
}

/* ===== PASS DETAIL (curated + OSM share one entry) ===== */
function openD(id){var p=getCurated(id);if(p)openPass(p,false);}
function openOsmD(id){var op=getOsm(id);if(op)openPass(op,true);}
/* Single entry for both data sources: clear the map, draw this pass's tracks, render its
   panel. The three cases below differ genuinely (curated = routed lines, OSM = stored
   tracks, un-enriched OSM = a stub) - only the orchestration + header are shared. */
function openPass(p,isOsm){
  map.closePopup();clearRoutes();
  if(isOsm){
    if(p.versanti&&p.versanti.length){drawOsmTracks(p);renderPassPanel(p,true);}
    else renderOsmStub(p); // auto-discovered pass with no climb data yet
    return;
  }
  drawCuratedRoutes(p);
  renderPassPanel(p,false);
}
/* curated versanti: fetch each routed line (baked/OSRM), then fit the map to them */
function drawCuratedRoutes(p){
  showRS("Caricamento tracciati stradali...");
  Promise.all(p.versanti.map(function(v,i){return fetchVersanteRoute(v,p,i);})).then(function(lines){
    hideRS();
    lines.forEach(function(line,i){regLine(i,line);});
    p.versanti.forEach(function(v,i){addStartMarker(i,v.startLat,v.startLon);});
    highlightVersante(elevSel);
    if(routeLines.length>0)map.fitBounds(L.featureGroup(routeLines).getBounds().pad(0.15),{maxZoom:13});
    else map.setView([p.lat,p.lon],11);
  });
}
/* Shared panel header: name (+ OSM badge) + elevation/region, and - unless `bare` - the
   status/difficulty/cat line. Single source for renderPassPanel and renderOsmStub. */
function passHeader(p,isOsm,bare){
  var h='<div class="dp-hdr"><div style="display:flex;justify-content:space-between;align-items:start"><div>';
  h+='<h2 style="margin:0;font-size:1.3em">&#x26F0;&#xFE0F; '+esc(p.name)+(isOsm?' <span class="osm-badge">OSM</span>':'')+'</h2>';
  h+='<p style="margin:3px 0;opacity:.9">'+p.elevation+' m &middot; '+esc(p.region||"da OpenStreetMap")+'</p>';
  if(!bare)h+='<p style="margin:3px 0">'+(isOsm?'':sl(p.status)+' &middot; ')+'<span style="color:#f59e0b">'+ds(p.difficulty||5)+'</span>'+(p.cat?' &middot; <span style="display:inline-block;padding:1px 7px;border-radius:6px;font-weight:800;font-size:.8em;background:'+catColor(p.cat)+'">Cat '+catLabel(p.cat)+'</span>':'')+'</p>';
  h+='</div><button data-act="closeD" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:1.3em;cursor:pointer;border-radius:8px;padding:4px 10px">&#x2715;</button></div></div>';
  return h;
}
/* shared renderer for curated + enriched OSM passes */
function renderPassPanel(p,isOsm){
  CUR_PASS=p;
  ensureCat(p);
  var h=passHeader(p,isOsm);
  h+='<div class="dp-body">';
  if(p.description)h+='<p style="color:var(--txt2);margin-bottom:14px;line-height:1.5">'+esc(p.description)+'</p>';
  if(isOsm)h+='<p style="font-size:.78rem;color:var(--txt2);margin-bottom:10px">&#x1F4A1; Dati stimati automaticamente da OpenStreetMap + elevazione. Possono contenere imprecisioni.</p>';
  if(p.updatedAt||p.algo)h+='<p style="font-size:.72rem;color:var(--txt2);margin:-2px 0 12px">&#x1F504; Salita aggiornata il '+fmtDate(p.updatedAt)+(p.algo?' &middot; <b>'+esc(p.algo)+'</b>':'')+'</p>';
  var evts=getEvts(p.id);
  if(evts.length>0){h+='<div class="section-title">&#x1F6B4; Bike Day - Solo Bici!</div>';evts.forEach(function(e){var d=new Date(e.date);h+='<div class="evt-card"><b>'+esc(e.name)+'</b><br>&#x1F4C5; '+d.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})+'<br>&#x23F0; '+esc(e.hours);if(e.url)h+=' &middot; <a href="'+esc(e.url)+'" target="_blank" style="color:var(--ac)">Info</a>';h+='</div>';});}
  if(p.versanti&&p.versanti.length){
    h+='<div class="section-title">&#x2694;&#xFE0F; Confronto Versanti</div>';
    h+='<table class="vtable"><thead><tr><th></th>';
    p.versanti.forEach(function(v,i){h+='<th style="color:'+VCOLS[i]+'">&#x25CF; '+esc(v.side)+'</th>';});
    h+='</tr></thead><tbody>';
    h+='<tr><td>Distanza</td>';p.versanti.forEach(function(v){h+='<td><b>'+v.distance_km+' km</b></td>';});h+='</tr>';
    h+='<tr><td>Dislivello</td>';p.versanti.forEach(function(v){h+='<td>'+(v.endElevation-v.startElevation)+' m</td>';});h+='</tr>';
    h+='<tr><td>Pend. media</td>';p.versanti.forEach(function(v){h+='<td>'+v.avgGradient+'%</td>';});h+='</tr>';
    h+='<tr><td>Pend. max</td>';p.versanti.forEach(function(v){h+='<td><b>'+v.maxGradient+'%</b></td>';});h+='</tr>';
    h+='<tr><td>&#x1F4C5; Traffico feriale</td>';p.versanti.forEach(function(v){h+='<td>'+trafBar(versTraffic(v,p).fer)+'</td>';});h+='</tr>';
    h+='<tr><td>&#x1F3D6;&#xFE0F; Traffico weekend</td>';p.versanti.forEach(function(v){h+='<td>'+trafBar(versTraffic(v,p).wkd)+'</td>';});h+='</tr>';
    h+='<tr><td>Camion</td>';p.versanti.forEach(function(v){h+='<td>'+truckBadge(versTraffic(v,p).trucks)+'</td>';});h+='</tr>';
    h+='<tr><td>Esposizione</td>';p.versanti.forEach(function(v){h+='<td>'+v.exposure+'</td>';});h+='</tr>';
    h+='<tr><td>&#x2600;&#xFE0F; Sole</td>';p.versanti.forEach(function(v){h+='<td><span class="sun-badge">'+calcSun(p.lat,p.lon,v.exposure)+'</span></td>';});h+='</tr>';
    h+='</tbody></table>';
    h+='<div class="section-title">&#x1F4C8; Profilo Altimetrico</div>';
    if(p.versanti.length>1){h+='<div id="elev-tog" style="display:flex;gap:5px;margin-bottom:5px">';h+='<button class="etog active" data-act="setElev" data-i="-1">Entrambi</button>';p.versanti.forEach(function(v,i){h+='<button class="etog" data-act="setElev" data-i="'+i+'">'+esc(v.side.substring(0,16))+'</button>';});h+='</div>';}
    h+='<canvas id="elev"></canvas>';
    h+='<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:.72rem;color:var(--txt2);margin:2px 0 4px">Pendenza: <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px"></span> &lt;4%</span><span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px"></span> 4-7%</span><span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px"></span> 7-10%</span><span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px"></span> 10-13%</span><span><span style="display:inline-block;width:10px;height:10px;background:#7f1d1d;border-radius:2px"></span> &gt;13%</span> <span style="margin-left:8px"><span style="display:inline-block;width:12px;height:10px;border-radius:2px;background:#94a3b8;background-image:repeating-linear-gradient(45deg,#e5e7eb 0 2px,transparent 2px 5px)"></span> sterrato</span></div>';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin:7px 0 2px">';
    p.versanti.forEach(function(v,i){if(v.track&&v.track.length>1)h+='<button class="btn" style="font-size:.78rem;padding:6px 11px" data-act="exportGPX" data-id="'+esc(p.id)+'" data-i="'+i+'">&#x2B07;&#xFE0F; GPX '+esc((v.side||"").substring(0,18))+'</button>';});
    h+='</div>';
    h+='<div class="section-title">&#x1F4A7; Acqua sulla salita <span style="font-weight:400;font-size:.8em;color:var(--txt2)">(entro 100 m)</span></div>';
    h+='<div id="waterbox" style="font-size:.84rem;color:var(--txt2);padding:2px 0">Ricerca fontane e sorgenti&#8230;</div>';
  }
  h+='<div class="section-title">&#x1F326;&#xFE0F; Meteo 7 Giorni</div><div id="wbox" style="text-align:center;padding:16px;color:var(--txt2)">Caricamento meteo...</div>';
  h+=stravaSection(p);
  h+='<div class="section-title">&#x1F4F0; News &amp; Stato</div><div id="newsbox" style="padding:2px 0;color:var(--txt2);font-size:.86rem">&#8230;</div>';
  h+='<div class="section-title">&#x2B50; Valutazioni community</div><div id="ratebox" style="padding:4px 0;color:var(--txt2);font-size:.86rem">Caricamento...</div>';
  if(p.tips&&p.tips.length>0){h+='<div class="section-title">&#x1F4A1; Consigli</div><ul style="padding-left:16px">';p.tips.forEach(function(t){h+='<li style="margin:5px 0;color:var(--txt2)">'+esc(t)+'</li>';});h+='</ul>';}
  if(!isOsm)h+='<div style="margin-top:16px;text-align:center"><button data-act="openReport" data-id="'+esc(p.id)+'" class="btn" style="padding:8px 20px">&#x1F4DD; Segnala informazione</button></div>';
  h+='</div>';
  document.getElementById("dp").innerHTML=h;document.getElementById("dp").classList.add("open");
  if(p.versanti&&p.versanti.length)setTimeout(function(){drawElev(p);},80);
  if(p.versanti&&p.versanti.length)loadClimbWater(p);
  fetchW(p.lat,p.lon);renderRatings(p);renderNews(p);
}
function closeD(){document.getElementById("dp").classList.remove("open");clearRoutes();hideRS();hideElevCursor();}

/* auto-discovered OSM pass with no climb data yet: minimal panel (header + notice + meteo).
   Enrichment happens offline (build_osm_passes.mjs / the OSM refresh Action), not here. */
function renderOsmStub(p){
  var h=passHeader(p,true,true);
  h+='<div class="dp-body"><div id="osm-enr" style="padding:12px;color:var(--txt2);font-size:.88rem">&#x2139;&#xFE0F; Dati salita non ancora disponibili per questo passo. Verranno calcolati al prossimo aggiornamento dati (GitHub Action).</div>';
  h+='<div class="section-title">&#x1F326;&#xFE0F; Meteo 7 Giorni</div><div id="wbox" style="text-align:center;padding:16px;color:var(--txt2)">Caricamento meteo...</div></div>';
  document.getElementById("dp").innerHTML=h;document.getElementById("dp").classList.add("open");
  map.setView([p.lat,p.lon],12);
  fetchW(p.lat,p.lon);
}

var elevMeta=null,elevSel=-1,elevHoverMarker=null;
/* map cursor synced with the elevation-profile hover */
function showElevCursor(lat,lon){
  if(typeof map==="undefined"||!map||!map.addLayer)return;
  if(!elevHoverMarker){elevHoverMarker=L.marker([lat,lon],{icon:L.divIcon({className:"elev-cursor",html:'<span class="ec-ring"></span><span class="ec-dot"></span>',iconSize:[20,20],iconAnchor:[10,10]}),interactive:false,keyboard:false,zIndexOffset:1200});elevHoverMarker.addTo(map);}
  else elevHoverMarker.setLatLng([lat,lon]);
}
function hideElevCursor(){if(elevHoverMarker&&map&&map.removeLayer)map.removeLayer(elevHoverMarker);elevHoverMarker=null;}
function setElev(i){elevSel=i;var btns=document.querySelectorAll("#elev-tog .etog");for(var k=0;k<btns.length;k++)btns[k].classList.toggle("active",k===(i<0?0:i+1));renderElev(-1);highlightVersante(i);}
function drawElev(p){
  var c=document.getElementById("elev");if(!c)return;
  elevSel=-1;
  // pick the versante to detail on hover: longest by default
  var vers=profileVers(p);
  if(!vers.length)return;
  var allE=[];vers.forEach(function(v){allE=allE.concat(v.elevationProfile);});
  var mn=Math.min.apply(null,allE)-50,mx=Math.max.apply(null,allE)+50;
  var maxDist=Math.max.apply(null,vers.map(function(v){return v.distance_km||10;}));
  var series=vers.map(function(v){
    var pr=v.elevationProfile,n=pr.length,dist=v.distance_km||10,seg=(dist*1000)/(n-1);
    var pts=[];for(var i=0;i<n;i++){var g=i===0?0:(pr[i]-pr[i-1])/seg*100;pts.push({d:i/(n-1)*dist,e:pr[i],g:g});}
    return {name:v.side,dist:dist,pts:pts,track:v.track};
  });
  elevMeta={c:c,mn:mn,mx:mx,maxDist:maxDist,series:series};
  renderElev(-1);
  c.onmousemove=function(ev){var r=c.getBoundingClientRect();renderElev((ev.clientX-r.left)/r.width);};
  c.onmouseleave=function(){renderElev(-1);};
  c.ontouchmove=function(ev){var r=c.getBoundingClientRect();renderElev((ev.touches[0].clientX-r.left)/r.width);ev.preventDefault();};
}
function niceBin(dist){var t=dist/9,steps=[0.25,0.5,1,1.5,2,2.5,5];for(var i=0;i<steps.length;i++)if(t<=steps[i])return steps[i];return 5;}
function interpE(s,d){var pts=s.pts;if(d<=pts[0].d)return pts[0].e;if(d>=pts[pts.length-1].d)return pts[pts.length-1].e;for(var i=1;i<pts.length;i++){if(pts[i].d>=d){var a=pts[i-1],b=pts[i],t=(d-a.d)/((b.d-a.d)||1);return a.e+(b.e-a.e)*t;}}return pts[pts.length-1].e;}
function binGradOf(bins,d){for(var i=0;i<bins.length;i++)if(d<=bins[i].d1+1e-6)return bins[i].g;return bins[bins.length-1].g;}
function renderElev(frac){
  var m=elevMeta;if(!m)return;var c=m.c;
  var dpr=window.devicePixelRatio||1,W=c.offsetWidth,H=224;
  c.style.height=H+"px";c.width=W*dpr;c.height=H*dpr;var ctx=c.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  var dk=document.body.classList.contains("dark"),PADL=6,PADR=54,PADT=16,PADB=30;
  var plotW=W-PADL-PADR,plotH=H-PADT-PADB,baseY=PADT+plotH;
  ctx.clearRect(0,0,W,H);
  function rr(x,y,w,hh,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+hh,r);ctx.arcTo(x+w,y+hh,x,y+hh,r);ctx.arcTo(x,y+hh,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  var bgg=ctx.createLinearGradient(0,PADT,0,baseY);
  if(dk){bgg.addColorStop(0,"#0b1220");bgg.addColorStop(1,"#101c30");}else{bgg.addColorStop(0,"#eaf2ff");bgg.addColorStop(1,"#f8fbff");}
  ctx.fillStyle=bgg;ctx.fillRect(PADL,PADT,plotW,plotH);
  function X(d){return PADL+(d/m.maxDist)*plotW;}
  function Y(e){return PADT+plotH*(1-(e-m.mn)/(m.mx-m.mn));}
  var only=(typeof elevSel==="number"&&elevSel>=0)?elevSel:(m.series.length===1?0:-1);
  if(only>=0){ // ---- Flamme Rouge style: one versante ----
    var s=m.series[only],binKm=niceBin(s.dist),nb=Math.max(1,Math.ceil(s.dist/binKm)),bins=[];
    for(var bi=0;bi<nb;bi++){var d0=bi*binKm,d1=Math.min(s.dist,(bi+1)*binKm),e0=interpE(s,d0),e1=interpE(s,d1);bins.push({d0:d0,d1:d1,g:(d1>d0)?(e1-e0)/((d1-d0)*1000)*100:0});}
    for(var i=1;i<s.pts.length;i++){var a=s.pts[i-1],b=s.pts[i],bg=binGradOf(bins,(a.d+b.d)/2);ctx.beginPath();ctx.moveTo(X(a.d),Y(a.e));ctx.lineTo(X(b.d),Y(b.e));ctx.lineTo(X(b.d),baseY);ctx.lineTo(X(a.d),baseY);ctx.closePath();ctx.fillStyle=gradeColor(bg);ctx.fill();}
    // area path (reused for gloss clip + ridge)
    function areaPath(){ctx.beginPath();for(var i=0;i<s.pts.length;i++){var pt=s.pts[i];if(i===0)ctx.moveTo(X(pt.d),Y(pt.e));else ctx.lineTo(X(pt.d),Y(pt.e));}ctx.lineTo(X(s.pts[s.pts.length-1].d),baseY);ctx.lineTo(X(0),baseY);ctx.closePath();}
    // glossy vertical sheen over the filled area = depth
    ctx.save();areaPath();ctx.clip();var gl=ctx.createLinearGradient(0,PADT,0,baseY);gl.addColorStop(0,"rgba(255,255,255,.30)");gl.addColorStop(.45,"rgba(255,255,255,.06)");gl.addColorStop(1,"rgba(0,0,0,.14)");ctx.fillStyle=gl;ctx.fillRect(PADL,PADT,plotW,plotH);ctx.restore();
    // crisp ridge line with a soft drop shadow
    ctx.beginPath();for(var i=0;i<s.pts.length;i++){var pt=s.pts[i];if(i===0)ctx.moveTo(X(pt.d),Y(pt.e));else ctx.lineTo(X(pt.d),Y(pt.e));}
    ctx.strokeStyle=dk?"#f8fafc":"#0f172a";ctx.lineWidth=2;ctx.lineJoin="round";ctx.shadowColor="rgba(0,0,0,.28)";ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.stroke();ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    // start dot + summit flag
    var e0p=s.pts[0],eLp=s.pts[s.pts.length-1];
    ctx.fillStyle="#22c55e";ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(e0p.d),Y(e0p.e),4.5,0,7);ctx.fill();ctx.stroke();
    var fx=X(eLp.d),fy=Y(eLp.e);ctx.strokeStyle=dk?"#f8fafc":"#0f172a";ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-16);ctx.stroke();ctx.fillStyle="#ef4444";ctx.beginPath();ctx.moveTo(fx,fy-16);ctx.lineTo(fx+11,fy-12.5);ctx.lineTo(fx,fy-9);ctx.closePath();ctx.fill();
    // bin separators + per-segment % labels (rounded pills)
    ctx.textAlign="center";ctx.textBaseline="middle";
    bins.forEach(function(bn){ctx.strokeStyle="rgba(255,255,255,.5)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X(bn.d1),Y(interpE(s,bn.d1)));ctx.lineTo(X(bn.d1),baseY);ctx.stroke();
      var xc=X((bn.d0+bn.d1)/2),lab=bn.g.toFixed(1);ctx.font="bold 10px system-ui";var tw=ctx.measureText(lab).width+8;
      ctx.fillStyle="rgba(255,255,255,.94)";rr(xc-tw/2,baseY-16,tw,13,4);ctx.fill();ctx.fillStyle=gradeColor(bn.g);ctx.fillText(lab,xc,baseY-9);});
    ctx.textBaseline="alphabetic";
    // distance axis: thin baseline + light ticks (no black bar)
    ctx.strokeStyle=dk?"#334155":"#cbd5e1";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PADL,baseY+.5);ctx.lineTo(W-PADR,baseY+.5);ctx.stroke();
    ctx.textAlign="center";ctx.font="10px system-ui";ctx.fillStyle=dk?"#94a3b8":"#94a3b8";
    function tick(dv){var x=X(dv);ctx.strokeStyle=dk?"#475569":"#cbd5e1";ctx.beginPath();ctx.moveTo(x,baseY+1);ctx.lineTo(x,baseY+5);ctx.stroke();ctx.fillStyle=dk?"#94a3b8":"#64748b";ctx.fillText((dv%1===0?dv:dv.toFixed(1)),x,baseY+16);}
    tick(0);bins.forEach(function(bn){tick(bn.d1);});
    ctx.fillStyle=dk?"#64748b":"#94a3b8";ctx.font="9px system-ui";ctx.textAlign="right";ctx.fillText("km",W-PADR,baseY+16);
  } else { // ---- both versanti: grade-colored lines ----
    m.series.forEach(function(s,si){for(var i=1;i<s.pts.length;i++){var a=s.pts[i-1],b=s.pts[i];ctx.beginPath();ctx.moveTo(X(a.d),Y(a.e));ctx.lineTo(X(b.d),Y(b.e));ctx.strokeStyle=gradeColor(b.g);ctx.lineWidth=3.2;ctx.globalAlpha=si?0.7:0.95;ctx.stroke();ctx.globalAlpha=1;}});
    m.series.forEach(function(s,si){ctx.fillStyle=VCOLS[si]||"#334155";ctx.fillRect(PADL+4+si*150,2,9,9);ctx.fillStyle=dk?"#94a3b8":"#475569";ctx.font="11px system-ui";ctx.textAlign="left";ctx.fillText(s.name.substring(0,17),PADL+16+si*150,11);});
    ctx.textAlign="center";ctx.fillStyle=dk?"#64748b":"#94a3b8";ctx.font="10px system-ui";for(var k=0;k<=Math.ceil(m.maxDist);k+=Math.max(1,Math.round(m.maxDist/6)))ctx.fillText(k+"km",X(k),baseY+16);
  }
  // right elevation axis: soft gridlines + rounded chip labels (kept inside the canvas so they never clip)
  ctx.lineWidth=1;
  for(var i2=0;i2<=4;i2++){
    var yy=PADT+plotH*(1-i2/4),elv=Math.round(m.mn+(m.mx-m.mn)*i2/4);
    ctx.strokeStyle=dk?"rgba(148,163,184,.16)":"rgba(100,116,139,.14)";
    ctx.beginPath();ctx.moveTo(PADL,yy);ctx.lineTo(W-PADR,yy);ctx.stroke();
    var labe=elv+" m";ctx.font="600 9.5px system-ui";var lw=ctx.measureText(labe).width+8;
    var lx=W-lw-3,ly=Math.max(PADT+1,Math.min(baseY-11,yy-5.5));
    ctx.fillStyle=dk?"rgba(15,23,42,.85)":"rgba(255,255,255,.9)";rr(lx,ly,lw,11,3);ctx.fill();
    ctx.strokeStyle=dk?"rgba(148,163,184,.25)":"rgba(148,163,184,.35)";ctx.lineWidth=.75;rr(lx,ly,lw,11,3);ctx.stroke();
    ctx.fillStyle=dk?"#cbd5e1":"#475569";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(labe,lx+4,ly+6);
  }
  ctx.textBaseline="alphabetic";
  // hover crosshair + tooltip + synced map cursor
  if(frac>=0&&m.series.length){
    var s2=only>=0?m.series[only]:m.series[0],d=Math.max(0,Math.min(s2.dist,(frac*W-PADL)/plotW*m.maxDist));
    var idx=Math.round(d/s2.dist*(s2.pts.length-1));idx=Math.max(0,Math.min(s2.pts.length-1,idx));var pt=s2.pts[idx],px=X(pt.d),py=Y(pt.e);
    ctx.strokeStyle=dk?"#94a3b8":"#475569";ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(px,PADT);ctx.lineTo(px,baseY);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#fff";ctx.strokeStyle=gradeColor(pt.g);ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(px,py,4.5,0,7);ctx.fill();ctx.stroke();
    var txt=pt.d.toFixed(1)+" km   "+pt.e+" m   "+(pt.g>0?"+":"")+pt.g.toFixed(1)+"%";
    ctx.font="bold 11px system-ui";var tw2=ctx.measureText(txt).width+14,tx=Math.min(W-tw2-2,Math.max(2,px-tw2/2));
    ctx.fillStyle=dk?"#0f172a":"#fff";ctx.strokeStyle=gradeColor(pt.g);ctx.lineWidth=1.5;rr(tx,PADT+2,tw2,19,5);ctx.fill();ctx.stroke();
    ctx.fillStyle=dk?"#f1f5f9":"#1e293b";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(txt,tx+7,PADT+12);ctx.textBaseline="alphabetic";
    var ll=trackPtAt(s2.track,pt.d);if(ll)showElevCursor(ll[0],ll[1]);
  } else { hideElevCursor(); }
  // ---- water drops (fontane/sorgenti entro 100m dalla salita) ----
  if(climbWater&&climbWater.length){
    climbWater.forEach(function(w){
      if(only>=0&&w.vi!==only)return;
      var sr=m.series[w.vi];if(!sr)return;
      var d=Math.min(sr.dist,Math.max(0,w.along)),e=interpE(sr,d),x=X(d),y=Y(e);
      ctx.save();ctx.translate(x,y-11);
      ctx.beginPath();ctx.moveTo(0,-6);ctx.bezierCurveTo(5.5,-.5,4.2,7,0,7);ctx.bezierCurveTo(-4.2,7,-5.5,-.5,0,-6);ctx.closePath();
      ctx.fillStyle="#2563eb";ctx.strokeStyle="#fff";ctx.lineWidth=1.4;ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=3;ctx.fill();ctx.shadowBlur=0;ctx.stroke();
      ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,3,1.5,0,7);ctx.fill();
      ctx.restore();
    });
  }
}
/* versanti eligible for the profile chart (must match drawElev so water `vi` aligns with series) */
function profileVers(p){return (p.versanti||[]).filter(function(v){return v.elevationProfile&&v.elevationProfile.length>1&&v.track&&v.track.length>1;});}
/* Acqua entro 100 m dalla traccia di ogni versante: mappa + profilo + elenco in pannello */
function loadClimbWater(p){
  clearClimbWater();
  var vers=profileVers(p);if(!vers.length){setWaterBox([],vers);return;}
  var box=bboxOfTracks(vers.map(function(v){return v.track;}),0.0015);
  if(!box){setWaterBox([],vers);return;}
  var pid=p.id;
  fetchWater(box,function(nodes,ok){
    if(!CUR_PASS||CUR_PASS.id!==pid)return; // pannello cambiato nel frattempo
    if(!ok){var wb=document.getElementById("waterbox");if(wb)wb.innerHTML='<span style="color:var(--txt2)">&#x26A0;&#xFE0F; Servizio acqua non raggiungibile (Overpass sovraccarico). Riprova tra poco.</span>';return;}
    var out=[];
    nodes.forEach(function(el){
      var bvi=-1,bd=1e12,bal=0;
      vers.forEach(function(v,vi){var r=distPtToTrack(el.lat,el.lon,v.track);if(r&&r.distM<bd){bd=r.distM;bvi=vi;bal=r.along;}});
      if(bvi>=0&&bd<=100)out.push({lat:el.lat,lon:el.lon,name:(el.tags&&el.tags.name)||"",pot:waterPot(el.tags),vi:bvi,along:bal,dist:bd});
    });
    out.sort(function(a,b){return a.vi-b.vi||a.along-b.along;});
    climbWater=out;drawClimbWater();setWaterBox(out,vers);
    if(elevMeta)renderElev(-1);
  });
}
function setWaterBox(list,vers){
  var box=document.getElementById("waterbox");if(!box)return;
  if(!list.length){box.innerHTML='<span style="color:var(--txt2)">Nessuna fontana o sorgente entro 100 m dalla salita.</span>';return;}
  var h='<div style="margin-bottom:4px"><b>'+list.length+'</b> punti acqua lungo la salita</div>';
  list.forEach(function(w){
    var side=(vers[w.vi]&&vers[w.vi].side)?esc(vers[w.vi].side)+' &middot; ':'';
    h+='<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="color:#2563eb;font-size:1.05em">&#x1F4A7;</span><span>'+(w.name?esc(w.name)+' ':'')+'<span style="color:var(--txt2)">'+side+'km '+w.along.toFixed(1)+' &middot; '+esc(w.pot)+' &middot; ~'+Math.round(w.dist)+' m</span></span></div>';
  });
  box.innerHTML=h;
}
function fetchW(lat,lon){
  var k=lat.toFixed(1)+","+lon.toFixed(1);if(weatherCache[k]){renderW(weatherCache[k]);return;}
  fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,weathercode&timezone=Europe/Rome&forecast_days=7")
  .then(function(r){return r.json();}).then(function(d){weatherCache[k]=d;renderW(d);})
  .catch(function(){var e=document.getElementById("wbox");if(e)e.innerHTML="<p style='color:var(--err)'>Meteo non disponibile</p>";});
}
function renderW(data){
  var el=document.getElementById("wbox");if(!el||!data.daily)return;
  var d=data.daily,h="",maxW=0,scores=[];
  for(var i=0;i<d.time.length;i++){var w=d.windspeed_10m_max[i]||0;if(w>maxW)maxW=w;var s=100;s-=(d.precipitation_probability_max[i]||0)*0.6;if(w>30)s-=(w-30)*2;var t=d.temperature_2m_max[i]||15;if(t<8)s-=(8-t)*3;if(t>32)s-=(t-32)*4;var dow=new Date(d.time[i]).getDay();if(dow===0||dow===6)s-=8;scores.push(s);}
  var bI=scores.indexOf(Math.max.apply(null,scores));
  if(maxW>60)h+='<div class="alert-wind eb">&#x1F534; <b>ATTENZIONE:</b> Raffiche fino a '+Math.round(maxW)+' km/h!</div>';
  else if(maxW>40)h+='<div class="alert-wind wb">&#x26A0;&#xFE0F; <b>Vento forte:</b> fino a '+Math.round(maxW)+' km/h</div>';
  h+='<div class="wgrid">';
  for(var i=0;i<d.time.length;i++){var dt=new Date(d.time[i]),dn=DAYS[dt.getDay()];h+='<div class="wcard'+(i===bI?" best":"")+'"><div style="font-weight:600;font-size:.8em">'+dn+' '+dt.getDate()+'</div><div style="font-size:1.5em;margin:3px 0">'+we(d.weathercode[i])+'</div><div style="font-weight:700">'+Math.round(d.temperature_2m_max[i])+'&#xB0;</div><div style="font-size:.75em;opacity:.6">'+Math.round(d.temperature_2m_min[i])+'&#xB0;</div><div style="font-size:.7em;margin-top:2px">&#x1F4A7;'+Math.round(d.precipitation_probability_max[i])+'%</div><div style="font-size:.7em">&#x1F4A8;'+Math.round(d.windspeed_10m_max[i])+'</div>';if(i===bI)h+='<div style="font-size:.65em;color:var(--ok);font-weight:700;margin-top:2px">BEST</div>';h+='</div>';}
  h+='</div>';var bd=new Date(d.time[bI]);
  h+='<p style="margin-top:10px;text-align:center;font-weight:600;font-size:.9em">&#x2B50; Miglior giorno: <span style="color:var(--ok)">'+bd.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})+'</span></p>';
  el.innerHTML=h;
}

/* ===== USER CONTRIBUTIONS ===== */
function openReport(id){document.getElementById("rp-id").value=id;document.getElementById("rp-msg").style.display="none";document.getElementById("rp-txt").value="";document.getElementById("rp-name").value="";document.getElementById("rp-sub").disabled=false;document.getElementById("modal").classList.add("open");}
function closeModal(){document.getElementById("modal").classList.remove("open");}
function submitReport(){var txt=document.getElementById("rp-txt").value.trim();if(!txt){document.getElementById("rp-txt").style.borderColor="var(--err)";return;}document.getElementById("rp-sub").disabled=true;var msg=document.getElementById("rp-msg");msg.innerHTML="&#x2705; Grazie! Segnalazione in revisione.";msg.style.display="block";setTimeout(closeModal,2500);}
function findPassAny(id){return getCurated(id)||getOsm(id);}
function exportGPX(id,idx){
  var p=findPassAny(id);if(!p){alert("Passo non trovato.");return;}
  var v=(p.versanti||[])[idx];if(!v||!v.track||v.track.length<2){alert("Traccia non disponibile per questo versante.");return;}
  var prof=v.elevationProfile||[],N=prof.length,M=v.track.length;
  var name=(p.name||"Salita")+" - "+(v.side||("Versante "+(idx+1)));
  var g='<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="LocaRide" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>'+gpxEsc(name)+'</name></metadata>\n<trk><name>'+gpxEsc(name)+'</name><trkseg>\n';
  for(var i=0;i<M;i++){var c=v.track[i];if(!c||c.length<2)continue;var ele=(N>1)?prof[Math.min(N-1,Math.round(i/(M-1)*(N-1)))]:null;g+='<trkpt lat="'+(+c[0]).toFixed(6)+'" lon="'+(+c[1]).toFixed(6)+'">'+(ele!=null&&isFinite(ele)?'<ele>'+Math.round(ele)+'</ele>':'')+'</trkpt>\n';}
  g+='</trkseg></trk>\n</gpx>\n';
  var fn=name.replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"")+".gpx";
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([g],{type:"application/gpx+xml"}));a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},120);
}
function loadNews(){fetch(DATA_DIR+"pass_news.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(d){PASS_NEWS=d||{};newsFailed=false;if(CUR_PASS)renderNews(CUR_PASS);}).catch(function(){PASS_NEWS={};newsFailed=true;if(CUR_PASS)renderNews(CUR_PASS);});}
function renderNews(p){
  var box=document.getElementById("newsbox");if(!box)return;
  if(PASS_NEWS==null){box.innerHTML="Caricamento...";return;}
  if(newsFailed){box.innerHTML='<span style="color:var(--txt2)">News non disponibili al momento.</span>';return;}
  var items=PASS_NEWS[p.id]||PASS_NEWS[p.name]||[];
  if(!items.length){box.innerHTML='<span style="color:var(--txt2)">Nessuna novita recente.</span>';return;}
  var html="";items.slice(0,6).forEach(function(it){
    var d=it.date?'<span style="color:var(--txt2)">'+esc(it.date)+'</span> &middot; ':'';
    var src=it.source?' <span style="color:#888">('+esc(it.source)+')</span>':'';
    var t=esc(it.title||it.url||"");
    var ttl=it.url?'<a href="'+esc(it.url)+'" target="_blank" rel="noopener noreferrer">'+t+'</a>':t;
    html+='<div style="margin:5px 0;line-height:1.35">'+d+ttl+src+'</div>';
  });
  box.innerHTML=html;
}