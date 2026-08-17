// AUTO-GENERATED cohort for the reviews follow-up sequence (May/June/July 2026,
// reviews sent but not live). Frozen allowlist — this is the ONLY set the cohort
// follow-up engine acts on. Regenerate deliberately; do not add brands casually.
//   reviewsSentDate = earliest of product all_reviews_sent_at and brand
//                     reviews_ready_email_sent_at (portal reviews-ready email).
//   caiReady        = brand also had an approved CAI product assessment with no
//                     live CAI widget at cohort-build time (drives the +CAI bump).
export type CohortMonth = "may" | "june" | "july";

export interface CohortBrand {
  id: number;
  name: string;
  month: CohortMonth;
  reviewsSentDate: string; // ISO date (YYYY-MM-DD)
  caiReady: boolean;
}

export const FOLLOWUP_COHORT: CohortBrand[] = [
  {
    "id": 1158,
    "name": "L'AMARUE",
    "month": "may",
    "reviewsSentDate": "2026-05-06",
    "caiReady": true
  },
  {
    "id": 1307,
    "name": "Terra Lotus",
    "month": "may",
    "reviewsSentDate": "2026-05-06",
    "caiReady": false
  },
  {
    "id": 1225,
    "name": "UAB GUT HEALTH",
    "month": "may",
    "reviewsSentDate": "2026-05-07",
    "caiReady": false
  },
  {
    "id": 1279,
    "name": "Atlantic Naturals",
    "month": "may",
    "reviewsSentDate": "2026-05-08",
    "caiReady": false
  },
  {
    "id": 1266,
    "name": "Respire",
    "month": "may",
    "reviewsSentDate": "2026-05-11",
    "caiReady": true
  },
  {
    "id": 1298,
    "name": "Lemme",
    "month": "may",
    "reviewsSentDate": "2026-05-12",
    "caiReady": false
  },
  {
    "id": 1297,
    "name": "Synchro",
    "month": "may",
    "reviewsSentDate": "2026-05-14",
    "caiReady": false
  },
  {
    "id": 1210,
    "name": "Regusk Labs",
    "month": "may",
    "reviewsSentDate": "2026-05-18",
    "caiReady": false
  },
  {
    "id": 1290,
    "name": "Anti-na",
    "month": "may",
    "reviewsSentDate": "2026-05-21",
    "caiReady": true
  },
  {
    "id": 1357,
    "name": "P.S. Good Times",
    "month": "may",
    "reviewsSentDate": "2026-05-22",
    "caiReady": false
  },
  {
    "id": 1182,
    "name": "Dajesa",
    "month": "may",
    "reviewsSentDate": "2026-05-26",
    "caiReady": true
  },
  {
    "id": 1333,
    "name": "Bite Me Tonic",
    "month": "may",
    "reviewsSentDate": "2026-05-27",
    "caiReady": true
  },
  {
    "id": 1324,
    "name": "Celsius Herbs",
    "month": "may",
    "reviewsSentDate": "2026-05-27",
    "caiReady": true
  },
  {
    "id": 302,
    "name": "Good Idea",
    "month": "may",
    "reviewsSentDate": "2026-05-27",
    "caiReady": false
  },
  {
    "id": 1090,
    "name": "Folly Nutrition",
    "month": "may",
    "reviewsSentDate": "2026-05-28",
    "caiReady": true
  },
  {
    "id": 734,
    "name": "Zoefull",
    "month": "may",
    "reviewsSentDate": "2026-05-28",
    "caiReady": false
  },
  {
    "id": 1361,
    "name": "Advanced Bionutritionals",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": false
  },
  {
    "id": 1318,
    "name": "Evvy",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": false
  },
  {
    "id": 465,
    "name": "Grüns",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": true
  },
  {
    "id": 1350,
    "name": "Iota",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": false
  },
  {
    "id": 1327,
    "name": "k2o",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": false
  },
  {
    "id": 307,
    "name": "Profi",
    "month": "may",
    "reviewsSentDate": "2026-05-29",
    "caiReady": true
  },
  {
    "id": 1176,
    "name": "erythroslight",
    "month": "june",
    "reviewsSentDate": "2026-06-01",
    "caiReady": false
  },
  {
    "id": 1358,
    "name": "Ultra Pouches",
    "month": "june",
    "reviewsSentDate": "2026-06-01",
    "caiReady": false
  },
  {
    "id": 1382,
    "name": "eeze Natural Health",
    "month": "june",
    "reviewsSentDate": "2026-06-02",
    "caiReady": true
  },
  {
    "id": 1303,
    "name": "Genvex",
    "month": "june",
    "reviewsSentDate": "2026-06-02",
    "caiReady": false
  },
  {
    "id": 1287,
    "name": "MyVitalC",
    "month": "june",
    "reviewsSentDate": "2026-06-02",
    "caiReady": false
  },
  {
    "id": 1212,
    "name": "Divi",
    "month": "june",
    "reviewsSentDate": "2026-06-03",
    "caiReady": true
  },
  {
    "id": 1326,
    "name": "KAL Vitamins",
    "month": "june",
    "reviewsSentDate": "2026-06-03",
    "caiReady": false
  },
  {
    "id": 1258,
    "name": "Advanced Trichology",
    "month": "june",
    "reviewsSentDate": "2026-06-05",
    "caiReady": true
  },
  {
    "id": 1255,
    "name": "Soneda Skincare",
    "month": "june",
    "reviewsSentDate": "2026-06-05",
    "caiReady": true
  },
  {
    "id": 1386,
    "name": "plateful",
    "month": "june",
    "reviewsSentDate": "2026-06-08",
    "caiReady": false
  },
  {
    "id": 1248,
    "name": "Primal Science",
    "month": "june",
    "reviewsSentDate": "2026-06-08",
    "caiReady": false
  },
  {
    "id": 1376,
    "name": "Revive Procare",
    "month": "june",
    "reviewsSentDate": "2026-06-08",
    "caiReady": false
  },
  {
    "id": 1319,
    "name": "Legendairy Milk",
    "month": "june",
    "reviewsSentDate": "2026-06-09",
    "caiReady": false
  },
  {
    "id": 1381,
    "name": "Brighter",
    "month": "june",
    "reviewsSentDate": "2026-06-10",
    "caiReady": false
  },
  {
    "id": 1397,
    "name": "Sourbellies",
    "month": "june",
    "reviewsSentDate": "2026-06-10",
    "caiReady": false
  },
  {
    "id": 1379,
    "name": "Tiny Wins",
    "month": "june",
    "reviewsSentDate": "2026-06-10",
    "caiReady": true
  },
  {
    "id": 1165,
    "name": "Newton Baby",
    "month": "june",
    "reviewsSentDate": "2026-06-11",
    "caiReady": false
  },
  {
    "id": 1368,
    "name": "Trelli",
    "month": "june",
    "reviewsSentDate": "2026-06-11",
    "caiReady": false
  },
  {
    "id": 1515,
    "name": "SELFWISE",
    "month": "june",
    "reviewsSentDate": "2026-06-16",
    "caiReady": false
  },
  {
    "id": 1406,
    "name": "SafeSleeve",
    "month": "june",
    "reviewsSentDate": "2026-06-17",
    "caiReady": true
  },
  {
    "id": 1394,
    "name": "FlushGut",
    "month": "june",
    "reviewsSentDate": "2026-06-18",
    "caiReady": true
  },
  {
    "id": 450,
    "name": "Create",
    "month": "june",
    "reviewsSentDate": "2026-06-22",
    "caiReady": true
  },
  {
    "id": 1521,
    "name": "Eli Health",
    "month": "june",
    "reviewsSentDate": "2026-06-22",
    "caiReady": false
  },
  {
    "id": 1280,
    "name": "Parëva Beauty",
    "month": "june",
    "reviewsSentDate": "2026-06-22",
    "caiReady": false
  },
  {
    "id": 1398,
    "name": "Bronzebody",
    "month": "june",
    "reviewsSentDate": "2026-06-23",
    "caiReady": false
  },
  {
    "id": 1336,
    "name": "One Sol",
    "month": "june",
    "reviewsSentDate": "2026-06-23",
    "caiReady": false
  },
  {
    "id": 1613,
    "name": "Uplife",
    "month": "june",
    "reviewsSentDate": "2026-06-26",
    "caiReady": true
  },
  {
    "id": 1421,
    "name": "Vybrance Labs",
    "month": "june",
    "reviewsSentDate": "2026-06-26",
    "caiReady": false
  },
  {
    "id": 1536,
    "name": "Awesome Aminos",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1418,
    "name": "Cata-kor",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1443,
    "name": "Clare",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1435,
    "name": "Dear Apothecary",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1423,
    "name": "Fascial",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1391,
    "name": "Geli Sleep",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1417,
    "name": "Gum of Gods",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1464,
    "name": "In Season",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1511,
    "name": "Meche Group Inc",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1432,
    "name": "Milky",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1495,
    "name": "PCOS Pal",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1311,
    "name": "Solius",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 1442,
    "name": "The Better Fly",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1440,
    "name": "Toniiq",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1480,
    "name": "We Heart Nutrition",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": true
  },
  {
    "id": 1510,
    "name": "Yumi",
    "month": "june",
    "reviewsSentDate": "2026-06-27",
    "caiReady": false
  },
  {
    "id": 581,
    "name": "NBPure",
    "month": "june",
    "reviewsSentDate": "2026-06-29",
    "caiReady": false
  },
  {
    "id": 1453,
    "name": "Jupiter Neurosciences",
    "month": "june",
    "reviewsSentDate": "2026-06-30",
    "caiReady": false
  },
  {
    "id": 1265,
    "name": "Nutrify Supplements",
    "month": "june",
    "reviewsSentDate": "2026-06-30",
    "caiReady": false
  },
  {
    "id": 215,
    "name": "SiPhox Health",
    "month": "july",
    "reviewsSentDate": "2026-07-01",
    "caiReady": false
  },
  {
    "id": 1447,
    "name": "E+PATROL",
    "month": "july",
    "reviewsSentDate": "2026-07-02",
    "caiReady": true
  },
  {
    "id": 1246,
    "name": "ONNIT",
    "month": "july",
    "reviewsSentDate": "2026-07-06",
    "caiReady": true
  },
  {
    "id": 1259,
    "name": "Smooche LLC",
    "month": "july",
    "reviewsSentDate": "2026-07-06",
    "caiReady": true
  },
  {
    "id": 841,
    "name": "Bobbie",
    "month": "july",
    "reviewsSentDate": "2026-07-07",
    "caiReady": false
  },
  {
    "id": 1238,
    "name": "Dailies",
    "month": "july",
    "reviewsSentDate": "2026-07-10",
    "caiReady": false
  },
  {
    "id": 1449,
    "name": "WellMist",
    "month": "july",
    "reviewsSentDate": "2026-07-10",
    "caiReady": true
  },
  {
    "id": 1353,
    "name": "Arc5",
    "month": "july",
    "reviewsSentDate": "2026-07-17",
    "caiReady": true
  },
  {
    "id": 1434,
    "name": "True Grace",
    "month": "july",
    "reviewsSentDate": "2026-07-17",
    "caiReady": false
  },
  {
    "id": 1228,
    "name": "Auric",
    "month": "july",
    "reviewsSentDate": "2026-07-23",
    "caiReady": true
  },
  {
    "id": 1285,
    "name": "IM8",
    "month": "july",
    "reviewsSentDate": "2026-07-23",
    "caiReady": false
  },
  {
    "id": 1385,
    "name": "Lunakai",
    "month": "july",
    "reviewsSentDate": "2026-07-23",
    "caiReady": true
  },
  {
    "id": 1590,
    "name": "AG1",
    "month": "july",
    "reviewsSentDate": "2026-07-28",
    "caiReady": false
  }
];

export const COHORT_IDS: Set<number> = new Set(FOLLOWUP_COHORT.map((b) => b.id));

export function cohortBrand(id: number): CohortBrand | undefined {
  return FOLLOWUP_COHORT.find((b) => b.id === id);
}
