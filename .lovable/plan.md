

# Dodajanje boljšega logiranja za API klic registracije denarnic

## Problem

Trenutno ni dovolj informacij v logih, da bi ugotovili, zakaj registracija ne deluje. Konzolni logi ne prikazujejo nobenih sledi klica API-ja.

## Resitev

Dodati podrobnejse logiranje v `registerWallets` funkcijo v `src/pages/PreviewLana8Wonder.tsx`, da bomo lahko videli:
- Ali se funkcija sploh poklice
- Kaksen je request body
- Kaksen je HTTP status odgovora
- Ali je odgovor JSON ali HTML (pogosta napaka pri napacnem endpointu)
- Tocno sporocilo napake

## Spremembe

### Datoteka: `src/pages/PreviewLana8Wonder.tsx`

Razsirim logiranje okoli API klica (vrstice 595-648):

```text
// Pred klicem:
console.log('=== WALLET REGISTRATION START ===');
console.log('URL:', 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets');
console.log('Nostr Hex ID:', nostrHexId);
console.log('Wallets:', JSON.stringify(walletsData, null, 2));

// Po odgovoru (pred JSON parse):
console.log('Response status:', response.status);
console.log('Response Content-Type:', response.headers.get('content-type'));

// Ce ni JSON:
const contentType = response.headers.get('content-type');
if (!contentType?.includes('application/json')) {
  const textBody = await response.text();
  console.error('Non-JSON response:', textBody.substring(0, 500));
  throw new Error(`API returned non-JSON response (status ${response.status})`);
}

// Po JSON parse:
console.log('Response body:', JSON.stringify(result, null, 2));

// V catch bloku:
console.error('Full error details:', {
  name: error?.name,
  message: error?.message,
  stack: error?.stack
});
```

## Tehnicni povzetek

| Datoteka | Sprememba |
|----------|-----------|
| `src/pages/PreviewLana8Wonder.tsx` | Dodaj podrobno logiranje pred, med in po API klicu + preverjanje Content-Type pred JSON parsiranjem |

Po tej spremembi bomo ob naslednjem poizkusu registracije tocno videli, kaj se dogaja v konzolnih logih.
