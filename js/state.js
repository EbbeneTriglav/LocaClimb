/* Shared mutable global state + constants used across the app's classic <script> files. */
/* Where the data layer lives, relative to index.html. Single source of truth for the
   frontend (scripts/lib/paths.mjs is the Node-side equivalent). Change here to relocate. */
var DATA_DIR="data/";
var map,markers,routeLines=[],weatherCache={},routeCache={};
var rbMode=false,rbStops=[],rbLine=null,rbTrack=[],wpMarkers=[];
var osmPasses=[],osmEnrichCache={},showOsm=true;
/* two-stage OSM load: osmFullPending resolves when the region files (tracks) are in; osmFull flags it */
var osmFullPending=null,osmFull=false;
var OVERPASS="https://overpass-api.de/api/interpreter";
var ELEV_API="https://api.open-meteo.com/v1/elevation";
var BROUTER="https://brouter.de/brouter";
var OSM_CACHE_KEY="locaclimb_osm_v1";
var DAYS=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
var VCOLS=["#2563eb","#f59e0b","#10b981","#ec4899"];
var SURF_COLORS={"asfalto":"#2563eb","sterrato":"#f59e0b","fondo naturale":"#b45309","altro":"#94a3b8"};
var heatLayer=null,heatOn=false;
var versLayers=[],versStartMarkers=[],trafficLayer=null;
var searchItems=[],surfOverlay=null,routeSurfSegs=[];
var rbHoverKm=null;   /* km sotto il cursore: tiene in sincrono altimetria <-> mappa */
/* known Strava segment IDs per pass (passId -> {side label: segmentId}) */
var STRAVA_SEGMENTS={stelvio:{"Prato allo Stelvio":614103,"Bormio":614115},gavia:{"Ponte di Legno":1084024},mortirolo:{"Mazzo di Valtellina":617404},zoncolan:{"Ovaro":1253584}};
/* regions where weekend/summer car+moto traffic spikes (tourism) */
var TOURIST_REG={"Trentino-Alto Adige":1,"Veneto":1,"Veneto/Trentino":1,"Lombardia/Trentino":1};
var WC={0:"&#x2600;&#xFE0F;",1:"&#x1F324;&#xFE0F;",2:"&#x26C5;",3:"&#x2601;&#xFE0F;",45:"&#x1F32B;&#xFE0F;",48:"&#x1F32B;&#xFE0F;",51:"&#x1F326;&#xFE0F;",53:"&#x1F326;&#xFE0F;",55:"&#x1F327;&#xFE0F;",61:"&#x1F327;&#xFE0F;",63:"&#x1F327;&#xFE0F;",65:"&#x1F327;&#xFE0F;",71:"&#x1F328;&#xFE0F;",73:"&#x1F328;&#xFE0F;",75:"&#x1F328;&#xFE0F;",80:"&#x1F326;&#xFE0F;",81:"&#x1F327;&#xFE0F;",82:"&#x1F327;&#xFE0F;",95:"&#x26C8;&#xFE0F;",96:"&#x26C8;&#xFE0F;",99:"&#x26C8;&#xFE0F;"};
/* ===== TRAFFIC MODEL ===== */
var TRAF_MAP={basso:2,medio:5,alto:8};
// manual_overrides.json is human-owned and NEVER written by the build; merged LAST so it wins.
window.MANUAL_OV=null;

var ED={pass:null,isNew:false,summit:null,versanti:[],track:[],markers:[],line:null,pending:null,store:{},_await:false,_sm:null};
var edDraw=false;
/* Optional VPS-hosted alternative to the "Salva diretto (admin)" GitHub section below:
   a small server (server/save-api.mjs) holds the GitHub token so the browser only ever
   sends a shared admin passphrase to *your own* endpoint. Blank endpoint = inert, exactly
   like FIREBASE_CONFIG below - the GitHub section keeps working either way. */
var VPS_API_CONFIG={endpoint:""};
/* ===== Accounts + community ratings (Firebase) ============================== */
/* Incolla qui la config del tuo progetto Firebase (Console -> Impostazioni progetto -> Le tue app -> Web). */
var FIREBASE_CONFIG={apiKey:"",authDomain:"",projectId:"",appId:""};
var CUR_PASS=null,FB=null,FBUSER=null;
/* ===== Fontanelle / drinking water from OSM via Overpass ==================== */
var fountOn=false,fountLayer=null,fountIds={},fountTimer=null,fountIcon=null;
var MIN_FOUNT_ZOOM=12,fountHintShown=false;                 // fontanelle: solo da questo zoom in su (perf su aree vaste)
var WATER_MIRRORS=["https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
var waterCache={},waterInflight={};                          // bbox -> nodi (cache) / callback in attesa (dedup)
/* Acqua su salita (buffer 100m) e su percorso (buffer 200m, colore per vicinanza) */
var climbWaterLayer=null,climbWater=[],climbWaterIcon=null;
var routeWaterLayer=null,routeWater=[];
/* ===== News / Stato (curated JSON, optional automated candidates) ========== */
var PASS_NEWS=null,newsFailed=false;