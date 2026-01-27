
# Popravek: Prikaz podatkov o imetniku računa v legacy bančni sekciji

## Problem

Na strani `/buy-lana8wonder` se ne prikazujejo podatki o imetniku računa (ime, naslov, država), čeprav so bila polja dodana v kodo.

### Analiza

Po pregledu kode sem ugotovil naslednje:

1. **Obstajata dve sekciji** za prikaz bančnih podatkov:
   - **Nova sekcija** (`payment_methods` array) - vrstice 667-724
   - **Legacy sekcija** (stara bančna polja) - vrstice 726-758

2. **Nova polja sem dodal samo v prvo sekcijo** (`payment_methods`), ampak Nostr profil za `nostr_hex_id_buying_lanas` očitno uporablja **legacy bančna polja** (`bankName`, `bankAccount`, `bankSWIFT`, `bankAddress`), zato se prikaže legacy sekcija.

3. **V legacy sekciji manjkajo nova polja** za:
   - Account Holder (ime imetnika računa)
   - Address (lokacija/naslov)
   - Country (država)

## Rešitev

Dodam manjkajoča polja v legacy fallback sekcijo (vrstice 731-756):

```
/src/pages/BuyLana8Wonder.tsx
```

**Spremembe v legacy sekciji:**

```text
{/* Legacy bank fields fallback */}
{(!buyerProfile.payment_methods || buyerProfile.payment_methods.length === 0) && 
 (buyerProfile.bankName || buyerProfile.bankAccount) && (
  <div className="border-t border-border pt-4 space-y-2">
    <p className="text-sm font-semibold text-center">Bank Transfer Details</p>
    <div className="bg-background rounded-lg p-3 space-y-2">
      
      {/* NOVA: Account Holder */}
      {(buyerProfile.display_name || buyerProfile.name) && (
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">Account Holder:</span>
          <span className="text-xs font-mono">{buyerProfile.display_name || buyerProfile.name}</span>
        </div>
      )}
      
      {/* NOVA: Address (location) */}
      {buyerProfile.location && (
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">Address:</span>
          <span className="text-xs font-mono text-right">{buyerProfile.location}</span>
        </div>
      )}
      
      {/* NOVA: Country */}
      {buyerProfile.country && (
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">Country:</span>
          <span className="text-xs font-mono">{buyerProfile.country}</span>
        </div>
      )}

      {/* Obstoječa polja ostanejo */}
      {buyerProfile.bankName && ...}
      {buyerProfile.bankAccount && ...}
      {buyerProfile.bankSWIFT && ...}
      {buyerProfile.bankAddress && ...}
    </div>
  </div>
)}
```

## Tehnični povzetek

| Datoteka | Sprememba |
|----------|-----------|
| `src/pages/BuyLana8Wonder.tsx` | Dodaj 3 nova polja (Account Holder, Address, Country) v legacy fallback sekcijo |

Po tej spremembi bodo podatki o imetniku računa vidni ne glede na to, ali Nostr profil uporablja novo `payment_methods` strukturo ali stara legacy bančna polja.
