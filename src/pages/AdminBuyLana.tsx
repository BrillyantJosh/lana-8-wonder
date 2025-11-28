import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface BuyLanaRecord {
  id: string;
  created_at: string;
  lana_wallet_id: string;
  payee: string;
  lana_amount: number;
  payment_method: string;
  phone_number: string | null;
  paid_on_account: string | null;
  tx: string | null;
  currency: string | null;
  payment_amount: number | null;
}

const AdminBuyLana = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pendingRecords, setPendingRecords] = useState<BuyLanaRecord[]>([]);
  const [pendingTxRecords, setPendingTxRecords] = useState<BuyLanaRecord[]>([]);
  const [paidRecords, setPaidRecords] = useState<BuyLanaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        // Get session from sessionStorage (this app uses Nostr auth, not Supabase auth)
        const sessionData = sessionStorage.getItem('lana_session');
        
        if (!sessionData) {
          setIsAdmin(false);
          return;
        }

        const session = JSON.parse(sessionData);
        const userNostrHexId = session.nostrHexId;

        if (!userNostrHexId) {
          setIsAdmin(false);
          return;
        }

        // Get admin nostr_hex_id from app_settings
        const { data: settings } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'nostr_hex_id_buying_lanas')
          .maybeSingle();

        setIsAdmin(userNostrHexId === settings?.setting_value);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, []);

  // Fetch records
  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      // Fetch all records
      const { data, error } = await supabase
        .from('buy_lana')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Categorize records
      const pending: BuyLanaRecord[] = [];
      const pendingTx: BuyLanaRecord[] = [];
      const paid: BuyLanaRecord[] = [];

      data?.forEach((record) => {
        if (!record.paid_on_account) {
          pending.push(record);
        } else if (!record.tx) {
          pendingTx.push(record);
        } else {
          paid.push(record);
        }
      });

      setPendingRecords(pending);
      setPendingTxRecords(pendingTx);
      setPaidRecords(paid);
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin === true) {
      fetchRecords();
    } else if (isAdmin === false) {
      navigate('/');
    }
  }, [isAdmin, navigate]);

  // Mark as paid
  const handleMarkAsPaid = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('buy_lana')
        .update({ paid_on_account: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast.success('Payment confirmed');
      fetchRecords();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast.error('Failed to confirm payment');
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  // Save TX
  const handleSaveTx = async (id: string) => {
    const txValue = txInputs[id];
    if (!txValue?.trim()) {
      toast.error('Please enter a transaction ID');
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('buy_lana')
        .update({ tx: txValue.trim() })
        .eq('id', id);

      if (error) throw error;

      toast.success('Transaction ID saved');
      setTxInputs((prev) => {
        const newInputs = { ...prev };
        delete newInputs[id];
        return newInputs;
      });
      fetchRecords();
    } catch (error) {
      console.error('Error saving TX:', error);
      toast.error('Failed to save transaction ID');
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  if (isAdmin === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/buy-lana8wonder')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">Buy LANA Admin Panel</h1>
        </div>

        {/* Tabs */}
        <Card className="p-6">
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">
                Pending ({pendingRecords.length})
              </TabsTrigger>
              <TabsTrigger value="pending-tx">
                Pending for TX ({pendingTxRecords.length})
              </TabsTrigger>
              <TabsTrigger value="paid">
                Paid ({paidRecords.length})
              </TabsTrigger>
            </TabsList>

            {/* Pending Tab */}
            <TabsContent value="pending">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA Amount</TableHead>
                      <TableHead>Payment Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No pending records
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(record.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.lana_wallet_id.slice(0, 12)}...
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount.toLocaleString()} LANA</TableCell>
                          <TableCell className="font-semibold">
                            {record.payment_amount || '-'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {record.currency || '-'}
                          </TableCell>
                          <TableCell className="capitalize">{record.payment_method}</TableCell>
                          <TableCell>{record.phone_number || '-'}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsPaid(record.id)}
                              disabled={processingIds.has(record.id)}
                            >
                              {processingIds.has(record.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Mark as Paid'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Pending for TX Tab */}
            <TabsContent value="pending-tx">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA Amount</TableHead>
                      <TableHead>Payment Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTxRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No records pending for transaction ID
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingTxRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(record.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {record.paid_on_account
                              ? new Date(record.paid_on_account).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.lana_wallet_id.slice(0, 12)}...
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount.toLocaleString()} LANA</TableCell>
                          <TableCell className="font-semibold">
                            {record.payment_amount || '-'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {record.currency || '-'}
                          </TableCell>
                          <TableCell>{record.phone_number || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter TX ID"
                                value={txInputs[record.id] || ''}
                                onChange={(e) =>
                                  setTxInputs((prev) => ({
                                    ...prev,
                                    [record.id]: e.target.value,
                                  }))
                                }
                                className="w-48"
                                disabled={processingIds.has(record.id)}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleSaveTx(record.id)}
                                disabled={processingIds.has(record.id)}
                              >
                                {processingIds.has(record.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Save'
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Paid Tab */}
            <TabsContent value="paid">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA Amount</TableHead>
                      <TableHead>Payment Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No paid records
                        </TableCell>
                      </TableRow>
                    ) : (
                      paidRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(record.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {record.paid_on_account
                              ? new Date(record.paid_on_account).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.lana_wallet_id.slice(0, 12)}...
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount.toLocaleString()} LANA</TableCell>
                          <TableCell className="font-semibold">
                            {record.payment_amount || '-'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {record.currency || '-'}
                          </TableCell>
                          <TableCell>{record.phone_number || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.tx || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default AdminBuyLana;
