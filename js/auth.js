/* Optional Firebase auth + community ratings (inert until FIREBASE_CONFIG is filled in). */
function fbReady(){return !!(FIREBASE_CONFIG.apiKey&&window.firebase);}
function fbInit(){
  var b=document.getElementById("acct");if(b)b.addEventListener("click",acctOpen);
  if(!fbReady())return;
  try{firebase.initializeApp(FIREBASE_CONFIG);FB={auth:firebase.auth(),db:firebase.firestore()};}catch(e){return;}
  FB.auth.onAuthStateChanged(function(u){FBUSER=u;acctUpdate();if(CUR_PASS)renderRatings(CUR_PASS);});
}
function acctUpdate(){var b=document.getElementById("acct");if(!b)return;var lab=b.querySelector(".bl");if(lab)lab.textContent=FBUSER?(FBUSER.displayName||"Account").substring(0,12):"Accedi";}
function fbErr(e){var c=(e&&e.code)||"",m={"auth/email-already-in-use":"Email gia registrata.","auth/invalid-email":"Email non valida.","auth/weak-password":"Password troppo corta (min 6).","auth/wrong-password":"Password errata.","auth/user-not-found":"Utente non trovato.","auth/invalid-credential":"Credenziali errate.","auth/too-many-requests":"Troppi tentativi, riprova piu tardi."};return m[c]||((e&&e.message)||"Errore.");}
function fbResend(){if(FBUSER)FBUSER.sendEmailVerification().then(function(){alert("Mail di conferma reinviata.");});}
function acctOpen(){
  if(!fbReady()){alert("Account non ancora configurato: incolla la config Firebase in index.html (variabile FIREBASE_CONFIG).");return;}
  if(FBUSER){if(confirm("Sei loggato come "+(FBUSER.displayName||FBUSER.email)+".\nVuoi uscire?"))FB.auth.signOut();return;}
  var ex=document.getElementById("acctModal");if(ex)ex.remove();
  var d=document.createElement("div");d.id="acctModal";d.style.cssText="position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center";
  d.innerHTML='<div style="background:#fff;color:#222;border-radius:12px;padding:18px;width:300px;font:14px system-ui"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b id="amTitle">Accedi</b><span id="amX" style="cursor:pointer;font-size:20px">&times;</span></div><div id="amForm"></div><div id="amMsg" style="font-size:12px;color:#555;margin-top:8px;min-height:14px"></div><div style="margin-top:8px;font-size:12px"><a href="#" id="amSwitch">Non hai un account? Registrati</a></div></div>';
  document.body.appendChild(d);
  document.getElementById("amX").onclick=function(){d.remove();};
  var mode="login";
  function draw(){var f=document.getElementById("amForm"),inp="padding:8px;border:1px solid #ccc;border-radius:7px;width:100%;box-sizing:border-box;margin-bottom:6px";
    if(mode==="login"){f.innerHTML='<input id="amEmail" type="email" placeholder="Email" style="'+inp+'"><input id="amPass" type="password" placeholder="Password" style="'+inp+'"><button class="btn" style="width:100%" data-act="amLogin">Accedi</button>';document.getElementById("amTitle").textContent="Accedi";document.getElementById("amSwitch").textContent="Non hai un account? Registrati";}
    else{f.innerHTML='<input id="amUser" placeholder="Nome utente" style="'+inp+'"><input id="amEmail" type="email" placeholder="Email" style="'+inp+'"><input id="amPass" type="password" placeholder="Password (min 6)" style="'+inp+'"><button class="btn" style="width:100%" data-act="amSignup">Registrati</button>';document.getElementById("amTitle").textContent="Registrati";document.getElementById("amSwitch").textContent="Hai gia un account? Accedi";}}
  document.getElementById("amSwitch").onclick=function(e){e.preventDefault();mode=mode==="login"?"signup":"login";draw();};
  draw();
}
function amMsg(t){var e=document.getElementById("amMsg");if(e)e.textContent=t;}
function amLogin(){var em=document.getElementById("amEmail").value.trim(),pw=document.getElementById("amPass").value;amMsg("Accesso...");
  FB.auth.signInWithEmailAndPassword(em,pw).then(function(cr){if(!cr.user.emailVerified){amMsg("Conferma prima la mail (controlla la posta). ");}else{var m=document.getElementById("acctModal");if(m)m.remove();}}).catch(function(e){amMsg(fbErr(e));});}
function amSignup(){var un=document.getElementById("amUser").value.trim(),em=document.getElementById("amEmail").value.trim(),pw=document.getElementById("amPass").value;
  if(un.length<2)return amMsg("Inserisci un nome utente.");amMsg("Registrazione...");
  FB.auth.createUserWithEmailAndPassword(em,pw).then(function(cr){return cr.user.updateProfile({displayName:un}).then(function(){FB.db.collection("users").doc(cr.user.uid).set({username:un,email:em,createdAt:Date.now()});return cr.user.sendEmailVerification();}).then(function(){return FB.auth.signOut();});}).then(function(){amMsg("Registrato! Ti ho inviato una mail di conferma. Confermala, poi accedi.");}).catch(function(e){amMsg(fbErr(e));});}
function axisRow(label,val,n){var pct=n?(val/5*100):0;return '<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:.82rem"><span style="width:78px;color:var(--txt2)">'+esc(label)+'</span><div style="flex:1;height:8px;background:var(--bdr);border-radius:5px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#2563eb,#7c3aed)"></div></div><span style="width:26px;text-align:right">'+(n?val.toFixed(1):"-")+'</span></div>';}
function voteSel(id,lab,inline){var s='<div style="display:flex;align-items:center;gap:6px;margin:3px 0;font-size:.82rem"><span style="width:78px">'+esc(lab)+'</span><select id="rv_'+id+'" style="flex:1;padding:3px;border:1px solid var(--bdr);border-radius:6px;background:var(--bg);color:var(--txt)">';for(var i=1;i<=5;i++)s+='<option value="'+i+'">'+i+'</option>';return s+'</select></div>';}
function renderRatings(p){
  var box=document.getElementById("ratebox");if(!box)return;
  if(!fbReady()){box.innerHTML='Account/valutazioni disponibili dopo la configurazione Firebase (vedi guida).';return;}
  if(!FB){box.innerHTML='Servizio non disponibile.';return;}
  var pid=p.id;
  FB.db.collection("ratings").doc(pid).get().then(function(d){
    var a=d.exists?d.data():{n:0,eSum:0,pSum:0,tSum:0,aSum:0},n=a.n||0;
    function av(s){return n?s/n:0;}
    var aE=av(a.eSum),aP=av(a.pSum),aT=av(a.tSum),aA=av(a.aSum),ov=n?(aE+aP+aT+aA)/4:0;
    var html='<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px"><b style="font-size:1.35rem;color:var(--txt)">'+(n?ov.toFixed(1):"-")+'</b><span style="color:var(--txt2)">/5 &middot; '+n+' voti</span></div>';
    html+=axisRow("Emozione",aE,n)+axisRow("Paesaggio",aP,n)+axisRow("Traffico",aT,n)+axisRow("Asfalto",aA,n);
    if(FBUSER&&FBUSER.emailVerified){
      html+='<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)"><div style="font-weight:600;margin-bottom:4px">Il tuo voto</div>'+voteSel("e","Emozione")+voteSel("p","Paesaggio")+voteSel("t","Traffico")+voteSel("a","Asfalto")+'<button class="btn" style="margin-top:6px" data-act="submitVote" data-id="'+esc(pid)+'">Invia voto</button></div>';
      box.innerHTML=html;
      FB.db.collection("ratings").doc(pid).collection("votes").doc(FBUSER.uid).get().then(function(vd){if(vd.exists){var v=vd.data();["e","p","t","a"].forEach(function(k){var s=document.getElementById("rv_"+k);if(s&&v[k])s.value=v[k];});}});
    } else if(FBUSER){html+='<div style="margin-top:6px;color:var(--txt2)">Conferma la mail per votare. <a href="#" data-act="fbResend">Reinvia conferma</a></div>';box.innerHTML=html;}
    else{html+='<div style="margin-top:8px"><button class="btn" data-act="acctOpen">Accedi per votare</button></div>';box.innerHTML=html;}
  }).catch(function(){box.innerHTML='Valutazioni non disponibili (controlla le regole Firestore).';});
}
function submitVote(pid){
  if(!FB||!FBUSER)return;
  var e=+document.getElementById("rv_e").value,p2=+document.getElementById("rv_p").value,t=+document.getElementById("rv_t").value,a=+document.getElementById("rv_a").value;
  var passRef=FB.db.collection("ratings").doc(pid),voteRef=passRef.collection("votes").doc(FBUSER.uid);
  FB.db.runTransaction(function(tx){return tx.get(voteRef).then(function(vs){return tx.get(passRef).then(function(ps){
    var agg=ps.exists?ps.data():{n:0,eSum:0,pSum:0,tSum:0,aSum:0},old=vs.exists?vs.data():null;
    if(old){agg.eSum-=old.e;agg.pSum-=old.p;agg.tSum-=old.t;agg.aSum-=old.a;agg.n-=1;}
    agg.eSum+=e;agg.pSum+=p2;agg.tSum+=t;agg.aSum+=a;agg.n+=1;
    tx.set(passRef,agg);tx.set(voteRef,{e:e,p:p2,t:t,a:a,by:FBUSER.displayName||"",ts:Date.now()});
  });});}).then(function(){if(CUR_PASS)renderRatings(CUR_PASS);}).catch(function(err){alert("Errore voto: "+(err.message||err));});
}