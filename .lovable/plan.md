
# Vzrok problema in predlagani popravek

## Kaj se dogaja

Ko `fetchKind30889` pokliče relay z filtrom `{ kinds: [30889], "#d": [customerHexId] }`, relay vrne **vse** KIND 30889 evente ki imajo ta `#d` tag - ne glede na avtorja (registrarja) in ne glede na čas nastanka.

Možni scenariji zakaj sta dva eventa:
1. Registrar je objavil event dvakrat (npr. enkrat na vsakem relayu - `relay.lanavault.space` in `relay.lanacoin-eternity.com`)
2. Obstajata dva registrarja ki sta objavila event za istega kupca
3. Stari in novi event (posodobitev) sta oba na relayu

Ker koda naredi `flatMap` čez vse `walletRecords`, se ista denarnica pojavi dvakrat.

## Kje točno je napaka

**`src/lib/nostrClient.ts` (vrstica 121-168)**: `fetchKind30889` ne filtrira duplikatov. Vrne vse evente, tudi če vsebujejo enake denarnice.

**`src/pages/CreateLana8Wonder.tsx` (vrstica 161-167)**: `allWallets` je `flatMap` čez vse `walletRecords` brez deduplikacije.

## Predlagani popravek

### Sprememba 1: `src/lib/nostrClient.ts`

Po pridobitvi vseh eventov, obdrži samo **najnovejši event za vsakega registrarja** (glede na `event.pubkey` + `created_at`). Na ta način, če je isti registrar objavil event večkrat, se upošteva samo zadnji.

```ts
// Grupiramo evente po registrarju (pubkey), obdržimo samo najnovejšega
const latestByRegistrar = new Map<string, typeof events[0]>();
for (const event of events) {
  const existing = latestByRegistrar.get(event.pubkey);
  if (!existing || event.created_at > existing.created_at) {
    latestByRegistrar.set(event.pubkey, event);
  }
}
const dedupedEvents = Array.from(latestByRegistrar.values());
```

### Sprememba 2: `src/pages/CreateLana8Wonder.tsx`

Deduplikacija denarnic po `wallet_address` preden se prikažejo:

```ts
const allWallets = walletRecords.flatMap(record => 
  record.wallets.map(wallet => ({
    ...wallet,
    status: record.status,
    registrar: record.registrar_pubkey
  }))
);

// Deduplikacija - obdrži samo prvo pojavitev vsake denarnice
const uniqueWallets = allWallets.filter((wallet, index, self) =>
  index === self.findIndex(w => w.wallet_address === wallet.wallet_address)
);
```

Nato se `uniqueWallets` namesto `allWallets` uporablja v JSX za prikaz.

## Katera sprememba je boljša

**Priporočam obe spremembi skupaj:**
- Sprememba v `nostrClient.ts` reši problem pri viru (server-side deduplication po registrarju)
- Sprememba v `CreateLana8Wonder.tsx` je varnostna mreža (client-side deduplication po naslovu)

Tako je zagotovljeno da se nobena denarnica ne prikaže dvakrat, ne glede na vzrok podvajanja.

## Datoteke za spremembo

| Datoteka | Sprememba |
|---|---|
| `src/lib/nostrClient.ts` | Deduplikacija KIND 30889 eventov po registrar pubkey (najnovejši event na registrarja) |
| `src/pages/CreateLana8Wonder.tsx` | Deduplikacija `allWallets` po `wallet_address` pred prikazom |
