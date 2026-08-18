// Per-brand email recipients for the cohort follow-up sends, sourced from the
// contacts sheet. The FIRST email is the primary recipient (the issue's
// requester / "To"); the rest go on CC. A brand with NO entry here is never
// emailed (VIP-tab brands, brands not on the sheet, and no-email contacts are
// intentionally omitted). Keyed by health_brand id.
//
// May send-list (13 brands). June/July are added when those batches launch.
// P.S. Good Times (#1357) and Good Idea (#302) were dropped when the reviews-
// ready rule tightened to >=2 shared notes on one product (they had only 1).
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
  1361: ["mmesser@soundpub.com", "asuh@soundpub.com", "asiphavong@soundpub.com"], // Advanced Bionutritionals
  307:  ["trisha@akitabiosciences.com", "lourdes@profispray.com"],   // Profi
};

export function contactsFor(brandId: number): string[] | null {
  return SEND_CONTACTS[brandId] ?? null;
}
