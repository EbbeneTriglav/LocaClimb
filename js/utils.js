/* Pure, stateless helper functions (formatting, colors, geo/astro math, classification). No DOM/Leaflet/fetch. */
function fmtDate(s){if(!s)return"";var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);return m?m[3]+"/"+m[2]+"/"+m[1]:s;}
/* Escape untrusted text (pass names/descriptions/notes can come from OSM tags or the
   manual editor's free-text fields) before it's concatenated into an innerHTML string. */
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function we(c){return WC[c]||"&#x2601;&#xFE0F;";}
function sc(s){return s==="open"?"#22c55e":s==="seasonal"?"#f59e0b":"#ef4444";}
function sl(s){return s==="open"?"&#x1F7E2; Aperto":s==="seasonal"?"&#x1F7E1; Stagionale":"&#x1F534; Chiuso";}
function ds(d){var s="";for(var i=0;i<10;i++)s+=(i<d?"&#x2605;":"&#x2606;");return s;}
function diffColor(d){return d>=9?"#ef4444":d>=7?"#f97316":d>=5?"#f59e0b":"#22c55e";}
/* gradient (%) -> color scale, used by profile + map track */
function gradeColor(g){g=Math.abs(g);return g>=13?"#7f1d1d":g>=10?"#ef4444":g>=7?"#f97316":g>=4?"#f59e0b":"#22c55e";}
/* climb category (HC/1/2/3/4) color + pill */
function ensureCat(p){
  if(p.cat||!p.versanti||!p.versanti.length)return;
  var best=null,rank={HC:5,"1":4,"2":3,"3":2,"4":1};
  p.versanti.forEach(function(v){
    var gain=(v.endElevation||0)-(v.startElevation||0),d=v.distance_km||0;
    if(gain<150||d<1)return;
    var f=gain*gain/(d*1000*10)+Math.max(0,(v.endElevation||0)-1000)/1000;
    var c=f>=8?"HC":f>=5.5?"1":f>=3.5?"2":f>=2?"3":"4";
    if(!best||rank[c]>rank[best])best=c;
  });
  if(best)p.cat=best;
}
function isGravel(p){return (p.surfaceLabel||"").indexOf("Sterrato")>=0;}
function catColor(c){return {HC:"#7f1d1d","1":"#dc2626","2":"#ea580c","3":"#d97706","4":"#65a30d"}[c]||"#64748b";}
function catLabel(c){return c==="HC"?"HC":c;}
function trafColor(s){return s>=7?"#ef4444":s>=4?"#f59e0b":"#22c55e";}
/* returns {fer,wkd,trucks} for a versante; OSM passes carry baked scores at pass level */
function versTraffic(v,p){
  if(typeof v.trafFeriale==="number")return{fer:v.trafFeriale,wkd:v.trafWeekend,trucks:v.trucks||"rari"};
  if(p&&typeof p.trafFeriale==="number")return{fer:p.trafFeriale,wkd:p.trafWeekend,trucks:p.trucks||"rari"};
  var base=TRAF_MAP[v.traffic]||4;
  var tour=p&&TOURIST_REG[p.region]?2:1;
  var trucks=(p&&p.elevation>=1900)?"rari":(v.traffic==="alto"?"possibili":"rari");
  return{fer:base,wkd:Math.min(10,base+tour),trucks:trucks};
}
function trafBar(s){return'<div style="display:flex;align-items:center;gap:4px;justify-content:center"><div style="width:46px;height:7px;border-radius:4px;background:var(--bdr);overflow:hidden"><div style="width:'+(s*10)+'%;height:100%;background:'+trafColor(s)+'"></div></div><span style="font-size:.72em;color:var(--txt2)">'+s+'</span></div>';}
function truckBadge(t){var m={no:["&#x1F6AB; No camion","#22c55e"],rari:["&#x1F69A; Camion rari","#64748b"],possibili:["&#x1F69B; Possibili camion","#f59e0b"],si:["&#x1F69B; Camion frequenti","#ef4444"]};var x=m[t]||m.rari;return'<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.74em;font-weight:600;color:#fff;background:'+x[1]+'">'+x[0]+'</span>';}

/* ===== GEO HELPERS ===== */
function hav(la1,lo1,la2,lo2){var R=6371,p=Math.PI/180;var dLa=(la2-la1)*p,dLo=(lo2-lo1)*p;var x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*p)*Math.cos(la2*p)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(x));}
function compass(la1,lo1,la2,lo2){var p=Math.PI/180;var y=Math.sin((lo2-lo1)*p)*Math.cos(la2*p);var x=Math.cos(la1*p)*Math.sin(la2*p)-Math.sin(la1*p)*Math.cos(la2*p)*Math.cos((lo2-lo1)*p);var br=(Math.atan2(y,x)*180/Math.PI+360)%360;var d=["Nord","Nord-Est","Est","Sud-Est","Sud","Sud-Ovest","Ovest","Nord-Ovest"];return d[Math.round(br/45)%8];}
/* Point -> polyline nearest distance (meters) + distance-along the track at the projection (km).
   Local equirectangular projection: exact enough at the <500 m scale we filter on. track = [[lat,lon],...] */
function distPtToTrack(lat,lon,track){
  if(!track||!track.length)return null;
  if(track.length===1)return{distM:hav(lat,lon,track[0][0],track[0][1])*1000,along:0};
  var p=Math.PI/180,R=6371000,c0=Math.cos(lat*p);
  function XY(la,lo){return[R*lo*p*c0,R*la*p];}
  var P=XY(lat,lon),best=1e18,bestAlong=0,cum=0;
  for(var i=1;i<track.length;i++){
    var A=track[i-1],B=track[i],segKm=hav(A[0],A[1],B[0],B[1]);
    var a=XY(A[0],A[1]),b=XY(B[0],B[1]);
    var vx=b[0]-a[0],vy=b[1]-a[1],wx=P[0]-a[0],wy=P[1]-a[1];
    var L2=vx*vx+vy*vy,t=L2>0?(wx*vx+wy*vy)/L2:0;t=t<0?0:t>1?1:t;
    var dx=P[0]-(a[0]+t*vx),dy=P[1]-(a[1]+t*vy),d=Math.sqrt(dx*dx+dy*dy);
    if(d<best){best=d;bestAlong=cum+segKm*t;}
    cum+=segKm;
  }
  return{distM:best,along:bestAlong};
}
/* proximity -> shade of blue (route builder: dark on-route, paler as it strays) */
function waterColor(distM){return distM<=15?"#1e3a8a":distM<=30?"#2563eb":distM<=100?"#60a5fa":"#93c5fd";}
function waterPot(t){t=t||{};if(t.drinking_water==="no")return"Non potabile";if(t.drinking_water==="yes"||t.amenity==="drinking_water")return"Acqua potabile";if(t.natural==="spring")return"Sorgente";return"Potabilita non indicata";}
function estDiff(distKm,gain,top){if(!distKm||distKm<=0)return 1;var avg=gain/(distKm*10);var d=avg*0.85;d+=Math.min(distKm/6,2.5);if(avg>=12)d+=2;else if(avg>=9)d+=1;if(top>=2000)d+=1;return Math.max(1,Math.min(10,Math.round(d)));}

function calcSun(lat,lon,exp){
  if(typeof SunCalc==="undefined")return"N/D";
  var dirs={"Nord":[315,45],"Nord-Est":[0,90],"Est":[45,135],"Sud-Est":[90,180],"Sud":[135,225],"Sud-Ovest":[180,270],"Ovest":[225,315],"Nord-Ovest":[270,360]};
  var r=dirs[exp];if(!r)return"N/D";
  var today=new Date(),st=-1,en=-1;
  for(var h=5;h<=21;h++){var dt=new Date(today.getFullYear(),today.getMonth(),today.getDate(),h,0,0);var pos=SunCalc.getPosition(dt,lat,lon);if(pos.altitude<=0)continue;var az=(pos.azimuth*180/Math.PI+180)%360;var ok=false;if(r[0]>r[1])ok=(az>=r[0]||az<=r[1]);else ok=(az>=r[0]&&az<=r[1]);if(ok){if(st<0)st=h;en=h;}}
  if(st<0)return"&#x1F311; In ombra";return"&#x2600;&#xFE0F; "+st+":00-"+en+":00";
}
function truckRank(t){return {no:0,rari:1,possibili:2,si:3}[t]||1;}
function passTruck(p){if(!p.versanti||!p.versanti.length)return"rari";var w=0;p.versanti.forEach(function(v){w=Math.max(w,truckRank(versTraffic(v,p).trucks));});return["no","rari","possibili","si"][w];}
/* ===== Manual override layer + admin/community climb editor ================= */
function climbCat(d,g,t){if(g<150||d<1)return null;var f=(g*g)/(d*1000*10)+Math.max(0,t-1000)/1000;if(f>=8)return"HC";if(f>=5.5)return"1";if(f>=3.5)return"2";if(f>=2)return"3";return"4";}
function catRank(c){return {HC:5,"1":4,"2":3,"3":2,"4":1}[c]||0;}
/* ===== GPX export (client-side, per versante) =============================== */
function gpxEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}