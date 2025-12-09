import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Ticket, AlertCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LanaSystemParams } from '@/hooks/useNostrLanaParams';
import { WaitingListDialog } from './WaitingListDialog';

interface AvailableSlotsCardProps {
  params: LanaSystemParams | null;
  loading: boolean;
}

export const AvailableSlotsCard = ({
  params,
  loading
}: AvailableSlotsCardProps) => {
  const navigate = useNavigate();
  const [donationWalletId, setDonationWalletId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showWaitingListDialog, setShowWaitingListDialog] = useState(false);
  const [webpageUrl, setWebpageUrl] = useState<string | null>(null);
  const [reservedSlotsCount, setReservedSlotsCount] = useState<number | null>(null);

  // Fetch donation_wallet_id and webpage from app_settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_key, setting_value')
          .in('setting_key', ['donation_wallet_id', 'webpage']);
        
        if (error) throw error;
        
        if (data) {
          const donationWallet = data.find(s => s.setting_key === 'donation_wallet_id');
          const webpage = data.find(s => s.setting_key === 'webpage');
          
          if (donationWallet) setDonationWalletId(donationWallet.setting_value);
          if (webpage) setWebpageUrl(webpage.setting_value);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Unable to load wallet information');
      }
    };
    fetchSettings();
  }, []);

  // Fetch wallet balance when we have wallet ID and electrum servers
  useEffect(() => {
    if (!donationWalletId || !params?.electrum || params.electrum.length === 0) return;
    const fetchBalance = async () => {
      setFetchingBalance(true);
      setError(null);
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke('check-wallet-balance', {
          body: {
            wallet_addresses: [donationWalletId],
            electrum_servers: params.electrum.map(s => ({
              host: s.host,
              port: parseInt(s.port)
            }))
          }
        });
        if (error) throw error;
        if (data?.total_balance !== undefined) {
          setWalletBalance(data.total_balance);
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
        setError('Balance check unavailable');
      } finally {
        setFetchingBalance(false);
      }
    };
    fetchBalance();
  }, [donationWalletId, params?.electrum]);

  // Fetch reserved slots (unpaid reservations less than 62 hours old)
  useEffect(() => {
    const fetchReservedSlots = async () => {
      try {
        // Calculate 62 hours ago
        const sixtyTwoHoursAgo = new Date();
        sixtyTwoHoursAgo.setHours(sixtyTwoHoursAgo.getHours() - 62);
        
        const { count, error } = await supabase
          .from('buy_lana')
          .select('*', { count: 'exact', head: true })
          .is('tx', null)
          .gte('created_at', sixtyTwoHoursAgo.toISOString());
        
        if (error) throw error;
        
        setReservedSlotsCount(count || 0);
      } catch (err) {
        console.error('Error fetching reserved slots:', err);
        setReservedSlotsCount(0); // Default to 0 on error
      }
    };
    
    fetchReservedSlots();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchReservedSlots, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate available slots (total slots minus reserved slots)
  const availableSlots = useMemo(() => {
    if (walletBalance === null || !params?.exchangeRates?.EUR || reservedSlotsCount === null) return null;
    const amountForSigning = 100 / params.exchangeRates.EUR;
    const totalSlots = Math.floor(walletBalance / amountForSigning);
    return Math.max(0, totalSlots - reservedSlotsCount);
  }, [walletBalance, params?.exchangeRates?.EUR, reservedSlotsCount]);

  // Calculate LANA equivalent
  const lanaEquivalent = useMemo(() => {
    if (!params?.exchangeRates?.EUR) return null;
    return Math.floor(100 / params.exchangeRates.EUR);
  }, [params?.exchangeRates?.EUR]);

  const handleBuyClick = () => {
    setShowDialog(true);
  };

  const handleHasWallet = () => {
    setShowDialog(false);
    navigate('/buy-lana8wonder');
  };

  const handleNoWallet = () => {
    setShowDialog(false);
    if (webpageUrl) {
      const returnUrl = encodeURIComponent(`${webpageUrl}/buy-lana8wonder`);
      const siteName = encodeURIComponent('Lana8Wonder');
      window.open(`https://100million2everyone.com/?return_url=${returnUrl}&site_name=${siteName}`, '_blank');
    }
  };
  if (loading || fetchingBalance || reservedSlotsCount === null) {
    return <Card className="w-full bg-gradient-to-br from-primary/10 via-background to-secondary/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-20 w-full mb-4" />
          <Skeleton className="h-4 w-full mb-4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>;
  }
  if (error) {
    return <Card className="w-full bg-gradient-to-br from-destructive/10 via-background to-destructive/5 border-destructive/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h2 className="text-xl font-semibold text-foreground">Slot Information Unavailable</h2>
          </div>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>;
  }
  return <Card className="w-full bg-gradient-to-br from-primary/10 via-background to-secondary/10 border-primary/20 shadow-lg">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-full bg-primary/20">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Available Lana8Wonder Slots for buying</h2>
        </div>

        <div className="bg-background/50 rounded-lg p-6 mb-4 text-center">
          <div className="text-5xl sm:text-6xl font-bold text-primary mb-2">
            {availableSlots !== null ? availableSlots : '—'}
          </div>
          <div className="text-lg text-muted-foreground">
            {availableSlots === 1 ? 'slot available' : 'slots available'}
          </div>
        </div>

        {lanaEquivalent && <p className="text-sm text-muted-foreground text-center mb-6">
            Each slot requires ~{lanaEquivalent.toLocaleString()} LANA (€100 at current rate)
          </p>}

        {availableSlots === 0 ? (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No slots are currently available. Join our waiting list and we'll notify you when a slot becomes available.
              </p>
            </div>
            <Button 
              onClick={() => setShowWaitingListDialog(true)} 
              variant="outline"
              className="w-full text-lg py-6" 
              size="lg"
            >
              📋 Join Waiting List
            </Button>
          </div>
        ) : (
          <Button onClick={handleBuyClick} className="w-full text-lg py-6" size="lg">
            🚀 Buy Lana8Wonder
          </Button>
        )}

        {/* Dialog for users with available slots */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="mx-2 sm:mx-0 max-w-[calc(100vw-1rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Do you have a registered Lana Wallet?</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                To purchase Lana8Wonder, you need a Lana wallet. If you don't have one yet, we'll help you create it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleNoWallet} className="w-full sm:w-auto text-sm sm:text-base">
                No, create wallet
              </Button>
              <Button onClick={handleHasWallet} className="w-full sm:w-auto text-sm sm:text-base">
                Yes, I have a wallet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Waiting List Dialog */}
        <WaitingListDialog 
          open={showWaitingListDialog} 
          onOpenChange={setShowWaitingListDialog}
          relays={params?.relays || []}
        />
      </CardContent>
    </Card>;
};