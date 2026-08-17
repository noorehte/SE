// Brand (health_brand id) → Pylon account id, so each bump issue is pinned to
// the correct brand account in Pylon rather than an account auto-created from
// the requester's email domain. Populated from the Pylon accounts API (matched
// on the brand's HubSpot company id / domain) — see the ↔ mapping notes.
// Empty entries fall back to Pylon's default domain-based association.
export const PYLON_ACCOUNT_IDS: Record<number, string> = {
  1158: "cb8e6ad7-9914-438d-aa1b-80a4920cb00e", // L'AMARUE
  1307: "960a1912-87b7-476f-88cb-46ca22e32eca", // Terra Lotus
  1225: "4afd7f5a-da63-4afd-b31b-e58184d512d4", // UAB Gut Health
  1266: "4140b52d-9457-4f66-92d2-21fb1bf19e35", // Respire
  1297: "36de0cd9-5a98-45d4-880a-65631bceaef7", // Synchro
  1290: "fc5574b2-284a-4b57-84c2-f21240ce25d7", // Anti-Na
  1357: "0a472142-959a-4036-84b9-c1132f1def74", // P.S. Good Times
  1182: "0b4c7559-829d-47b7-94ce-5c28ee19f80e", // Dajesa
  1333: "babec337-7126-4553-a9c4-4b85f2c172c5", // Bite Me Tonic
  1324: "f01292d6-21ae-467f-9750-c5cdf5ea79c0", // Celsius Herbs — "Celcius" (celcius.us, matches contacts); confirm during audit
  302:  "c2dc4079-380f-4d2c-ad68-984c820b42f5", // Good Idea
  1090: "5e942a51-9553-40b7-9645-25f28b0a5d96", // Folly Nutrition
  734:  "562af821-29fd-45c6-9d63-61de2321a7e0", // Zoefull
  1361: "e4cac8f1-8063-48ba-973c-e5d6c7d5b4b1", // Advanced Bionutritionals
  307:  "cfedc4d2-acbd-4f4d-9da1-05966f12ec3c", // Profi
};

export function pylonAccountIdFor(brandId: number): string | undefined {
  return PYLON_ACCOUNT_IDS[brandId];
}
