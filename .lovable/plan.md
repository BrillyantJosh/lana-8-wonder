

# Zamenjava API servisa za registracijo denarnic

## Kaj se spremeni

Samo **1 vrstica** v datoteki `src/pages/PreviewLana8Wonder.tsx` — zamenjava URL-ja zunanjega API servisa.

## Sprememba

| Staro | Novo |
|-------|------|
| `https://pnhrbebgneacgcatuxdq.supabase.co/functions/v1/external-api` | `https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets` |

## Preverjeno

- Metoda ostane enaka: `register_virgin_wallets_for_existing_user`
- API key ostane enak: `ak_4mh3c7k5mx4ibskeufyv8p`
- Struktura zahtevka (request body) je identicna
- Struktura odgovora (response) je identicna
- Nobenih drugih sprememb ni potrebnih

## Tehnični detajl

Datoteka: `src/pages/PreviewLana8Wonder.tsx`, vrstica 601

```text
// Staro:
const response = await fetch('https://pnhrbebgneacgcatuxdq.supabase.co/functions/v1/external-api', {

// Novo:
const response = await fetch('https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets', {
```

## Opomba glede varnosti

API key je trenutno zapisan neposredno v frontend kodi (vidno vsem). To je bilo tako tudi prej, ni nova tezava. Ce zelite to popraviti v prihodnosti, se lahko API key premakne v backend funkcijo.

