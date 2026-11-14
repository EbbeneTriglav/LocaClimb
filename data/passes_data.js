var BIKE_EVENTS=[
{name:"Enjoy Stelvio - Passo San Marco",date:"2026-05-30",passes:["san-marco"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Enjoy Stelvio - Passo Gavia",date:"2026-06-05",passes:["gavia"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Sellaronda Bike Day",date:"2026-06-06",passes:["pordoi","sella","gardena","campolongo"],hours:"8:30-16:00",url:"https://www.sellarondabikeday.com"},
{name:"Enjoy Stelvio - Mortirolo",date:"2026-06-09",passes:["mortirolo"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Dolomites Bike Day",date:"2026-06-20",passes:["campolongo","falzarego"],hours:"8:30-16:00",url:""},
{name:"Enjoy Stelvio - Spluga",date:"2026-06-28",passes:["spluga"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Maratona dles Dolomites",date:"2026-07-05",passes:["campolongo","pordoi","sella","gardena","giau","falzarego"],hours:"6:30-16:30",url:"https://www.maratona.it"},
{name:"Enjoy Stelvio - Mortirolo",date:"2026-08-28",passes:["mortirolo"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Enjoy Stelvio - Stelvio Cima Coppi",date:"2026-08-29",passes:["stelvio"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Enjoy Stelvio - Gavia",date:"2026-08-30",passes:["gavia"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"},
{name:"Sellaronda Bike Day Autunno",date:"2026-09-12",passes:["pordoi","sella","gardena","campolongo"],hours:"8:30-16:00",url:"https://www.sellarondabikeday.com"},
{name:"Enjoy Stelvio - Stelvio Finale",date:"2026-09-19",passes:["stelvio"],hours:"8:00-14:00",url:"https://www.enjoystelvio.it"}
];

var PASSES_DATA=[
{id:"stelvio",name:"Passo dello Stelvio",lat:46.5285,lon:10.4534,elevation:2758,region:"Lombardia/Trentino",status:"seasonal",difficulty:10,
description:"Il passo asfaltato piu alto d'Italia. 48 tornanti iconici dal versante di Prato. Tappa leggendaria del Giro d'Italia.",
tips:["Partire presto da Prato per evitare traffico","Portare sempre giacca antivento per la discesa","Versante Bormio piu regolare ma meno panoramico","Evitare agosto nei weekend (moto e auto)"],
versanti:[
{side:"Prato allo Stelvio",startLat:46.6174,startLon:10.5845,startElevation:915,endElevation:2758,distance_km:24.3,avgGradient:7.6,maxGradient:12.0,traffic:"alto",exposure:"Est",elevationProfile:[915,980,1050,1120,1200,1300,1400,1520,1640,1760,1880,2000,2100,2200,2300,2400,2500,2580,2650,2720,2758]},
{side:"Bormio",startLat:46.4683,startLon:10.3708,startElevation:1225,endElevation:2758,distance_km:21.5,avgGradient:7.1,maxGradient:14.0,traffic:"medio",exposure:"Ovest",elevationProfile:[1225,1320,1420,1520,1620,1720,1800,1900,2000,2100,2200,2300,2400,2500,2580,2650,2720,2758]}
]},
{id:"gavia",name:"Passo Gavia",lat:46.3447,lon:10.4886,elevation:2621,region:"Lombardia",status:"seasonal",difficulty:9,
description:"Passo selvaggio e spettacolare tra Bormio e Ponte di Legno. Strada stretta con tratti sterrati storici. Protagonista del Giro 1988.",
tips:["Versante Ponte di Legno piu impegnativo con muri fino al 16%","Neve possibile anche a giugno in quota","Pochi punti di rifornimento acqua"],
versanti:[
{side:"Ponte di Legno",startLat:46.2585,startLon:10.5080,startElevation:1258,endElevation:2621,distance_km:17.3,avgGradient:7.9,maxGradient:16.0,traffic:"basso",exposure:"Sud",elevationProfile:[1258,1380,1520,1660,1780,1900,2020,2140,2250,2350,2430,2500,2560,2600,2621]},
{side:"Bormio",startLat:46.4683,startLon:10.3708,startElevation:1225,endElevation:2621,distance_km:25.6,avgGradient:5.4,maxGradient:14.0,traffic:"basso",exposure:"Nord",elevationProfile:[1225,1350,1450,1560,1680,1780,1880,1970,2060,2140,2220,2300,2380,2450,2520,2570,2600,2621]}
]},
{id:"mortirolo",name:"Passo del Mortirolo",lat:46.2486,lon:10.2961,elevation:1852,region:"Lombardia",status:"open",difficulty:10,
description:"Considerato la salita piu dura d'Italia. Pendenze costanti sopra il 10% dal versante di Mazzo. Monumento a Pantani in vetta.",
tips:["Versante Mazzo: 12km di inferno, portare rapporti agili","Poco traffico auto, strada stretta","Acqua alla fontana a meta salita","Il versante da Monno e piu pedalabile"],
versanti:[
{side:"Mazzo di Valtellina",startLat:46.2340,startLon:10.2440,startElevation:552,endElevation:1852,distance_km:12.4,avgGradient:10.5,maxGradient:18.0,traffic:"basso",exposure:"Nord-Est",elevationProfile:[552,680,820,960,1080,1180,1290,1400,1500,1600,1700,1780,1852]},
{side:"Monno (Val Camonica)",startLat:46.2186,startLon:10.3440,startElevation:1065,endElevation:1852,distance_km:10.5,avgGradient:7.5,maxGradient:12.0,traffic:"basso",exposure:"Ovest",elevationProfile:[1065,1180,1280,1380,1480,1560,1640,1720,1790,1830,1852]}
]},
{id:"zoncolan",name:"Monte Zoncolan",lat:46.50183,lon:12.92684,elevation:1730,region:"Friuli Venezia Giulia",status:"open",difficulty:10,
description:"La montagna piu dura del Giro d'Italia. Il versante da Ovaro ha pendenze fino al 22%. Spettacolo puro.",
tips:["Versante Ovaro: il piu duro con punte al 22%","Versante Sutrio piu regolare ma comunque tosto","Poca ombra nella parte finale"],
versanti:[
{side:"Ovaro",startLat:46.4775,startLon:12.9720,startElevation:510,endElevation:1730,distance_km:10.1,avgGradient:11.9,maxGradient:22.0,traffic:"basso",exposure:"Est",elevationProfile:[510,650,800,970,1100,1200,1310,1440,1560,1660,1730]},
{side:"Sutrio",startLat:46.5133,startLon:12.9950,startElevation:570,endElevation:1730,distance_km:13.5,avgGradient:8.5,maxGradient:14.0,traffic:"basso",exposure:"Nord-Est",elevationProfile:[570,680,790,900,1010,1120,1220,1320,1420,1520,1610,1680,1730]}
]},
{id:"pordoi",name:"Passo Pordoi",lat:46.4878,lon:11.8134,elevation:2239,region:"Trentino-Alto Adige",status:"seasonal",difficulty:7,
description:"La terrazza delle Dolomiti. Punto piu alto della Maratona dles Dolomites. Panorama mozzafiato su Sella e Marmolada.",
tips:["Salita regolare senza muri","Molto trafficato nei weekend estivi","Ottimi ristori in vetta","Perfetto per un giro dei 4 passi dolomitici"],
versanti:[
{side:"Canazei",startLat:46.4768,startLon:11.7706,startElevation:1465,endElevation:2239,distance_km:11.8,avgGradient:6.6,maxGradient:9.0,traffic:"alto",exposure:"Ovest",elevationProfile:[1465,1540,1620,1700,1780,1860,1940,2020,2090,2150,2200,2239]},
{side:"Arabba",startLat:46.4967,startLon:11.8744,startElevation:1602,endElevation:2239,distance_km:9.4,avgGradient:6.8,maxGradient:10.0,traffic:"alto",exposure:"Est",elevationProfile:[1602,1680,1760,1840,1920,2000,2070,2140,2200,2239]}
]},
{id:"sella",name:"Passo Sella",lat:46.50807,lon:11.76733,elevation:2218,region:"Trentino-Alto Adige",status:"seasonal",difficulty:7,
description:"Uno dei 4 passi del Sellaronda. Vista spettacolare sul Sassolungo. Molto frequentato ma merita ogni pedalata.",
tips:["Parte del Sellaronda: combinalo con Pordoi, Gardena, Campolongo","Partire presto per evitare traffico"],
versanti:[
{side:"Canazei",startLat:46.4768,startLon:11.7706,startElevation:1465,endElevation:2218,distance_km:10.5,avgGradient:7.2,maxGradient:11.0,traffic:"alto",exposure:"Sud",elevationProfile:[1465,1560,1660,1760,1850,1940,2020,2090,2150,2200,2218]},
{side:"Selva di Val Gardena",startLat:46.5556,startLon:11.7569,startElevation:1563,endElevation:2218,distance_km:7.8,avgGradient:8.4,maxGradient:12.0,traffic:"alto",exposure:"Nord",elevationProfile:[1563,1660,1760,1860,1960,2060,2140,2200,2218]}
]},
{id:"gardena",name:"Passo Gardena",lat:46.54982,lon:11.8083900,elevation:2121,region:"Trentino-Alto Adige",status:"seasonal",difficulty:6,
description:"Porta d'ingresso alla Val Gardena. Panorama sul Cir e Sella. Parte del giro Sellaronda.",
tips:["Versante Corvara piu dolce e costante","In inverno e chiuso per neve"],
versanti:[
{side:"Corvara",startLat:46.5397,startLon:11.8728,startElevation:1568,endElevation:2121,distance_km:8.2,avgGradient:6.7,maxGradient:9.0,traffic:"alto",exposure:"Est",elevationProfile:[1568,1640,1720,1800,1880,1960,2040,2100,2121]},
{side:"Selva di Val Gardena",startLat:46.5556,startLon:11.7569,startElevation:1563,endElevation:2121,distance_km:10.0,avgGradient:5.6,maxGradient:8.5,traffic:"alto",exposure:"Ovest",elevationProfile:[1563,1620,1680,1740,1800,1860,1920,1980,2050,2100,2121]}
]},
{id:"campolongo",name:"Passo Campolongo",lat:46.51365,lon:11.87255,elevation:1875,region:"Trentino-Alto Adige",status:"seasonal",difficulty:4,
description:"Il piu facile dei 4 passi del Sellaronda. Ideale per riscaldarsi prima di Pordoi e Sella.",
tips:["Salita breve e regolare, perfetta per iniziare il Sellaronda","Ottimi ristori ad Arabba"],
versanti:[
{side:"Corvara",startLat:46.5397,startLon:11.8728,startElevation:1568,endElevation:1875,distance_km:5.8,avgGradient:5.3,maxGradient:8.0,traffic:"medio",exposure:"Sud",elevationProfile:[1568,1620,1680,1740,1800,1850,1875]},
{side:"Arabba",startLat:46.4967,startLon:11.8744,startElevation:1602,endElevation:1875,distance_km:5.2,avgGradient:5.3,maxGradient:7.0,traffic:"medio",exposure:"Nord",elevationProfile:[1602,1650,1700,1750,1800,1845,1875]}
]},
{id:"falzarego",name:"Passo Falzarego",lat:46.5186,lon:12.0067,elevation:2105,region:"Veneto",status:"seasonal",difficulty:6,
description:"Collega Cortina con la Val Badia. Teatro della Grande Guerra. Panorama sulle Tofane e Lagazuoi.",
tips:["Funivia Lagazuoi in vetta per panorama","Versante Cortina lungo ma costante","Combinabile con Giau per un giro epico"],
versanti:[
{side:"Cortina d'Ampezzo",startLat:46.5369,startLon:12.1355,startElevation:1224,endElevation:2105,distance_km:17.6,avgGradient:5.0,maxGradient:8.0,traffic:"medio",exposure:"Est",elevationProfile:[1224,1320,1400,1480,1560,1640,1720,1800,1860,1920,1980,2040,2080,2105]},
{side:"Andraz/Arabba",startLat:46.4767,startLon:11.9550,startElevation:1428,endElevation:2105,distance_km:11.2,avgGradient:6.0,maxGradient:9.5,traffic:"medio",exposure:"Ovest",elevationProfile:[1428,1520,1610,1700,1780,1860,1930,1990,2040,2080,2105]}
]},
{id:"giau",name:"Passo Giau",lat:46.4831,lon:12.0522,elevation:2236,region:"Veneto",status:"seasonal",difficulty:8,
description:"Uno dei passi piu belli delle Dolomiti. Panorama a 360 gradi. Salita impegnativa da entrambi i versanti.",
tips:["Versante Selva di Cadore piu duro con rampe al 14%","Fotografa il panorama dalla cima","Combinabile con Falzarego"],
versanti:[
{side:"Selva di Cadore",startLat:46.4400,startLon:12.0300,startElevation:1060,endElevation:2236,distance_km:15.0,avgGradient:7.8,maxGradient:14.0,traffic:"basso",exposure:"Sud",elevationProfile:[1060,1200,1340,1480,1600,1720,1840,1940,2040,2100,2160,2200,2236]},
{side:"Cortina d'Ampezzo",startLat:46.5369,startLon:12.1355,startElevation:1224,endElevation:2236,distance_km:19.0,avgGradient:5.3,maxGradient:10.0,traffic:"medio",exposure:"Nord-Est",elevationProfile:[1224,1340,1440,1540,1640,1740,1840,1920,2000,2060,2120,2180,2220,2236]}
]},
{id:"fedaia",name:"Passo Fedaia",lat:46.46398,lon:11.86236,elevation:2057,region:"Veneto/Trentino",status:"seasonal",difficulty:8,
description:"Ai piedi della Marmolada, il ghiacciaio piu grande delle Dolomiti. Il lago in vetta e spettacolare.",
tips:["Vista sulla Marmolada unica","Versante Canazei con tratti ripidi nella parte alta","Lago artificiale in cima: fermati!"],
versanti:[
{side:"Canazei",startLat:46.4768,startLon:11.7706,startElevation:1465,endElevation:2057,distance_km:14.0,avgGradient:4.2,maxGradient:12.0,traffic:"medio",exposure:"Ovest",elevationProfile:[1465,1520,1580,1640,1680,1720,1760,1810,1860,1920,1980,2030,2057]},
{side:"Alleghe/Caprile",startLat:46.4050,startLon:12.0189,startElevation:1000,endElevation:2057,distance_km:16.0,avgGradient:6.6,maxGradient:11.0,traffic:"basso",exposure:"Est",elevationProfile:[1000,1120,1240,1360,1480,1580,1680,1760,1840,1910,1970,2020,2057]}
]},
{id:"spluga",name:"Passo dello Spluga",lat:46.5045,lon:9.3300,elevation:2113,region:"Lombardia",status:"seasonal",difficulty:7,
description:"Collega Italia e Svizzera. Strada spettacolare nella gola del Cardinello. Storia e panorami alpini.",
tips:["La gola del Cardinello e impressionante","Versante italiano con gallerie scavate nella roccia","Confine Italia-Svizzera in vetta"],
versanti:[
{side:"Chiavenna",startLat:46.3170,startLon:9.3988,startElevation:333,endElevation:2113,distance_km:30.0,avgGradient:5.9,maxGradient:10.0,traffic:"medio",exposure:"Sud",elevationProfile:[333,450,580,720,850,980,1100,1220,1340,1460,1560,1660,1760,1860,1950,2030,2080,2113]},
{side:"Splugen (CH)",startLat:46.5498,startLon:9.3176,startElevation:1457,endElevation:2113,distance_km:9.0,avgGradient:7.3,maxGradient:10.0,traffic:"basso",exposure:"Nord",elevationProfile:[1457,1550,1650,1750,1850,1940,2020,2080,2113]}
]},
{id:"san-marco",name:"Passo San Marco",lat:46.04726,lon:9.62303,elevation:1985,region:"Lombardia",status:"seasonal",difficulty:8,
description:"Collega Val Brembana e Valtellina. Pendenze impegnative dal versante bergamasco. Panorama sulle Orobie.",
tips:["Versante Mezzoldo molto impegnativo","Lungo ma regolare dal versante valtellinese","Pochi servizi nelle vicinanze"],
versanti:[
{side:"Mezzoldo (BG)",startLat:46.0134,startLon:9.6564,startElevation:830,endElevation:1985,distance_km:13.0,avgGradient:8.9,maxGradient:13.0,traffic:"basso",exposure:"Sud-Est",elevationProfile:[830,960,1100,1240,1370,1490,1600,1700,1790,1860,1920,1960,1985]},
{side:"Morbegno (SO)",startLat:46.1361,startLon:9.5711,startElevation:262,endElevation:1985,distance_km:28.0,avgGradient:6.2,maxGradient:10.0,traffic:"basso",exposure:"Nord-Ovest",elevationProfile:[262,400,550,700,850,1000,1120,1240,1350,1450,1550,1640,1730,1810,1880,1940,1970,1985]}
]},
{id:"grappa",name:"Monte Grappa",lat:45.87248,lon:11.80132,elevation:1685,region:"Veneto",status:"open",difficulty:8,
description:"Montagna sacra alla Patria. Sacrario militare in vetta. Tre versanti diversi, tutti impegnativi.",
tips:["Sacrario della Grande Guerra in vetta","Versante Romano il piu famoso e duro","Versante Semonzo con muri impossibili"],
versanti:[
{side:"Romano d'Ezzelino",startLat:45.7830,startLon:11.7668,startElevation:114,endElevation:1745,distance_km:26.0,avgGradient:6.3,maxGradient:14.0,traffic:"medio",exposure:"Sud",elevationProfile:[114,260,420,580,730,870,1000,1120,1240,1350,1440,1530,1620,1700,1745]},
{side:"Semonzo",startLat:45.8280,startLon:11.8264,startElevation:180,endElevation:1745,distance_km:20.0,avgGradient:7.8,maxGradient:17.0,traffic:"basso",exposure:"Est",elevationProfile:[180,340,510,680,860,1020,1160,1300,1420,1530,1620,1700,1745]}
]},
{id:"manghen",name:"Passo Manghen",lat:46.1732,lon:11.44154,elevation:2047,region:"Trentino-Alto Adige",status:"seasonal",difficulty:8,
description:"Salita lunga e selvaggia in Trentino. Poco trafficata, panorami spettacolari sulla Val di Fiemme.",
tips:["Salita molto lunga, portare provviste","Pochissimo traffico: un paradiso per ciclisti","Panorama val di Fiemme dalla cima"],
versanti:[
{side:"Borgo Valsugana",startLat:46.0514,startLon:11.4603,startElevation:380,endElevation:2047,distance_km:28.0,avgGradient:6.0,maxGradient:11.0,traffic:"basso",exposure:"Sud",elevationProfile:[380,500,640,780,920,1060,1190,1300,1420,1530,1640,1750,1850,1940,2010,2047]},
{side:"Molina di Fiemme",startLat:46.2700,startLon:11.4200,startElevation:960,endElevation:2047,distance_km:18.0,avgGradient:6.0,maxGradient:10.0,traffic:"basso",exposure:"Nord",elevationProfile:[960,1060,1160,1260,1360,1460,1550,1640,1730,1810,1890,1960,2020,2047]}
]},
{id:"tonale",name:"Passo del Tonale",lat:46.2575,lon:10.5828,elevation:1883,region:"Lombardia/Trentino",status:"open",difficulty:4,
description:"Passo comodo che collega Val Camonica e Val di Sole. Ottimo punto di partenza per salite piu dure come Gavia e Mortirolo.",
tips:["Salita lunga ma mai dura","Molto trafficato: preferire giorni feriali","Base per Gavia e Mortirolo"],
versanti:[
{side:"Edolo (Val Camonica)",startLat:46.1780,startLon:10.3290,startElevation:690,endElevation:1883,distance_km:27.0,avgGradient:4.4,maxGradient:7.0,traffic:"alto",exposure:"Ovest",elevationProfile:[690,800,910,1020,1120,1220,1310,1400,1480,1560,1640,1720,1790,1850,1883]},
{side:"Male (Val di Sole)",startLat:46.3529,startLon:10.9108,startElevation:737,endElevation:1883,distance_km:32.0,avgGradient:3.6,maxGradient:7.5,traffic:"alto",exposure:"Est",elevationProfile:[737,830,920,1010,1090,1170,1250,1330,1410,1490,1560,1630,1700,1760,1820,1860,1883]}
]},
{id:"presolana",name:"Passo della Presolana",lat:45.92921,lon:10.09902,elevation:1297,region:"Lombardia",status:"open",difficulty:5,
description:"Porta d'accesso alle Orobie bergamasche. Panorama sulla parete della Presolana. Salita gradevole.",
tips:["Ottimo punto di partenza per escursioni","Vista sulla Presolana impressionante","Traffico moderato nei feriali"],
versanti:[
{side:"Clusone",startLat:45.8872,startLon:9.9478,startElevation:648,endElevation:1297,distance_km:14.0,avgGradient:4.6,maxGradient:8.0,traffic:"medio",exposure:"Sud-Ovest",elevationProfile:[648,720,800,880,960,1040,1100,1160,1220,1260,1297]},
{side:"Angolo Terme",startLat:45.8906,startLon:10.1389,startElevation:318,endElevation:1297,distance_km:22.0,avgGradient:4.5,maxGradient:9.0,traffic:"medio",exposure:"Est",elevationProfile:[318,420,530,640,750,860,950,1040,1100,1160,1220,1270,1297]}
]},
{id:"vivione",name:"Passo Vivione",lat:46.03659,lon:10.19927,elevation:1828,region:"Lombardia",status:"seasonal",difficulty:7,
description:"Collega Val Camonica e Val di Scalve. Salita tranquilla e panoramica sulle Orobie.",
tips:["Pochissimo traffico","Strada stretta nella parte alta","Combinabile con Presolana per un bel giro"],
versanti:[
{side:"Schilpario",startLat:45.9833,startLon:10.1500,startElevation:1124,endElevation:1828,distance_km:8.5,avgGradient:8.3,maxGradient:12.0,traffic:"basso",exposure:"Sud",elevationProfile:[1124,1230,1340,1450,1560,1660,1740,1800,1828]},
{side:"Forno Allione",startLat:46.0900,startLon:10.2100,startElevation:680,endElevation:1828,distance_km:18.0,avgGradient:6.4,maxGradient:10.0,traffic:"basso",exposure:"Nord",elevationProfile:[680,800,920,1040,1160,1260,1360,1460,1540,1620,1700,1760,1800,1828]}
]},
{id:"rolle",name:"Passo Rolle",lat:46.2955,lon:11.7855,elevation:1984,region:"Trentino-Alto Adige",status:"open",difficulty:5,
description:"Ai piedi delle Pale di San Martino. Salita lunga ma con pendenze moderate. Panorama dolomitico.",
tips:["Vista sulle Pale di San Martino bellissima","Salita lunga ma mai dura","Ristori a San Martino di Castrozza"],
versanti:[
{side:"Predazzo",startLat:46.3133,startLon:11.6000,startElevation:1018,endElevation:1984,distance_km:20.0,avgGradient:4.8,maxGradient:8.0,traffic:"medio",exposure:"Ovest",elevationProfile:[1018,1100,1190,1280,1370,1460,1540,1620,1700,1770,1840,1900,1950,1984]},
{side:"Fiera di Primiero",startLat:46.1750,startLon:11.8330,startElevation:710,endElevation:1984,distance_km:22.0,avgGradient:5.8,maxGradient:10.0,traffic:"medio",exposure:"Sud-Est",elevationProfile:[710,840,960,1080,1200,1320,1420,1520,1600,1680,1760,1840,1900,1950,1984]}
]},
{id:"croce-daune",name:"Passo Croce d'Aune",lat:46.06207,lon:11.829950,elevation:1011,region:"Veneto",status:"open",difficulty:6,
description:"Salita storica del ciclismo veneto. Punto di partenza di molte granfondo. Panorama sulla Val Belluna.",
tips:["Salita breve ma intensa","Punto di partenza della Sportful Dolomiti Race"],
versanti:[
{side:"Feltre",startLat:46.0200,startLon:11.9063,startElevation:267,endElevation:1011,distance_km:11.0,avgGradient:6.7,maxGradient:12.0,traffic:"medio",exposure:"Est",elevationProfile:[267,380,500,620,720,800,870,930,970,1000,1011]},
{side:"Fonzaso",startLat:46.0200,startLon:11.8022,startElevation:340,endElevation:1011,distance_km:9.0,avgGradient:7.5,maxGradient:13.0,traffic:"basso",exposure:"Ovest",elevationProfile:[340,450,560,670,770,860,930,980,1011]}
]},
{id:"abetone",name:"Passo dell'Abetone",lat:44.14564,lon:10.6649600,elevation:1388,region:"Toscana/Emilia-Romagna",status:"open",difficulty:5,
description:"Il valico sull'Appennino tosco-emiliano piu noto. Collega Toscana e Emilia. Frequentato dai ciclisti fiorentini.",
tips:["Salita lunga e regolare","Centro turistico in vetta con ristori","Traffico variabile nei weekend estivi"],
versanti:[
{side:"San Marcello Piteglio",startLat:44.0600,startLon:10.8000,startElevation:620,endElevation:1388,distance_km:18.0,avgGradient:4.3,maxGradient:8.0,traffic:"medio",exposure:"Sud",elevationProfile:[620,720,810,900,980,1060,1130,1200,1260,1320,1360,1388]},
{side:"Fanano (MO)",startLat:44.2047,startLon:10.7936,startElevation:640,endElevation:1388,distance_km:22.0,avgGradient:3.4,maxGradient:7.0,traffic:"basso",exposure:"Nord",elevationProfile:[640,720,790,860,930,1000,1060,1120,1180,1230,1280,1320,1360,1388]}
]},
{id:"futa",name:"Passo della Futa",lat:44.09674,lon:11.27511,elevation:903,region:"Toscana/Emilia-Romagna",status:"open",difficulty:4,
description:"Classico valico appenninico tra Firenze e Bologna. Percorso dalla celebre gara automobilistica Mille Miglia.",
tips:["Salita costante e regolare","Cimitero di guerra germanico in vetta","Ottima da combinare con Passo della Raticosa"],
versanti:[
{side:"Firenzuola",startLat:44.1189,startLon:11.3792,startElevation:422,endElevation:903,distance_km:12.0,avgGradient:4.0,maxGradient:7.0,traffic:"medio",exposure:"Est",elevationProfile:[422,490,560,630,700,760,810,850,880,903]},
{side:"Barberino di Mugello",startLat:44.0000,startLon:11.2400,startElevation:250,endElevation:903,distance_km:20.0,avgGradient:3.3,maxGradient:7.0,traffic:"medio",exposure:"Sud",elevationProfile:[250,340,430,510,590,660,720,770,810,850,880,903]}
]},
{id:"aprica",name:"Passo dell'Aprica",lat:46.15446,lon:10.15489,elevation:1175,region:"Lombardia",status:"open",difficulty:4,
description:"Collega Val Camonica e Valtellina. Salita lunga ma agevole. Centro turistico in vetta.",
tips:["Salita facile, ideale per principianti","Centro turistico con ristori","Traffico variabile sulla SS39"],
versanti:[
{side:"Edolo",startLat:46.1780,startLon:10.3290,startElevation:690,endElevation:1175,distance_km:16.0,avgGradient:3.0,maxGradient:7.0,traffic:"medio",exposure:"Ovest",elevationProfile:[690,750,810,870,930,980,1030,1070,1110,1145,1175]},
{side:"Tresenda (Teglio)",startLat:46.1700,startLon:10.0600,startElevation:540,endElevation:1175,distance_km:12.5,avgGradient:5.1,maxGradient:9.0,traffic:"medio",exposure:"Est",elevationProfile:[540,620,710,800,890,960,1030,1080,1120,1155,1175]}
]},
{id:"san-pellegrino",name:"Passo San Pellegrino",lat:46.37835,lon:11.79099,elevation:1918,region:"Trentino-Alto Adige",status:"seasonal",difficulty:6,
description:"Collega Val di Fassa e Falcade. Panorama su Civetta e Marmolada. Salita costante e piacevole.",
tips:["Panorama bellissimo sulle Dolomiti","Ristoro e rifugio in vetta","Combinabile con Valles per un bel giro"],
versanti:[
{side:"Moena (Val di Fassa)",startLat:46.3764,startLon:11.6611,startElevation:1184,endElevation:1918,distance_km:14.0,avgGradient:5.2,maxGradient:9.0,traffic:"medio",exposure:"Ovest",elevationProfile:[1184,1280,1370,1450,1530,1610,1690,1760,1820,1870,1918]},
{side:"Falcade",startLat:46.3567,startLon:11.8700,startElevation:1130,endElevation:1918,distance_km:12.0,avgGradient:6.6,maxGradient:10.0,traffic:"basso",exposure:"Est",elevationProfile:[1130,1230,1330,1430,1530,1620,1710,1790,1850,1900,1918]}
]},
/* Added by hand at Rick's request (14/11/2026), in honour of Marco Pantani. The road over the Monte Carpegna
   (Via Cippo) is closed to motor vehicles between two barriers: about 1040 m on the Carpegna side (Pantani
   monument) and 1180 m on the Passo Cantoniera side. Sides: OSM ways + Terrarium DEM (z14, the app's DEM);
   maxGradient = steepest 300 m, the pipeline's window. The pipeline rebuilds the sides into curated_overrides. */
{id:"passo-pantani",name:"Passo Pantani (Monte Carpegna)",lat:43.8007,lon:12.32267,elevation:1373,region:"Marche",status:"open",difficulty:6,
description:"Il Monte Carpegna, nel Montefeltro, era la salita di casa di Marco Pantani, il Pirata (Cesena 1970 - Rimini 2004), vincitore di Giro d'Italia e Tour de France nel 1998. Ci si allenava spesso e la ricordava così: «Il Carpegna mi basta». Per questo qui la chiamiamo Passo Pantani. A metà salita, dove comincia il tratto più duro, c'è il monumento a lui dedicato; lungo la strada scritte e cartelli lo ricordano, e vicino alla cima una stele dice «Questo è il cielo del Pirata».",
tips:["Strada in parte chiusa al traffico: dal monumento a Pantani (circa 1040 m, km 2,7 da Carpegna) e dal lato del Passo Cantoniera (circa 1180 m) ci sono sbarre. Rallenta e passale con attenzione, in salita e soprattutto in discesa","Nella parte chiusa la strada è stretta e nel bosco: spesso foglie, rami e ghiaia sull'asfalto","Tratti vicini al 20% nella seconda metà da Carpegna: serve un rapporto agile","Dal Passo Cantoniera è più corta e più dolce: buona come discesa o per un primo assaggio"],
versanti:[
{side:"Carpegna",startLat:43.7832,startLon:12.3362,startElevation:773,endElevation:1373,distance_km:5.8,avgGradient:10.4,maxGradient:19.8,traffic:"basso",exposure:"Sud-Est",elevationProfile:[773,842,963,1066,1181,1282,1373],track:[[43.7832,12.3362],[43.78368,12.33624],[43.78397,12.33687],[43.78424,12.33751],[43.78473,12.33771],[43.78527,12.33766],[43.7858,12.33762],[43.7863,12.33746],[43.78633,12.33808],[43.7859,12.33853],[43.78551,12.33903],[43.78584,12.33951],[43.7863,12.33989],[43.78677,12.34026],[43.78724,12.34064],[43.7877,12.34073],[43.78763,12.33999],[43.78727,12.33947],[43.7871,12.3388],[43.78735,12.33818],[43.78777,12.33772],[43.78805,12.33711],[43.78833,12.33753],[43.78879,12.33716],[43.78875,12.3365],[43.78864,12.3358],[43.78898,12.33624],[43.78949,12.33648],[43.78994,12.33683],[43.78965,12.33631],[43.78947,12.33582],[43.78997,12.33604],[43.79031,12.3364],[43.79041,12.33713],[43.79055,12.3374],[43.79076,12.33678],[43.79125,12.33697],[43.7917,12.33661],[43.79212,12.33626],[43.79266,12.33619],[43.79319,12.3363],[43.79372,12.33637],[43.79424,12.33654],[43.79468,12.33691],[43.79501,12.33748],[43.7955,12.33777],[43.79596,12.33815],[43.79604,12.33783],[43.79589,12.33713],[43.79587,12.33639],[43.79601,12.33616],[43.79623,12.33681],[43.7967,12.33718],[43.79681,12.3369],[43.79656,12.33625],[43.7969,12.33644],[43.79721,12.33648],[43.7969,12.33587],[43.7969,12.33523],[43.7973,12.33572],[43.79761,12.33581],[43.79745,12.3351],[43.79727,12.33441],[43.79694,12.33383],[43.79647,12.33348],[43.79598,12.33359],[43.79566,12.33331],[43.7959,12.33264],[43.79618,12.332],[43.79648,12.33139],[43.79669,12.33073],[43.79645,12.33007],[43.79603,12.3296],[43.79552,12.32945],[43.79516,12.329],[43.79539,12.32873],[43.79577,12.32855],[43.79555,12.32787],[43.79576,12.32751],[43.79618,12.32795],[43.79656,12.32846],[43.79698,12.32847],[43.79676,12.32779],[43.79666,12.32706],[43.79645,12.32637],[43.79648,12.32564],[43.79689,12.3253],[43.7974,12.32506],[43.7975,12.32524],[43.7971,12.32574],[43.79712,12.32631],[43.7975,12.3258],[43.798,12.32554],[43.79837,12.32499],[43.7987,12.3244],[43.79913,12.32396],[43.79961,12.32363],[43.79996,12.32307],[43.80045,12.32277],[43.8007,12.32267]]},
{side:"Passo Cantoniera",startLat:43.7841,startLon:12.3027,startElevation:991,endElevation:1377,distance_km:5.2,avgGradient:7.4,maxGradient:14.3,traffic:"basso",exposure:"Sud-Ovest",elevationProfile:[991,1062,1132,1203,1292,1364,1377],track:[[43.7841,12.3027],[43.78447,12.30322],[43.78485,12.30375],[43.78517,12.30436],[43.78549,12.30496],[43.78581,12.30556],[43.78627,12.3059],[43.78671,12.30628],[43.78707,12.30682],[43.78733,12.30634],[43.78731,12.30559],[43.7873,12.30484],[43.78737,12.30411],[43.78756,12.30341],[43.78773,12.3027],[43.7879,12.30199],[43.78817,12.30139],[43.78847,12.30192],[43.78862,12.30263],[43.78881,12.30334],[43.789,12.30403],[43.78895,12.30477],[43.78935,12.30525],[43.7898,12.30566],[43.79013,12.30625],[43.79054,12.30666],[43.79064,12.30598],[43.79089,12.30539],[43.79141,12.30522],[43.79187,12.30486],[43.79224,12.30433],[43.79278,12.30438],[43.79331,12.30428],[43.79339,12.30477],[43.79299,12.30527],[43.79259,12.30578],[43.79218,12.30627],[43.79251,12.30648],[43.79301,12.30619],[43.79354,12.30616],[43.79391,12.30566],[43.79438,12.30577],[43.79486,12.30607],[43.79533,12.30576],[43.79558,12.30632],[43.79513,12.30672],[43.79467,12.30711],[43.7943,12.30765],[43.79419,12.30835],[43.79462,12.30846],[43.79496,12.30794],[43.79549,12.30797],[43.79603,12.30797],[43.7962,12.30839],[43.79592,12.30903],[43.79592,12.3096],[43.79646,12.30956],[43.79682,12.30983],[43.7965,12.31041],[43.79613,12.31095],[43.7964,12.31153],[43.79694,12.31146],[43.79747,12.31134],[43.79797,12.31107],[43.79845,12.31073],[43.79892,12.31054],[43.79909,12.31124],[43.7988,12.31183],[43.79857,12.31246],[43.79889,12.31305],[43.79873,12.31375],[43.79847,12.31441],[43.79839,12.31512],[43.79881,12.31555],[43.79932,12.31578],[43.79974,12.31617],[43.79965,12.31687],[43.79956,12.31748],[43.79904,12.31765],[43.7988,12.31826],[43.79878,12.319],[43.79867,12.31973],[43.79861,12.32047],[43.79866,12.32121],[43.79894,12.32181],[43.79945,12.32182],[43.79997,12.32201],[43.80049,12.32218],[43.8007,12.32267]]}
]}
];
