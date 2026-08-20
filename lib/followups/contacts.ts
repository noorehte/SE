// Per-brand email recipients for the cohort follow-up sends, sourced from the
// contacts sheet. The FIRST email is the primary recipient (the issue's
// requester / "To"); the rest go on CC. A brand with NO entry here is never
// emailed (VIP-tab brands, brands not on the sheet, and no-email contacts are
// intentionally omitted). Keyed by health_brand id.
//
// Send-list: May 12, June 30, July 9. VIP-tab brands (listed in the Notion doc,
// highlighted red) are intentionally omitted — we don't email them, incl.
// Advanced Bionutritionals (#1361, VIP). Also omitted: MyVitalC (#1287, June —
// "AB testing, don't email"). A brand with no entry here is never emailed.
export const SEND_CONTACTS: Record<number, string[]> = {
  1158: ["ande@shoplamarue.com", "nicole@shoplamarue.com"],            // L'AMARUE
  1307: ["erasmo.defalco@terralotus.shop", "phillip@silkroadep.com", "augustodef1@gmail.com"], // Terra Lotus
  1225: ["justas.grabauskas@gut.health"],                             // UAB Gut Health
  1266: ["jemma@respire.com", "jake@respire.com", "wyatt@respire.com"], // Respire
  1297: ["g@besynchro.com"],                                          // Synchro
  1290: ["kristen@kddnutra.com"],                                     // Anti-na
  1182: ["dsabella@dajesa.com"],                                      // Dajesa
  1333: ["nikola@goldenbayimports.com"],                             // Bite Me Tonic
  1324: ["rakesh@celcius.us", "vishnu@celcius.us"],                  // Celsius Herbs
  1090: ["benoit@follynutrition.com", "hannah@follynutrition.com", "brandon@follynutrition.com"], // Folly Nutrition
  734:  ["harry@zoefull.com", "marcos@zoefull.com", "yannis@zoefull.com"], // Zoefull
  307:  ["trisha@akitabiosciences.com", "lourdes@profispray.com"],   // Profi

  // ── June (30 brands; VIP KAL Vitamins/One Sol/Create excluded; Uplife #1613 has no contact) ──
  1176: ["paul@erythroslight.com", "baha@erythroslight.com"],       // erythroslight
  1358: ["chris@takeultra.com", "ankur@takeultra.com"],             // Ultra Pouches
  1382: ["liz@eezenaturalhealth.com"],                              // eeze Natural Health
  1303: ["shad@expanders.co.nz"],                                   // Genvex
  1212: ["lauren@diviofficial.com", "myles@diviofficial.com"],      // Divi
  1258: ["adam@advancedtrichology.com"],                            // Advanced Trichology
  1255: ["jen@unionbrands.co", "gabrielle@unionbrands.co"],         // Soneda Skincare
  1386: ["alejandro@camelecom.com", "niv@plateful.co", "tom@plateful.co"], // plateful
  1248: ["business@primalscienceshop.com"],                         // Primal Science
  1376: ["gemma@market-matcher.com"],                               // Revive Procare
  1319: ["sonia@legendairymilk.com", "luna@legendairymilk.com", "sierra.cook@legendairymilk.com"], // Legendairy Milk
  1381: ["otta@getbrighter.com", "simon@getbrighter.com"],          // Brighter
  1397: ["jim@sourbellies.com"],                                    // Sourbellies
  1379: ["kcook@tinywinskids.com"],                                 // Tiny Wins
  1368: ["luke@trelli.health"],                                     // Trelli
  1515: ["viktor@selfwisebrand.com"],                               // SELFWISE
  1406: ["cary@safesleevecases.com", "alaey@safesleevecases.com", "sara@safesleevecases.com"], // SafeSleeve
  1394: ["maswist@gmail.com"],                                      // FlushGut
  1521: ["marina@eli.health", "dave@eli.health"],                   // Eli Health
  1280: ["smitha@parevabeauty.com"],                                // Parëva Beauty
  1421: ["lawrence@vybrancelabs.co"],                               // Vybrance Labs
  1418: ["vova@reuscommerce.com"],                                  // Cata-kor
  1423: ["benbarrett0505@gmail.com"],                               // Fascial
  1391: ["todd@gelisleep.com"],                                     // Geli Sleep
  1511: ["emily@mechewellness.com"],                                // Meche Group Inc
  1442: ["paul@thebetterfly.com"],                                  // The Better Fly
  1510: ["arianna@helloyumi.com"],                                  // Yumi
  581:  ["alex@nbpure.com", "matt.aporta@nbpure.com"],              // NBPure
  1265: ["Rohan@igateinfotech.com"],                                // Nutrify Supplements
  1613: ["sales@uplifetoday.com", "awais.saleem2468@gmail.com"],    // Uplife

  // ── July (9 brands; VIP Bobbie/AG1/IM8/ONNIT excluded) ──
  215:  ["rami.abrams@siphoxhealth.com", "jordan.moradian@siphox.com"], // SiPhox Health
  1447: ["char@epatrol.co", "matt@epatrol.co", "kelsey@epatrol.co"], // E+PATROL
  1259: ["matthijs@smooche.com"],                                   // Smooche LLC
  1238: ["rob@dailies.co"],                                         // Dailies
  1449: ["akhil@wellmist.shop"],                                    // WellMist
  1353: ["domonickrodriguez@gmail.com"],                            // Arc5
  1434: ["savannah@annahmarketing.com", "bhall@truegracehealth.com"], // True Grace
  1228: ["paddy@propellerdigital.ie"],                              // Auric
  1385: ["james@epochbrands.io"],                                   // Lunakai
};

export function contactsFor(brandId: number): string[] | null {
  return SEND_CONTACTS[brandId] ?? null;
}
