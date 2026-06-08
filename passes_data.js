var BIKE_EVENTS=[
{name:"Enjoy Stelvio - San Marco",date:"2026-05-30",passes:["san-marco"],hours:"8-15",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Enjoy Stelvio - Gavia",date:"2026-06-05",passes:["gavia"],hours:"8-15",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Sellaronda Bike Day",date:"2026-06-06",passes:["sella","pordoi","campolongo","gardena"],hours:"8:30-16",url:"https://www.sellarondabikeday.com"},
{name:"Enjoy Stelvio - Mortirolo",date:"2026-06-09",passes:["mortirolo"],hours:"8-15",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Dolomites Bike Day",date:"2026-06-20",passes:["campolongo","falzarego"],hours:"8:30-15",url:"https://www.dolomitesbikeday.it"},
{name:"Enjoy Stelvio - Spluga",date:"2026-06-28",passes:["spluga"],hours:"8-15",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Maratona dles Dolomites",date:"2026-07-05",passes:["campolongo","pordoi","sella","gardena","giau","falzarego"],hours:"6:30-16",url:"https://www.maratona.it"},
{name:"Stelvio Bike Day - Cima Coppi",date:"2026-08-29",passes:["stelvio"],hours:"7-16",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Enjoy Stelvio - Gavia",date:"2026-08-30",passes:["gavia"],hours:"8-15",url:"https://www.valtellina.it/it/chiusure-passi-alpini"},
{name:"Sellaronda Bike Day (autunno)",date:"2026-09-12",passes:["sella","pordoi","campolongo","gardena"],hours:"8:30-16",url:"https://www.sellarondabikeday.com"},
{name:"Enjoy Stelvio - Stelvio",date:"2026-09-19",passes:["stelvio"],hours:"7-16",url:"https://www.valtellina.it/it/chiusure-passi-alpini"}
];
var PASSES_DATA=[
{id:"stelvio",name:"Passo dello Stelvio",lat:46.5287,lon:10.4531,elevation:2758,region:"Lombardia",status:"seasonal",difficulty:10,
description:"Il secondo passo asfaltato piu alto delle Alpi. Simbolo del Giro con 48 tornanti.",
tips:["Partire presto per evitare moto e camper","Portare giacca antivento: in cima fa freddo","Apertura: fine maggio - inizio novembre"],
versanti:[
{side:"Prato allo Stelvio",startElevation:911,endElevation:2758,distance_km:24.7,avgGradient:7.5,maxGradient:10.2,traffic:"alto",exposure:"Est",
elevationProfile:[911,1050,1200,1350,1500,1650,1800,1950,2100,2250,2400,2550,2700,2758],
routeCoords:[[46.617,10.584],[46.608,10.570],[46.598,10.555],[46.589,10.540],[46.580,10.525],[46.572,10.510],[46.565,10.498],[46.558,10.488],[46.550,10.476],[46.543,10.465],[46.535,10.456],[46.529,10.453]]},
{side:"Bormio",startElevation:1225,endElevation:2758,distance_km:21.5,avgGradient:7.1,maxGradient:10.8,traffic:"medio",exposure:"Ovest",
elevationProfile:[1225,1400,1575,1750,1925,2050,2175,2300,2425,2550,2650,2758],
routeCoords:[[46.468,10.370],[46.475,10.382],[46.483,10.395],[46.490,10.407],[46.497,10.418],[46.504,10.428],[46.510,10.436],[46.516,10.443],[46.522,10.448],[46.529,10.453]]}
]},
{id:"gavia",name:"Passo di Gavia",lat:46.3453,lon:10.4889,elevation:2618,region:"Lombardia",status:"seasonal",difficulty:9,
description:"Passo epico e selvaggio con panorami mozzafiato verso Adamello e Ortles.",
tips:["Strada stretta: attenzione in discesa","Neve possibile anche a giugno"],
versanti:[
{side:"Ponte di Legno",startElevation:1258,endElevation:2618,distance_km:16.5,avgGradient:8.0,maxGradient:11.5,traffic:"basso",exposure:"Sud",
elevationProfile:[1258,1400,1540,1680,1820,1960,2100,2200,2350,2450,2550,2618],
routeCoords:[[46.260,10.507],[46.270,10.504],[46.280,10.500],[46.290,10.497],[46.300,10.494],[46.310,10.492],[46.320,10.490],[46.330,10.489],[46.345,10.489]]},
{side:"Bormio",startElevation:1225,endElevation:2618,distance_km:25.0,avgGradient:5.6,maxGradient:11.2,traffic:"basso",exposure:"Nord",
elevationProfile:[1225,1350,1450,1550,1650,1750,1850,1950,2050,2150,2250,2400,2618],
routeCoords:[[46.468,10.370],[46.458,10.382],[46.448,10.395],[46.435,10.415],[46.420,10.435],[46.405,10.455],[46.390,10.470],[46.375,10.480],[46.360,10.486],[46.345,10.489]]}
]},
{id:"mortirolo",name:"Passo del Mortirolo",lat:46.2353,lon:10.3078,elevation:1852,region:"Lombardia",status:"seasonal",difficulty:10,
description:"Una delle salite piu dure d'Europa. Monumento a Pantani sul versante di Mazzo.",
tips:["Versante Mazzo: pendenze fino al 18%!","Pochissimo traffico: paradiso per ciclisti","Rapporti agili obbligatori"],
versanti:[
{side:"Mazzo di Valtellina",startElevation:552,endElevation:1852,distance_km:12.3,avgGradient:10.6,maxGradient:18.0,traffic:"basso",exposure:"Ovest",
elevationProfile:[552,680,830,990,1150,1300,1440,1560,1670,1760,1820,1852],
routeCoords:[[46.216,10.257],[46.220,10.265],[46.224,10.273],[46.227,10.280],[46.229,10.287],[46.231,10.294],[46.233,10.300],[46.235,10.308]]},
{side:"Edolo",startElevation:717,endElevation:1852,distance_km:13.8,avgGradient:8.2,maxGradient:11.6,traffic:"basso",exposure:"Nord",
elevationProfile:[717,830,950,1060,1170,1300,1420,1530,1650,1760,1852],
routeCoords:[[46.175,10.332],[46.183,10.328],[46.191,10.323],[46.199,10.318],[46.207,10.314],[46.215,10.311],[46.223,10.309],[46.235,10.308]]}
]},
{id:"pordoi",name:"Passo Pordoi",lat:46.4878,lon:11.8122,elevation:2239,region:"Veneto",status:"seasonal",difficulty:7,
description:"Il passo piu alto delle Dolomiti toccato dal Giro. Panorama 360 gradi.",
tips:["Salita regolare da entrambi i versanti","Traffico alto in estate"],
versanti:[
{side:"Canazei",startElevation:1465,endElevation:2239,distance_km:12.6,avgGradient:6.1,maxGradient:9.2,traffic:"alto",exposure:"Nord-Ovest",
elevationProfile:[1465,1550,1640,1730,1830,1930,2030,2100,2170,2239],
routeCoords:[[46.476,11.770],[46.479,11.777],[46.482,11.784],[46.484,11.791],[46.486,11.798],[46.487,11.805],[46.488,11.812]]},
{side:"Arabba",startElevation:1602,endElevation:2239,distance_km:9.4,avgGradient:6.8,maxGradient:10.0,traffic:"alto",exposure:"Sud-Est",
elevationProfile:[1602,1700,1800,1900,1990,2070,2150,2200,2239],
routeCoords:[[46.497,11.874],[46.496,11.862],[46.494,11.850],[46.492,11.838],[46.490,11.826],[46.489,11.818],[46.488,11.812]]}
]},
{id:"sella",name:"Passo Sella",lat:46.5089,lon:11.7600,elevation:2240,region:"Veneto",status:"seasonal",difficulty:7,
description:"Parte del Sellaronda, vista iconica sul Sassolungo.",
tips:["Vista incredibile sul Sassolungo al tramonto","Giro completo: Sella+Pordoi+Campolongo+Gardena"],
versanti:[
{side:"Canazei",startElevation:1465,endElevation:2240,distance_km:11.4,avgGradient:6.8,maxGradient:11.8,traffic:"alto",exposure:"Sud",
elevationProfile:[1465,1560,1660,1770,1880,1980,2060,2140,2200,2240],
routeCoords:[[46.476,11.770],[46.482,11.768],[46.488,11.766],[46.494,11.764],[46.500,11.762],[46.506,11.760],[46.509,11.760]]},
{side:"Selva Val Gardena",startElevation:1563,endElevation:2240,distance_km:10.2,avgGradient:6.6,maxGradient:10.5,traffic:"alto",exposure:"Nord",
elevationProfile:[1563,1660,1760,1860,1960,2060,2140,2200,2240],
routeCoords:[[46.556,11.760],[46.548,11.759],[46.540,11.759],[46.532,11.759],[46.524,11.760],[46.516,11.760],[46.509,11.760]]}
]},
{id:"gardena",name:"Passo Gardena",lat:46.5336,lon:11.8092,elevation:2136,region:"Veneto",status:"seasonal",difficulty:5,
description:"Il passo piu accessibile del Sellaronda. Panorami dolci e aperti.",
tips:["Salita corta e relativamente facile","Collegamento ideale con Sella e Pordoi"],
versanti:[
{side:"Corvara",startElevation:1568,endElevation:2136,distance_km:6.0,avgGradient:9.5,maxGradient:12.0,traffic:"alto",exposure:"Sud",
elevationProfile:[1568,1680,1790,1900,2020,2100,2136],
routeCoords:[[46.512,11.871],[46.518,11.860],[46.524,11.848],[46.528,11.836],[46.532,11.822],[46.534,11.809]]}
]},
{id:"campolongo",name:"Passo Campolongo",lat:46.5064,lon:11.8492,elevation:1875,region:"Veneto",status:"seasonal",difficulty:4,
description:"Il passo piu facile del Sellaronda. Breve e dolce tra Arabba e Corvara.",
tips:["Ottimo per principianti"],
versanti:[
{side:"Arabba",startElevation:1602,endElevation:1875,distance_km:5.8,avgGradient:4.7,maxGradient:8.0,traffic:"medio",exposure:"Sud-Est",
elevationProfile:[1602,1660,1720,1780,1830,1875],
routeCoords:[[46.497,11.874],[46.499,11.868],[46.501,11.862],[46.503,11.856],[46.505,11.852],[46.506,11.849]]}
]},
{id:"giau",name:"Passo Giau",lat:46.4833,lon:12.0514,elevation:2236,region:"Veneto",status:"seasonal",difficulty:8,
description:"Uno dei passi piu scenografici delle Dolomiti. Prati fioriti, Pelmo e Civetta.",
tips:["Muro finale al 15% da Selva di Cadore!","Poco traffico: gemma nascosta","Tramonto incredibile"],
versanti:[
{side:"Selva di Cadore",startElevation:998,endElevation:2236,distance_km:15.6,avgGradient:7.9,maxGradient:15.0,traffic:"basso",exposure:"Sud-Ovest",
elevationProfile:[998,1120,1250,1400,1550,1700,1840,1960,2070,2150,2236],
routeCoords:[[46.443,12.031],[46.450,12.035],[46.457,12.039],[46.464,12.043],[46.470,12.046],[46.476,12.049],[46.483,12.051]]},
{side:"Cortina",startElevation:1200,endElevation:2236,distance_km:15.8,avgGradient:6.6,maxGradient:10.3,traffic:"basso",exposure:"Nord-Est",
elevationProfile:[1200,1350,1500,1650,1800,1940,2060,2150,2236],
routeCoords:[[46.537,12.102],[46.528,12.093],[46.519,12.084],[46.510,12.076],[46.501,12.068],[46.492,12.060],[46.483,12.051]]}
]},
{id:"falzarego",name:"Passo Falzarego",lat:46.5192,lon:12.0050,elevation:2105,region:"Veneto",status:"seasonal",difficulty:6,
description:"Vista diretta sulle Tofane e il Lagazuoi. Funivia in cima.",
tips:["Combinare con Valparola","Dolomites Bike Day 20 giugno 2026"],
versanti:[
{side:"Cortina d'Ampezzo",startElevation:1224,endElevation:2105,distance_km:18.0,avgGradient:4.9,maxGradient:9.0,traffic:"medio",exposure:"Est",
elevationProfile:[1224,1350,1480,1600,1720,1830,1930,2020,2070,2105],
routeCoords:[[46.540,12.132],[46.536,12.116],[46.532,12.100],[46.528,12.084],[46.525,12.068],[46.523,12.052],[46.521,12.036],[46.520,12.020],[46.519,12.005]]}
]},
{id:"spluga",name:"Passo dello Spluga",lat:46.5050,lon:9.3375,elevation:2113,region:"Lombardia",status:"seasonal",difficulty:8,
description:"Confine italo-svizzero con la spettacolare gola della Via Mala.",
tips:["La gola sul versante sud e' impressionante","Salita lunga da Chiavenna"],
versanti:[
{side:"Chiavenna",startElevation:325,endElevation:2113,distance_km:30.0,avgGradient:6.0,maxGradient:10.0,traffic:"medio",exposure:"Sud",
elevationProfile:[325,460,600,750,900,1050,1200,1350,1500,1650,1800,1950,2050,2113],
routeCoords:[[46.320,9.397],[46.340,9.391],[46.360,9.384],[46.380,9.376],[46.400,9.368],[46.420,9.360],[46.440,9.352],[46.460,9.346],[46.480,9.340],[46.505,9.338]]}
]},
{id:"san-marco",name:"Passo di San Marco",lat:46.0497,lon:9.6217,elevation:1992,region:"Lombardia",status:"seasonal",difficulty:8,
description:"Val Brembana - Valtellina. Incluso nelle chiusure Enjoy Stelvio.",
tips:["Versante Mezzoldo impegnativo","Enjoy Stelvio: 30 maggio 2026"],
versanti:[
{side:"Mezzoldo",startElevation:830,endElevation:1992,distance_km:13.0,avgGradient:8.9,maxGradient:14.0,traffic:"basso",exposure:"Sud",
elevationProfile:[830,960,1100,1240,1380,1520,1660,1790,1900,1992],
routeCoords:[[45.988,9.660],[45.996,9.654],[46.004,9.648],[46.012,9.642],[46.020,9.636],[46.028,9.630],[46.036,9.626],[46.045,9.623],[46.050,9.622]]}
]},
{id:"grappa",name:"Monte Grappa",lat:45.8758,lon:11.7808,elevation:1745,region:"Veneto",status:"open",difficulty:8,
description:"Montagna sacra della Grande Guerra. Tre versanti diversi, tutti durissimi.",
tips:["Vento forte frequente in cima","Sacrario militare in vetta"],
versanti:[
{side:"Romano d'Ezzelino",startElevation:118,endElevation:1745,distance_km:26.0,avgGradient:6.3,maxGradient:11.0,traffic:"medio",exposure:"Sud",
elevationProfile:[118,280,450,630,810,980,1140,1290,1420,1550,1660,1720,1745],
routeCoords:[[45.786,11.778],[45.800,11.780],[45.814,11.781],[45.828,11.782],[45.842,11.782],[45.856,11.782],[45.868,11.781],[45.876,11.781]]}
]},
{id:"manghen",name:"Passo Manghen",lat:46.1767,lon:11.4542,elevation:2047,region:"Trentino",status:"seasonal",difficulty:9,
description:"Il passo asfaltato piu alto del Trentino. Quasi zero traffico!",
tips:["Portare acqua sufficiente","Salita lunga e solitaria"],
versanti:[
{side:"Borgo Valsugana",startElevation:355,endElevation:2047,distance_km:23.0,avgGradient:7.4,maxGradient:10.5,traffic:"basso",exposure:"Sud",
elevationProfile:[355,500,650,820,990,1160,1330,1500,1660,1820,1960,2047],
routeCoords:[[46.040,11.460],[46.060,11.458],[46.080,11.456],[46.100,11.455],[46.120,11.454],[46.140,11.454],[46.160,11.454],[46.177,11.454]]}
]},
{id:"presolana",name:"Passo della Presolana",lat:45.9650,lon:10.0736,elevation:1297,region:"Lombardia",status:"open",difficulty:5,
description:"Salita panoramica con vista sulla maestosa Presolana. Dalla bergamasca.",
tips:["Salita accessibile e panoramica"],
versanti:[
{side:"Clusone",startElevation:648,endElevation:1297,distance_km:14.0,avgGradient:4.6,maxGradient:9.0,traffic:"medio",exposure:"Ovest",
elevationProfile:[648,720,800,880,960,1040,1100,1160,1220,1270,1297],
routeCoords:[[45.890,10.020],[45.905,10.030],[45.920,10.042],[45.935,10.054],[45.950,10.064],[45.960,10.072],[45.965,10.074]]}
]},
{id:"tonale",name:"Passo del Tonale",lat:46.2603,lon:10.5867,elevation:1883,region:"Lombardia",status:"open",difficulty:4,
description:"Passo ampio tra Val Camonica e Val di Sole. Ideale per principianti.",
tips:["Salita lunga ma molto dolce","Collegamento per Gavia e Stelvio"],
versanti:[
{side:"Edolo",startElevation:699,endElevation:1883,distance_km:24.0,avgGradient:4.9,maxGradient:8.0,traffic:"medio",exposure:"Ovest",
elevationProfile:[699,780,870,960,1050,1140,1230,1320,1410,1500,1590,1680,1770,1883],
routeCoords:[[46.175,10.332],[46.190,10.358],[46.206,10.390],[46.220,10.425],[46.234,10.465],[46.248,10.510],[46.255,10.548],[46.260,10.587]]}
]},
{id:"fedaia",name:"Passo Fedaia",lat:46.4558,lon:11.8719,elevation:2057,region:"Veneto",status:"seasonal",difficulty:7,
description:"Ai piedi della Marmolada, con il lago in cima. Muro finale!",
tips:["Galleria sul versante Canazei: luci obbligatorie"],
versanti:[
{side:"Canazei",startElevation:1465,endElevation:2057,distance_km:14.0,avgGradient:4.2,maxGradient:13.1,traffic:"medio",exposure:"Ovest",
elevationProfile:[1465,1510,1560,1620,1690,1770,1850,1930,1990,2030,2057],
routeCoords:[[46.476,11.770],[46.474,11.790],[46.471,11.812],[46.467,11.832],[46.463,11.848],[46.460,11.858],[46.457,11.868],[46.456,11.872]]}
]},
{id:"nivolet",name:"Colle del Nivolet",lat:45.5092,lon:7.1494,elevation:2612,region:"Piemonte",status:"seasonal",difficulty:9,
description:"Spettacolare nel Parco del Gran Paradiso. Chiuso alle auto la domenica!",
tips:["Chiuso al traffico la domenica in estate!","Stambecchi lungo la strada"],
versanti:[
{side:"Ceresole Reale",startElevation:1620,endElevation:2612,distance_km:14.0,avgGradient:7.1,maxGradient:12.0,traffic:"basso",exposure:"Est",
elevationProfile:[1620,1720,1830,1950,2080,2200,2320,2430,2530,2612],
routeCoords:[[45.434,7.218],[45.445,7.208],[45.456,7.197],[45.467,7.185],[45.478,7.173],[45.488,7.162],[45.498,7.153],[45.509,7.149]]}
]},
{id:"finestre",name:"Colle delle Finestre",lat:45.0744,lon:7.0556,elevation:2178,region:"Piemonte",status:"seasonal",difficulty:9,
description:"Famoso per gli 8 km finali in sterrato. Icona del Giro d'Italia.",
tips:["Ultimi km in sterrato: gomme almeno 25mm","Vista sulla Val di Susa"],
versanti:[
{side:"Meana di Susa",startElevation:540,endElevation:2178,distance_km:18.5,avgGradient:8.9,maxGradient:14.0,traffic:"basso",exposure:"Nord",
elevationProfile:[540,700,870,1040,1210,1380,1530,1680,1810,1960,2080,2178],
routeCoords:[[45.122,7.087],[45.116,7.083],[45.110,7.079],[45.104,7.075],[45.098,7.071],[45.092,7.067],[45.086,7.063],[45.080,7.059],[45.074,7.056]]}
]},
{id:"abetone",name:"Passo dell'Abetone",lat:44.1486,lon:10.6592,elevation:1388,region:"Emilia-Romagna",status:"open",difficulty:5,
description:"Il passo appenninico classico tra Pistoia e Modena.",
tips:["Salita lunga e dolce nella foresta"],
versanti:[
{side:"La Lima / Pistoia",startElevation:454,endElevation:1388,distance_km:17.0,avgGradient:5.5,maxGradient:8.0,traffic:"medio",exposure:"Sud",
elevationProfile:[454,540,630,720,810,900,1000,1100,1190,1280,1350,1388],
routeCoords:[[44.020,10.655],[44.040,10.656],[44.060,10.657],[44.080,10.658],[44.100,10.659],[44.120,10.659],[44.140,10.659],[44.149,10.659]]}
]},
{id:"futa",name:"Passo della Futa",lat:44.1192,lon:11.2653,elevation:903,region:"Emilia-Romagna",status:"open",difficulty:4,
description:"Valico principale Appennino tosco-emiliano. Vecchia statale Bologna-Firenze.",
tips:["Cimitero militare tedesco","Bellissimo in autunno"],
versanti:[
{side:"Firenzuola",startElevation:422,endElevation:903,distance_km:12.0,avgGradient:4.0,maxGradient:8.0,traffic:"medio",exposure:"Sud",
elevationProfile:[422,480,540,600,660,720,780,830,870,903],
routeCoords:[[44.060,11.260],[44.072,11.262],[44.084,11.264],[44.096,11.265],[44.108,11.266],[44.119,11.265]]}
]},
{id:"zoncolan",name:"Monte Zoncolan",lat:46.4523,lon:12.9289,elevation:1730,region:"Friuli-Venezia Giulia",status:"open",difficulty:10,
description:"Il Kaiser delle salite: il km piu duro d'Italia (17.6% medio)!",
tips:["Versante ovest da Ovaro e' brutale","Panorama sulle Alpi Carniche"],
versanti:[
{side:"Ovaro",startElevation:534,endElevation:1730,distance_km:9.8,avgGradient:12.2,maxGradient:17.6,traffic:"basso",exposure:"Ovest",
elevationProfile:[534,680,850,1020,1180,1340,1480,1600,1700,1730],
routeCoords:[[46.473,12.870],[46.470,12.882],[46.467,12.894],[46.463,12.905],[46.460,12.914],[46.457,12.922],[46.454,12.928],[46.452,12.929]]},
{side:"Sutrio",startElevation:538,endElevation:1730,distance_km:13.2,avgGradient:9.1,maxGradient:15.2,traffic:"basso",exposure:"Est",
elevationProfile:[538,650,770,890,1010,1120,1250,1380,1500,1610,1700,1730],
routeCoords:[[46.508,12.988],[46.500,12.978],[46.492,12.968],[46.484,12.958],[46.476,12.950],[46.468,12.942],[46.460,12.936],[46.454,12.931],[46.452,12.929]]}
]}
];
