// ============================================================
// passes_data.js v2 — Database salite + Bike Events + Route Coords
// ============================================================

const BIKE_EVENTS = [
  {name:"Enjoy Stelvio - San Marco",date:"2026-05-30",passes:["san-marco"],hours:"8:00-15:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Enjoy Stelvio - Gavia",date:"2026-06-05",passes:["gavia"],hours:"8:00-15:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Sellaronda Bike Day",date:"2026-06-06",passes:["sella","pordoi","campolongo","gardena"],hours:"8:30-16:00",url:"https://www.sellarondabikeday.com",free:true},
  {name:"Enjoy Stelvio - Mortirolo",date:"2026-06-09",passes:["mortirolo"],hours:"8:00-15:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Dolomites Bike Day",date:"2026-06-20",passes:["campolongo","falzarego"],hours:"8:30-15:00",url:"https://www.dolomitesbikeday.it",free:true},
  {name:"Enjoy Stelvio - Spluga",date:"2026-06-28",passes:["spluga"],hours:"8:00-15:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Maratona dles Dolomites",date:"2026-07-05",passes:["campolongo","pordoi","sella","gardena","giau","falzarego"],hours:"6:30-16:00",url:"https://www.maratona.it",free:false},
  {name:"Stelvio Bike Day / Cima Coppi",date:"2026-08-29",passes:["stelvio","stelvio-trafoi"],hours:"7:00-16:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Enjoy Stelvio - Gavia",date:"2026-08-30",passes:["gavia"],hours:"8:00-15:00",url:"https://www.enjoystelvio.it",free:true},
  {name:"Sellaronda Bike Day (autunno)",date:"2026-09-12",passes:["sella","pordoi","campolongo","gardena"],hours:"8:30-16:00",url:"https://www.sellarondabikeday.com",free:true},
  {name:"Enjoy Stelvio - Stelvio",date:"2026-09-19",passes:["stelvio"],hours:"7:00-16:00",url:"https://www.enjoystelvio.it",free:true}
];

const PASSES_DATA = [
  {
    id:"stelvio",name:"Passo dello Stelvio",lat:46.5287,lon:10.4531,elevation:2758,
    region:"Lombardia / Trentino-Alto Adige",status:"seasonal",difficulty:10,
    description:"Il secondo passo asfaltato piu alto delle Alpi. Simbolo del Giro d'Italia con 48 tornanti sul versante est.",
    tips:["Partire presto per evitare il traffico motociclistico","Portare giacca antivento anche d'estate","Apertura: fine maggio - inizio novembre","Versante Prato: ombra fino alle 10, ottimo per le ore calde"],
    versanti:[
      {side:"Prato allo Stelvio (Est)",startElevation:911,endElevation:2758,distance_km:24.7,avgGradient:7.5,maxGradient:10.2,traffic:"alto",exposure:"Est",
       elevationProfile:[911,1050,1200,1350,1500,1650,1800,1950,2100,2250,2400,2550,2700,2758],
       routeCoords:[[46.617,10.584],[46.612,10.570],[46.601,10.555],[46.590,10.540],[46.580,10.525],[46.572,10.510],[46.565,10.498],[46.558,10.488],[46.550,10.476],[46.543,10.465],[46.538,10.458],[46.533,10.454],[46.529,10.453]]},
      {side:"Bormio (Ovest)",startElevation:1225,endElevation:2758,distance_km:21.5,avgGradient:7.1,maxGradient:10.8,traffic:"medio",exposure:"Ovest",
       elevationProfile:[1225,1400,1575,1750,1925,2050,2175,2300,2425,2550,2650,2758],
       routeCoords:[[46.468,10.370],[46.473,10.380],[46.480,10.392],[46.488,10.405],[46.495,10.415],[46.500,10.425],[46.507,10.433],[46.512,10.440],[46.518,10.445],[46.524,10.450],[46.528,10.453]]}
    ]
  },
  {
    id:"gavia",name:"Passo di Gavia",lat:46.3453,lon:10.4889,elevation:2618,
    region:"Lombardia",status:"seasonal",difficulty:9,
    description:"Passo epico e selvaggio con tratti di strada stretta e panorami mozzafiato verso l'Adamello.",
    tips:["Strada stretta: attenzione in discesa","Neve possibile anche a giugno","Versante sud piu regolare"],
    versanti:[
      {side:"Ponte di Legno (Sud)",startElevation:1258,endElevation:2618,distance_km:16.5,avgGradient:8.0,maxGradient:11.5,traffic:"basso",exposure:"Sud",
       elevationProfile:[1258,1400,1540,1680,1820,1960,2100,2200,2350,2450,2550,2618],
       routeCoords:[[46.260,10.507],[46.268,10.504],[46.278,10.500],[46.288,10.497],[46.298,10.495],[46.308,10.492],[46.318,10.490],[46.328,10.489],[46.338,10.488],[46.345,10.489]]},
      {side:"Bormio (Nord)",startElevation:1225,endElevation:2618,distance_km:25.0,avgGradient:5.6,maxGradient:11.2,traffic:"basso",exposure:"Nord",
       elevationProfile:[1225,1330,1440,1550,1660,1770,1880,1990,2100,2200,2300,2400,2500,2618],
       routeCoords:[[46.468,10.370],[46.458,10.380],[46.448,10.392],[46.438,10.405],[46.428,10.418],[46.418,10.430],[46.405,10.445],[46.395,10.458],[46.378,10.470],[46.365,10.480],[46.355,10.486],[46.345,10.489]]}
    ]
  },
  {
    id:"mortirolo",name:"Passo del Mortirolo",lat:46.2353,lon:10.3078,elevation:1852,
    region:"Lombardia",status:"seasonal",difficulty:10,
    description:"Una delle salite piu dure d'Europa. Il monumento a Pantani segna il punto piu iconico.",
    tips:["Versante Mazzo: pendenze fino al 18%!","Pochissimo traffico: ideale per pedalare in pace","Fondamentale rapporti agili"],
    versanti:[
      {side:"Mazzo di Valtellina (Ovest)",startElevation:552,endElevation:1852,distance_km:12.3,avgGradient:10.6,maxGradient:18.0,traffic:"basso",exposure:"Ovest",
       elevationProfile:[552,680,830,990,1150,1300,1440,1560,1670,1760,1820,1852],
       routeCoords:[[46.216,10.257],[46.220,10.265],[46.223,10.272],[46.226,10.278],[46.228,10.285],[46.230,10.292],[46.232,10.298],[46.234,10.305],[46.235,10.308]]},
      {side:"Edolo (Nord)",startElevation:717,endElevation:1852,distance_km:13.8,avgGradient:8.2,maxGradient:11.6,traffic:"basso",exposure:"Nord",
       elevationProfile:[717,830,950,1060,1170,1280,1400,1510,1620,1720,1800,1852],
       routeCoords:[[46.175,10.332],[46.183,10.328],[46.190,10.323],[46.197,10.318],[46.204,10.314],[46.211,10.312],[46.218,10.310],[46.225,10.309],[46.232,10.308],[46.235,10.308]]}
    ]
  },
  {
    id:"zoncolan",name:"Monte Zoncolan",lat:46.4523,lon:12.9289,elevation:1730,
    region:"Friuli-Venezia Giulia",status:"open",difficulty:10,
    description:"Il Kaiser delle salite italiane. Il versante ovest ha il km piu duro d'Italia (17.6% media).",
    tips:["Versante ovest: il km piu duro d'Italia!","Versante est piu 'umano' ma comunque durissimo","Panorama spettacolare sulle Alpi Carniche"],
    versanti:[
      {side:"Ovaro (Ovest)",startElevation:534,endElevation:1730,distance_km:9.8,avgGradient:12.2,maxGradient:17.6,traffic:"basso",exposure:"Ovest",
       elevationProfile:[534,680,850,1020,1180,1340,1480,1600,1700,1730],
       routeCoords:[[46.473,12.870],[46.470,12.880],[46.467,12.892],[46.463,12.903],[46.460,12.912],[46.457,12.920],[46.455,12.927],[46.453,12.929]]},
      {side:"Sutrio (Est)",startElevation:538,endElevation:1730,distance_km:13.2,avgGradient:9.1,maxGradient:15.2,traffic:"basso",exposure:"Est",
       elevationProfile:[538,650,770,890,1010,1120,1240,1360,1470,1580,1670,1730],
       routeCoords:[[46.508,12.988],[46.502,12.978],[46.496,12.968],[46.490,12.958],[46.484,12.950],[46.478,12.944],[46.472,12.938],[46.466,12.934],[46.460,12.931],[46.455,12.929],[46.453,12.929]]}
    ]
  },
  {
    id:"pordoi",name:"Passo Pordoi",lat:46.4878,lon:11.8122,elevation:2239,
    region:"Trentino-Alto Adige / Veneto",status:"seasonal",difficulty:7,
    description:"Il passo piu alto delle Dolomiti toccato dal Giro d'Italia. Panorama a 360 gradi.",
    tips:["Salita regolare da entrambi i versanti","Traffico elevato in estate, preferire feriali","Bar e ristori in cima"],
    versanti:[
      {side:"Canazei (Nord-Ovest)",startElevation:1465,endElevation:2239,distance_km:12.6,avgGradient:6.1,maxGradient:9.2,traffic:"alto",exposure:"Nord-Ovest",
       elevationProfile:[1465,1550,1640,1730,1820,1910,2000,2080,2150,2200,2239],
       routeCoords:[[46.476,11.770],[46.479,11.776],[46.482,11.782],[46.484,11.789],[46.486,11.796],[46.487,11.802],[46.488,11.808],[46.488,11.812]]},
      {side:"Arabba (Sud-Est)",startElevation:1602,endElevation:2239,distance_km:9.4,avgGradient:6.8,maxGradient:10.0,traffic:"alto",exposure:"Sud-Est",
       elevationProfile:[1602,1700,1800,1900,1990,2070,2140,2200,2239],
       routeCoords:[[46.497,11.874],[46.496,11.862],[46.495,11.850],[46.493,11.840],[46.492,11.830],[46.490,11.822],[46.489,11.815],[46.488,11.812]]}
    ]
  },
  {
    id:"sella",name:"Passo Sella",lat:46.5089,lon:11.7600,elevation:2240,
    region:"Trentino-Alto Adige",status:"seasonal",difficulty:7,
    description:"Parte del Sellaronda, con vista iconica sul Sassolungo.",
    tips:["Inseriscilo nel Sellaronda: Sella, Pordoi, Campolongo, Gardena","Vista incredibile sul Sassolungo al tramonto"],
    versanti:[
      {side:"Canazei (Sud)",startElevation:1465,endElevation:2240,distance_km:11.4,avgGradient:6.8,maxGradient:11.8,traffic:"alto",exposure:"Sud",
       elevationProfile:[1465,1560,1660,1760,1860,1960,2050,2130,2190,2240],
       routeCoords:[[46.476,11.770],[46.480,11.768],[46.486,11.764],[46.492,11.762],[46.498,11.760],[46.504,11.760],[46.509,11.760]]},
      {side:"Selva Val Gardena (Nord)",startElevation:1563,endElevation:2240,distance_km:10.2,avgGradient:6.6,maxGradient:10.5,traffic:"alto",exposure:"Nord",
       elevationProfile:[1563,1650,1750,1850,1950,2040,2120,2180,2220,2240],
       routeCoords:[[46.556,11.760],[46.548,11.759],[46.540,11.758],[46.532,11.758],[46.524,11.759],[46.516,11.760],[46.509,11.760]]}
    ]
  },
  {
    id:"gardena",name:"Passo Gardena",lat:46.5336,lon:11.8092,elevation:2136,
    region:"Trentino-Alto Adige",status:"seasonal",difficulty:5,
    description:"Il passo piu accessibile del Sellaronda. Panorami aperti sulle Dolomiti.",
    tips:["Salita corta e relativamente facile","Collegamento ideale con Passo Sella e Pordoi"],
    versanti:[
      {side:"Corvara (Sud)",startElevation:1568,endElevation:2136,distance_km:6.0,avgGradient:9.5,maxGradient:12.0,traffic:"alto",exposure:"Sud",
       elevationProfile:[1568,1680,1790,1900,2010,2100,2136],
       routeCoords:[[46.512,11.871],[46.518,11.860],[46.523,11.848],[46.528,11.836],[46.532,11.820],[46.534,11.810]]},
      {side:"Selva Val Gardena (Ovest)",startElevation:1563,endElevation:2136,distance_km:6.3,avgGradient:9.1,maxGradient:11.5,traffic:"alto",exposure:"Nord-Ovest",
       elevationProfile:[1563,1670,1780,1880,1980,2070,2136],
       routeCoords:[[46.556,11.760],[46.552,11.770],[46.548,11.780],[46.544,11.790],[46.540,11.800],[46.534,11.810]]}
    ]
  },
  {
    id:"campolongo",name:"Passo Campolongo",lat:46.5064,lon:11.8492,elevation:1875,
    region:"Trentino-Alto Adige / Veneto",status:"seasonal",difficulty:4,
    description:"Il passo piu facile del Sellaronda. Breve e dolce tra Arabba e Corvara.",
    tips:["Ottimo per principianti","Partire da Arabba per farlo come ultimo passo del giro"],
    versanti:[
      {side:"Arabba (Sud-Est)",startElevation:1602,endElevation:1875,distance_km:5.8,avgGradient:4.7,maxGradient:8.0,traffic:"medio",exposure:"Sud-Est",
       elevationProfile:[1602,1660,1720,1780,1830,1875],
       routeCoords:[[46.497,11.874],[46.499,11.868],[46.501,11.862],[46.503,11.856],[46.505,11.850],[46.506,11.849]]}
    ]
  },
  {
    id:"giau",name:"Passo Giau",lat:46.4833,lon:12.0514,elevation:2236,
    region:"Veneto",status:"seasonal",difficulty:8,
    description:"Uno dei passi piu scenografici delle Dolomiti. Prati fioriti e viste su Pelmo e Civetta.",
    tips:["Versante da Selva di Cadore: muro finale al 15%!","Poco traffico rispetto al Sellaronda","Tramonto incredibile dal passo"],
    versanti:[
      {side:"Selva di Cadore (Sud-Ovest)",startElevation:998,endElevation:2236,distance_km:15.6,avgGradient:7.9,maxGradient:15.0,traffic:"basso",exposure:"Sud-Ovest",
       elevationProfile:[998,1120,1250,1380,1510,1640,1770,1880,1980,2060,2130,2190,2236],
       routeCoords:[[46.443,12.031],[46.449,12.035],[46.455,12.038],[46.460,12.042],[46.465,12.045],[46.469,12.048],[46.473,12.050],[46.477,12.051],[46.483,12.051]]},
      {side:"Cortina (Nord-Est)",startElevation:1200,endElevation:2236,distance_km:15.8,avgGradient:6.6,maxGradient:10.3,traffic:"basso",exposure:"Nord-Est",
       elevationProfile:[1200,1320,1440,1560,1680,1800,1900,1980,2060,2130,2190,2236],
       routeCoords:[[46.537,12.102],[46.530,12.096],[46.523,12.090],[46.516,12.084],[46.509,12.078],[46.502,12.072],[46.496,12.065],[46.490,12.058],[46.483,12.051]]}
    ]
  },
  {
    id:"falzarego",name:"Passo Falzarego",lat:46.5192,lon:12.0050,elevation:2105,
    region:"Veneto",status:"seasonal",difficulty:6,
    description:"Vista diretta sulle Tofane e il Lagazuoi.",
    tips:["Combinare con Valparola per un giro completo","Funivia per il Lagazuoi in cima"],
    versanti:[
      {side:"Cortina d'Ampezzo (Est)",startElevation:1224,endElevation:2105,distance_km:18.0,avgGradient:4.9,maxGradient:9.0,traffic:"medio",exposure:"Est",
       elevationProfile:[1224,1320,1420,1520,1620,1720,1800,1880,1950,2010,2060,2105],
       routeCoords:[[46.540,12.132],[46.536,12.118],[46.533,12.104],[46.530,12.090],[46.527,12.076],[46.525,12.062],[46.523,12.048],[46.522,12.034],[46.521,12.020],[46.520,12.005]]}
    ]
  },
  {
    id:"spluga",name:"Passo dello Spluga",lat:46.5050,lon:9.3375,elevation:2113,
    region:"Lombardia",status:"seasonal",difficulty:8,
    description:"Passo di confine italo-svizzero con la spettacolare gola della Via Mala.",
    tips:["La gola sul versante sud e' uno degli scenari piu drammatici delle Alpi","Versante italiano lunghissimo da Chiavenna"],
    versanti:[
      {side:"Chiavenna (Sud)",startElevation:325,endElevation:2113,distance_km:30.0,avgGradient:6.0,maxGradient:10.0,traffic:"medio",exposure:"Sud",
       elevationProfile:[325,460,600,750,900,1050,1200,1350,1480,1600,1720,1840,1950,2050,2113],
       routeCoords:[[46.320,9.397],[46.335,9.391],[46.350,9.384],[46.365,9.378],[46.380,9.372],[46.395,9.366],[46.410,9.361],[46.425,9.356],[46.440,9.352],[46.455,9.348],[46.470,9.344],[46.485,9.340],[46.498,9.338],[46.505,9.338]]}
    ]
  },
  {
    id:"san-marco",name:"Passo di San Marco",lat:46.0497,lon:9.6217,elevation:1992,
    region:"Lombardia",status:"seasonal",difficulty:8,
    description:"Collega la Val Brembana alla Valtellina. Salita lunga e impegnativa.",
    tips:["Versante da Mezzoldo piu impegnativo","Strada inclusa nelle chiusure Enjoy Stelvio Valtellina"],
    versanti:[
      {side:"Mezzoldo (Sud)",startElevation:830,endElevation:1992,distance_km:13.0,avgGradient:8.9,maxGradient:14.0,traffic:"basso",exposure:"Sud",
       elevationProfile:[830,960,1100,1240,1380,1520,1660,1790,1900,1992],
       routeCoords:[[45.988,9.660],[45.995,9.654],[46.002,9.648],[46.009,9.642],[46.016,9.636],[46.023,9.632],[46.030,9.628],[46.038,9.626],[46.045,9.623],[46.050,9.622]]}
    ]
  },
  {
    id:"grappa",name:"Monte Grappa",lat:45.8758,lon:11.7808,elevation:1745,
    region:"Veneto",status:"open",difficulty:8,
    description:"Montagna sacra della Grande Guerra. Tre versanti diversi, tutti durissimi e panoramici.",
    tips:["Versante Romano d'Ezzelino: il piu classico","Vento forte frequente in cima","Sacrario militare in vetta"],
    versanti:[
      {side:"Romano d'Ezzelino (Sud)",startElevation:118,endElevation:1745,distance_km:26.0,avgGradient:6.3,maxGradient:11.0,traffic:"medio",exposure:"Sud",
       elevationProfile:[118,280,450,620,790,960,1100,1240,1370,1480,1580,1660,1720,1745],
       routeCoords:[[45.780,11.778],[45.795,11.779],[45.810,11.780],[45.825,11.781],[45.840,11.782],[45.852,11.783],[45.862,11.782],[45.870,11.781],[45.876,11.781]]},
      {side:"Possagno (Nord)",startElevation:280,endElevation:1745,distance_km:20.7,avgGradient:7.1,maxGradient:16.0,traffic:"basso",exposure:"Nord",
       elevationProfile:[280,420,570,720,870,1020,1170,1310,1440,1560,1660,1730,1745],
       routeCoords:[[45.958,11.808],[45.948,11.804],[45.938,11.800],[45.928,11.796],[45.918,11.793],[45.908,11.790],[45.898,11.787],[45.888,11.785],[45.880,11.782],[45.876,11.781]]}
    ]
  },
  {
    id:"manghen",name:"Passo Manghen",lat:46.1767,lon:11.4542,elevation:2047,
    region:"Trentino",status:"seasonal",difficulty:9,
    description:"Il passo asfaltato piu alto del Trentino. Salita lunghissima e selvaggia.",
    tips:["Quasi zero traffico: paradiso per ciclisti","Fondamentale partire con acqua sufficiente","Salita lunga e solitaria"],
    versanti:[
      {side:"Borgo Valsugana (Sud)",startElevation:355,endElevation:2047,distance_km:23.0,avgGradient:7.4,maxGradient:10.5,traffic:"basso",exposure:"Sud",
       elevationProfile:[355,500,650,800,950,1100,1250,1400,1540,1680,1800,1920,2047],
       routeCoords:[[46.040,11.460],[46.055,11.458],[46.070,11.456],[46.085,11.455],[46.100,11.454],[46.115,11.453],[46.130,11.453],[46.145,11.453],[46.160,11.454],[46.177,11.454]]}
    ]
  },
  {
    id:"presolana",name:"Passo della Presolana",lat:45.9650,lon:10.0736,elevation:1297,
    region:"Lombardia",status:"open",difficulty:5,
    description:"Salita panoramica con vista sulla maestosa Presolana. Dalla bergamasca.",
    tips:["Salita accessibile e panoramica","Diversi bar lungo il percorso"],
    versanti:[
      {side:"Clusone (Ovest)",startElevation:648,endElevation:1297,distance_km:14.0,avgGradient:4.6,maxGradient:9.0,traffic:"medio",exposure:"Ovest",
       elevationProfile:[648,720,800,880,960,1040,1100,1160,1220,1270,1297],
       routeCoords:[[45.890,10.020],[45.900,10.028],[45.910,10.035],[45.920,10.042],[45.930,10.050],[45.940,10.058],[45.950,10.065],[45.960,10.072],[45.965,10.074]]}
    ]
  },
  {
    id:"tonale",name:"Passo del Tonale",lat:46.2603,lon:10.5867,elevation:1883,
    region:"Lombardia / Trentino",status:"open",difficulty:4,
    description:"Passo ampio e ben asfaltato. Salita regolare e adatta a tutti.",
    tips:["Ideale per chi inizia con i passi alpini","Collegamento comodo per Gavia e Stelvio"],
    versanti:[
      {side:"Edolo (Ovest)",startElevation:699,endElevation:1883,distance_km:24.0,avgGradient:4.9,maxGradient:8.0,traffic:"medio",exposure:"Ovest",
       elevationProfile:[699,780,870,960,1050,1140,1230,1320,1410,1500,1580,1660,1740,1810,1883],
       routeCoords:[[46.175,10.332],[46.185,10.350],[46.195,10.370],[46.205,10.392],[46.215,10.415],[46.225,10.440],[46.235,10.468],[46.245,10.498],[46.252,10.530],[46.258,10.560],[46.260,10.587]]}
    ]
  },
  {
    id:"fedaia",name:"Passo Fedaia",lat:46.4558,lon:11.8719,elevation:2057,
    region:"Trentino-Alto Adige / Veneto",status:"seasonal",difficulty:7,
    description:"Ai piedi della Marmolada, con il lago Fedaia in cima.",
    tips:["La parte finale dal lago e' un muro!","Galleria sul versante Canazei: luci obbligatorie"],
    versanti:[
      {side:"Canazei (Ovest)",startElevation:1465,endElevation:2057,distance_km:14.0,avgGradient:4.2,maxGradient:13.1,traffic:"medio",exposure:"Ovest",
       elevationProfile:[1465,1510,1560,1610,1670,1730,1800,1870,1930,1980,2020,2057],
       routeCoords:[[46.476,11.770],[46.474,11.790],[46.471,11.810],[46.468,11.830],[46.464,11.845],[46.460,11.858],[46.457,11.870],[46.456,11.872]]}
    ]
  },
  {
    id:"stelvio-trafoi",name:"Stelvio (da Trafoi)",lat:46.5287,lon:10.4531,elevation:2758,
    region:"Trentino-Alto Adige",status:"seasonal",difficulty:9,
    description:"Versante altoatesino dello Stelvio con i famosi tornanti panoramici.",
    tips:["I tornanti sopra Trafoi sono i piu fotografati al mondo","Meno traffico del versante Prato"],
    versanti:[
      {side:"Trafoi (Nord)",startElevation:1543,endElevation:2758,distance_km:14.8,avgGradient:8.2,maxGradient:12.0,traffic:"medio",exposure:"Nord",
       elevationProfile:[1543,1660,1790,1920,2050,2180,2310,2430,2540,2640,2720,2758],
       routeCoords:[[46.552,10.504],[46.548,10.498],[46.544,10.490],[46.540,10.482],[46.538,10.474],[46.536,10.468],[46.534,10.462],[46.532,10.458],[46.530,10.455],[46.529,10.453]]}
    ]
  },
  {
    id:"abetone",name:"Passo dell'Abetone",lat:44.1486,lon:10.6592,elevation:1388,
    region:"Toscana / Emilia-Romagna",status:"open",difficulty:5,
    description:"Il passo appenninico piu classico tra Pistoia e Modena.",
    tips:["Salita lunga ma dolce nella foresta","Ottimo per allenamento di fondo"],
    versanti:[
      {side:"La Lima / Pistoia (Sud)",startElevation:454,endElevation:1388,distance_km:17.0,avgGradient:5.5,maxGradient:8.0,traffic:"medio",exposure:"Sud",
       elevationProfile:[454,540,630,720,810,900,990,1070,1150,1220,1290,1350,1388],
       routeCoords:[[44.020,10.655],[44.035,10.656],[44.050,10.657],[44.065,10.658],[44.080,10.659],[44.095,10.659],[44.110,10.659],[44.125,10.659],[44.140,10.659],[44.149,10.659]]}
    ]
  },
  {
    id:"futa",name:"Passo della Futa",lat:44.1192,lon:11.2653,elevation:903,
    region:"Toscana / Emilia-Romagna",status:"open",difficulty:4,
    description:"Valico principale dell'Appennino tosco-emiliano sulla vecchia statale Bologna-Firenze.",
    tips:["Cimitero militare tedesco: luogo di memoria","Bellissimo in autunno con i colori dei boschi"],
    versanti:[
      {side:"Firenzuola (Sud)",startElevation:422,endElevation:903,distance_km:12.0,avgGradient:4.0,maxGradient:8.0,traffic:"medio",exposure:"Sud",
       elevationProfile:[422,480,540,600,660,720,780,830,870,903],
       routeCoords:[[44.060,11.260],[44.070,11.262],[44.080,11.264],[44.090,11.265],[44.100,11.266],[44.110,11.266],[44.119,11.265]]}
    ]
  },
  {
    id:"nivolet",name:"Colle del Nivolet",lat:45.5092,lon:7.1494,elevation:2612,
    region:"Piemonte / Valle d'Aosta",status:"seasonal",difficulty:9,
    description:"Strada spettacolare nel Parco del Gran Paradiso. Laghi alpini e stambecchi.",
    tips:["Chiuso al traffico la domenica in estate!","Stambecchi e marmotte lungo la strada","Pochi rifornimenti nella parte alta"],
    versanti:[
      {side:"Ceresole Reale (Est)",startElevation:1620,endElevation:2612,distance_km:14.0,avgGradient:7.1,maxGradient:12.0,traffic:"basso",exposure:"Est",
       elevationProfile:[1620,1720,1830,1940,2060,2180,2290,2390,2470,2540,2590,2612],
       routeCoords:[[45.434,7.218],[45.442,7.210],[45.450,7.200],[45.458,7.190],[45.465,7.178],[45.472,7.168],[45.480,7.158],[45.488,7.152],[45.497,7.148],[45.505,7.148],[45.509,7.149]]}
    ]
  },
  {
    id:"finestre",name:"Colle delle Finestre",lat:45.0744,lon:7.0556,elevation:2178,
    region:"Piemonte",status:"seasonal",difficulty:9,
    description:"Famoso per gli 8 km finali in sterrato. Icona delle tappe alpine del Giro.",
    tips:["Ultimi km sterrato: gomme da almeno 25mm","Vista magnifica sulla Val di Susa","Il Giro d'Italia ci passa regolarmente"],
    versanti:[
      {side:"Meana di Susa (Nord)",startElevation:540,endElevation:2178,distance_km:18.5,avgGradient:8.9,maxGradient:14.0,traffic:"basso",exposure:"Nord",
       elevationProfile:[540,700,870,1040,1210,1380,1530,1680,1810,1940,2060,2178],
       routeCoords:[[45.122,7.087],[45.116,7.084],[45.110,7.080],[45.104,7.076],[45.098,7.072],[45.092,7.068],[45.086,7.064],[45.080,7.060],[45.074,7.056]]}
    ]
  },
  {
    id:"agnello",name:"Colle dell'Agnello",lat:44.6836,lon:6.9789,elevation:2744,
    region:"Piemonte",status:"seasonal",difficulty:9,
    description:"Il passo asfaltato piu alto d'Italia. Vista sulle Alpi Cozie.",
    tips:["A 2.744 m la quota si sente!","Stagione breve: giugno-settembre","Versante italiano da Chianale molto duro"],
    versanti:[
      {side:"Casteldelfino (Sud)",startElevation:1296,endElevation:2744,distance_km:21.0,avgGradient:6.9,maxGradient:13.3,traffic:"basso",exposure:"Sud",
       elevationProfile:[1296,1420,1550,1680,1810,1940,2070,2200,2330,2450,2560,2660,2744],
       routeCoords:[[44.614,7.072],[44.622,7.060],[44.630,7.048],[44.638,7.036],[44.646,7.024],[44.654,7.014],[44.662,7.005],[44.670,6.997],[44.678,6.988],[44.683,6.979]]}
    ]
  }
];
