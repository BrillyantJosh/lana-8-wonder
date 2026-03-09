import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ExternalLink, Wallet, User, Snowflake, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getDomainKey } from '@/integrations/api/client';
import { fetchKind0Profile, fetchKind30889, type LanaProfile, type WalletInfo } from '@/lib/nostrClient';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string | null;
}

const WALLET_TYPE_ORDER: Record<string, number> = {
  'Main Wallet': 1,
  'Wallet': 2,
  'LanaPays.Us': 3,
  'Knights': 4,
  'Lana8Wonder': 5,
};

const FREEZE_REASONS: Record<string, string> = {
  frozen_l8w: 'Late wallet registration',
  frozen_max_cap: 'Maximum balance cap exceeded',
  frozen_too_wild: 'Irregular or suspicious activity',
  frozen_unreg_Lanas: 'Unregistered LANA exceeding threshold',
  frozen: 'All accounts frozen by registrar',
};

export function UserProfileDialog({ open, onOpenChange, walletAddress }: UserProfileDialogProps) {
  const { params } = useNostrLanaParams();
  const [loading, setLoading] = useState(false);
  const [nostrHexId, setNostrHexId] = useState<string | null>(null);
  const [profile, setProfile] = useState<LanaProfile | null>(null);
  const [wallets, setWallets] = useState<(WalletInfo & { freezeStatus?: string })[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNostrHexId(null);
      setProfile(null);
      setWallets([]);
      setBalances({});
      setError(null);
    }
  }, [open]);

  // Fetch user data when walletAddress changes and dialog opens
  useEffect(() => {
    if (!open || !walletAddress || !params?.relays) return;

    const fetchUserData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Step 1: Check wallet registration to get nostr_hex_id
        const regRes = await fetch('/api/check-wallet-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          },
          body: JSON.stringify({ wallet_id: walletAddress })
        });
        const regJson = await regRes.json();

        if (!regJson.registered || !regJson.wallet?.nostr_hex_id) {
          setError('Wallet not registered or owner not found');
          setLoading(false);
          return;
        }

        const hexId = regJson.wallet.nostr_hex_id;
        setNostrHexId(hexId);

        // Step 2: Fetch KIND 0 profile and KIND 30889 wallet list in parallel
        const [profileResult, walletRecords] = await Promise.all([
          fetchKind0Profile(hexId, params.relays),
          fetchKind30889(hexId, params.relays)
        ]);

        setProfile(profileResult);

        // Extract wallets from the newest record, including freeze status from tag[6]
        if (walletRecords.length > 0) {
          // Use the first (newest after dedup) record
          const record = walletRecords[0];
          // Re-parse to get freeze status (tag index 6) which isn't in the base WalletInfo
          const enrichedWallets = record.wallets.map(w => ({
            ...w,
            freezeStatus: '' // Will be populated below
          }));

          // Re-fetch the raw event to get freeze status tags
          // For now, use the wallet list as-is, sorted by type
          const sorted = enrichedWallets.sort((a, b) => {
            const orderA = WALLET_TYPE_ORDER[a.wallet_type] || 99;
            const orderB = WALLET_TYPE_ORDER[b.wallet_type] || 99;
            return orderA - orderB;
          });

          setWallets(sorted);

          // Step 3: Fetch balances for all wallets
          fetchBalances(sorted.map(w => w.wallet_address));
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [open, walletAddress, params?.relays]);

  // Fetch balances from Electrum via the existing endpoint
  const fetchBalances = async (addresses: string[]) => {
    if (addresses.length === 0) return;
    setBalancesLoading(true);
    try {
      const res = await fetch('/api/check-wallet-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_addresses: addresses,
          electrum_servers: [
            { host: 'electrum1.lanacoin.com', port: 5097 },
            { host: 'electrum2.lanacoin.com', port: 5097 }
          ]
        })
      });
      const json = await res.json();
      if (json.success && json.wallets) {
        const balMap: Record<string, number> = {};
        for (const w of json.wallets) {
          balMap[w.wallet_id] = w.balance;
        }
        setBalances(balMap);
      }
    } catch (err) {
      console.error('Error fetching balances:', err);
    } finally {
      setBalancesLoading(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const totalBalance = Object.values(balances).reduce((sum, b) => sum + b, 0);
  const displayName = profile?.display_name || profile?.name || 'Unknown User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Profile
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-muted-foreground">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && profile && (
          <div className="space-y-4">
            {/* Profile Header */}
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.picture} alt={displayName} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate">{profile.display_name || profile.name || 'Unknown User'}</h3>
                {profile.display_name && profile.name && profile.name !== profile.display_name && (
                  <p className="text-sm text-muted-foreground">@{profile.name}</p>
                )}
                {!profile.display_name && !profile.name && null}
                {profile.about && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{profile.about}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {profile.country && (
                    <Badge variant="secondary" className="text-xs">{profile.country}</Badge>
                  )}
                  {profile.currency && (
                    <Badge variant="outline" className="text-xs">{profile.currency}</Badge>
                  )}
                  {profile.language && (
                    <Badge variant="outline" className="text-xs">{profile.language}</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Nostr HEX ID */}
            {nostrHexId && (
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                <span className="text-muted-foreground">Nostr:</span>
                <span className="font-mono truncate flex-1">{nostrHexId}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleCopy(nostrHexId, 'Nostr ID')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Total Balance */}
            <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Total Balance</span>
              </div>
              <div className="font-bold text-lg">
                {balancesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xs font-normal text-muted-foreground">LANA</span></>
                )}
              </div>
            </div>

            {/* Wallet List */}
            <div>
              <h4 className="font-semibold text-sm mb-2 text-muted-foreground">
                Wallets ({wallets.length})
              </h4>
              <div className="space-y-2">
                {wallets.map((wallet, i) => {
                  const balance = balances[wallet.wallet_address];
                  const isHighlighted = wallet.wallet_address === walletAddress;
                  const isFrozen = !!wallet.freezeStatus && wallet.freezeStatus !== '';
                  const freezeLabel = wallet.freezeStatus ? FREEZE_REASONS[wallet.freezeStatus] || wallet.freezeStatus : '';

                  return (
                    <Card
                      key={wallet.wallet_address}
                      className={`p-3 ${isHighlighted ? 'border-primary/50 bg-primary/5' : ''} ${isFrozen ? 'border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={wallet.wallet_type === 'Main Wallet' ? 'default' : 'secondary'} className="text-xs shrink-0">
                              {wallet.wallet_type}
                            </Badge>
                            {isHighlighted && (
                              <Badge variant="outline" className="text-xs border-primary text-primary shrink-0">Current</Badge>
                            )}
                            {isFrozen && (
                              <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 shrink-0">
                                <Snowflake className="h-3 w-3 mr-1" />
                                FROZEN
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs truncate">{wallet.wallet_address}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => handleCopy(wallet.wallet_address, 'Wallet')}>
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <a
                              href={`https://chainz.cryptoid.info/lana/address.dws?${wallet.wallet_address}.htm`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0"
                            >
                              <Button variant="ghost" size="icon" className="h-5 w-5">
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                            </a>
                          </div>
                          {wallet.note && (
                            <div className="text-xs text-muted-foreground mt-0.5">{wallet.note}</div>
                          )}
                          {isFrozen && freezeLabel && (
                            <div className="text-xs text-blue-600 mt-0.5">{freezeLabel}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {balancesLoading ? (
                            <Skeleton className="h-5 w-20" />
                          ) : balance !== undefined ? (
                            <span className={`font-semibold text-sm ${balance > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              <span className="text-xs font-normal text-muted-foreground ml-1">LANA</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Loaded but no profile found */}
        {!loading && !error && !profile && nostrHexId && (
          <div className="py-8 text-center text-muted-foreground">
            <p>No Nostr profile found for this user.</p>
            <p className="text-xs mt-1">Nostr ID: {nostrHexId}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
