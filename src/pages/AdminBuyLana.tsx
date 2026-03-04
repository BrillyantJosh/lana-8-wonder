import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Copy, Trash2, Send, Clock, CheckCircle2, CreditCard, AlertTriangle } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';
import { useNostrLanaParams, type ExchangeRates } from '@/hooks/useNostrLanaParams';

interface BuyLanaRecord {
  id: string;
  created_at: string;
  lana_wallet_id: string;
  payee: string;
  lana_amount: number;
  payment_method: string;
  phone_number: string | null;
  email: string | null;
  paid_on_account: string | null;
  tx: string | null;
  currency: string | null;
  payment_amount: number | null;
  status: string;
  split: string | null;
}

// Helper: calculate LANA amount from exchange rates
function calculateLanaAmount(currency: string | null, paymentAmount: number | null, exchangeRates: ExchangeRates): number {
  if (!currency || !paymentAmount) return 0;
  const rate = exchangeRates[currency as keyof ExchangeRates];
  if (!rate || rate === 0) return 0;
  return Math.floor(paymentAmount / rate);
}

const AdminBuyLana = () => {
  const navigate = useNavigate();
  const { params: nostrParams, loading: nostrLoading } = useNostrLanaParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pendingRecords, setPendingRecords] = useState<BuyLanaRecord[]>([]);
  const [waitingRecords, setWaitingRecords] = useState<BuyLanaRecord[]>([]);
  const [processingRecords, setProcessingRecords] = useState<BuyLanaRecord[]>([]);
  const [completedRecords, setCompletedRecords] = useState<BuyLanaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<{ id: string; step: 1 | 2 } | null>(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
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

        const res = await fetch('/api/check-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          },
          body: JSON.stringify({ nostr_hex_id: userNostrHexId })
        });
        const json = await res.json();

        setIsAdmin(json.data?.isGlobalAdmin || json.data?.isDomainAdmin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, []);

  // Fetch records and categorize by status
  const fetchRecords = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('buy_lana')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pending: BuyLanaRecord[] = [];
      const waiting: BuyLanaRecord[] = [];
      const processing: BuyLanaRecord[] = [];
      const completed: BuyLanaRecord[] = [];

      data?.forEach((record) => {
        switch (record.status) {
          case 'paid':
            waiting.push(record);
            break;
          case 'approved':
            processing.push(record);
            break;
          case 'transferred':
            completed.push(record);
            break;
          case 'pending':
          default:
            // Fallback: if status is missing/pending but has tx, treat as completed
            if (record.tx) {
              completed.push(record);
            } else if (record.paid_on_account && !record.tx) {
              waiting.push(record);
            } else {
              pending.push(record);
            }
            break;
        }
      });

      setPendingRecords(pending);
      setWaitingRecords(waiting);
      setProcessingRecords(processing);
      setCompletedRecords(completed);
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

  // Mark as paid (pending → paid)
  const handleMarkAsPaid = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('buy_lana')
        .update({ paid_on_account: new Date().toISOString(), status: 'paid' })
        .eq('id', id);

      if (error) throw error;

      toast.success('Payment confirmed — moved to Waiting for Slots');
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

  // Approve for transfer (paid → approved) — single record
  // Calculates LANA amount at THIS moment from KIND 38888 exchange rates
  const handleApproveForTransfer = async (id: string) => {
    if (!nostrParams?.exchangeRates) {
      toast.error('Cannot approve: KIND 38888 exchange rates not loaded yet');
      return;
    }

    const record = waitingRecords.find(r => r.id === id);
    if (!record) {
      toast.error('Record not found');
      return;
    }

    const lanaAmount = calculateLanaAmount(record.currency, record.payment_amount, nostrParams.exchangeRates);
    if (lanaAmount <= 0) {
      toast.error(`Cannot calculate LANA amount for ${record.currency} ${record.payment_amount}`);
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('buy_lana')
        .update({ status: 'approved', lana_amount: lanaAmount })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Approved: ${lanaAmount.toLocaleString()} LANA (Split ${nostrParams.split}) — heartbeat will transfer`);
      fetchRecords();
    } catch (error) {
      console.error('Error approving for transfer:', error);
      toast.error('Failed to approve for transfer');
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  // Approve ALL waiting records for transfer
  // Calculates LANA amount for each record at THIS moment from KIND 38888
  const handleApproveAllForTransfer = async () => {
    if (waitingRecords.length === 0) return;

    if (!nostrParams?.exchangeRates) {
      toast.error('Cannot approve: KIND 38888 exchange rates not loaded yet');
      return;
    }

    const ids = waitingRecords.map(r => r.id);
    setProcessingIds((prev) => {
      const newSet = new Set(prev);
      ids.forEach(id => newSet.add(id));
      return newSet;
    });

    try {
      // Update each record with calculated LANA amount
      for (const record of waitingRecords) {
        const lanaAmount = calculateLanaAmount(record.currency, record.payment_amount, nostrParams.exchangeRates);
        if (lanaAmount <= 0) {
          console.warn(`Skipping record ${record.id}: cannot calculate LANA for ${record.currency} ${record.payment_amount}`);
          continue;
        }

        const { error } = await supabase
          .from('buy_lana')
          .update({ status: 'approved', lana_amount: lanaAmount })
          .eq('id', record.id);
        if (error) throw error;
      }

      toast.success(`${ids.length} record(s) sent to processing with current exchange rates`);
      fetchRecords();
    } catch (error) {
      console.error('Error approving all:', error);
      toast.error('Failed to approve all records');
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        ids.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  // Save TX manually (processing → transferred)
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
        .update({ tx: txValue.trim(), status: 'transferred' })
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

  // Copy Wallet ID to clipboard
  const handleCopyWalletId = async (walletId: string) => {
    try {
      await navigator.clipboard.writeText(walletId);
      toast.success('Wallet ID copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error('Failed to copy Wallet ID');
    }
  };

  // Delete record with double confirmation
  const handleDeleteClick = (id: string) => {
    setDeleteConfirmStep({ id, step: 1 });
  };

  const handleFirstConfirm = () => {
    if (deleteConfirmStep) {
      setDeleteConfirmStep({ id: deleteConfirmStep.id, step: 2 });
    }
  };

  const handleFinalDelete = async () => {
    if (!deleteConfirmStep) return;

    setProcessingIds((prev) => new Set(prev).add(deleteConfirmStep.id));
    try {
      const { error } = await supabase
        .from('buy_lana')
        .delete()
        .eq('id', deleteConfirmStep.id);

      if (error) throw error;

      toast.success('Record deleted successfully');
      setDeleteConfirmStep(null);
      fetchRecords();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deleteConfirmStep.id);
        return newSet;
      });
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmStep(null);
  };

  // Reusable record info row for mobile cards
  const RecordInfoCard = ({ record, children }: { record: BuyLanaRecord; children?: React.ReactNode }) => (
    <Card key={record.id} className="p-4">
      <div className="space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-sm text-muted-foreground">Date</div>
            <div className="font-medium">
              {new Date(record.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Payment</div>
            <div className="font-medium capitalize">{record.payment_method}</div>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground">Wallet ID</div>
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs break-all flex-1">{record.lana_wallet_id}</div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleCopyWalletId(record.lana_wallet_id)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Payee</div>
            <div className="font-medium">{record.payee}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Phone</div>
            <div className="font-medium">{record.phone_number || '-'}</div>
          </div>
        </div>

        {record.email && (
          <div>
            <div className="text-sm text-muted-foreground">Email</div>
            <div className="font-medium text-sm">{record.email}</div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
          <div>
            <div className="text-xs text-muted-foreground">LANA</div>
            <div className="font-semibold text-sm">
              {record.lana_amount && record.lana_amount > 0 ? record.lana_amount.toLocaleString() : <span className="text-muted-foreground italic">TBD</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Amount</div>
            <div className="font-semibold text-sm">{record.payment_amount || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Currency</div>
            <div className="font-semibold text-sm">{record.currency || '-'}</div>
          </div>
        </div>

        {record.split && (
          <div className="text-xs text-muted-foreground">
            Split: <span className="font-medium text-foreground">{record.split}</span>
          </div>
        )}

        {children}
      </div>
    </Card>
  );

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/buy-lana8wonder')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold">Buy LANA Admin</h1>
          </div>
          <AdminMenu />
        </div>

        {/* Tabs */}
        <Card className="p-4 md:p-6">
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-4 text-xs md:text-sm">
              <TabsTrigger value="pending" className="gap-1">
                <CreditCard className="h-3 w-3 hidden md:block" />
                Pending ({pendingRecords.length})
              </TabsTrigger>
              <TabsTrigger value="waiting" className="gap-1">
                <Clock className="h-3 w-3 hidden md:block" />
                Waiting ({waitingRecords.length})
              </TabsTrigger>
              <TabsTrigger value="processing" className="gap-1">
                <Send className="h-3 w-3 hidden md:block" />
                Processing ({processingRecords.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-1">
                <CheckCircle2 className="h-3 w-3 hidden md:block" />
                Done ({completedRecords.length})
              </TabsTrigger>
            </TabsList>

            {/* ===================== TAB 1: PENDING (not yet paid) ===================== */}
            <TabsContent value="pending">
              <div className="mb-3 p-3 bg-yellow-500/10 rounded-lg text-sm text-muted-foreground">
                Users who signed up but have not yet paid. Mark as paid once you receive payment.
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
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
                            <div className="flex items-center gap-1">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyWalletId(record.lana_wallet_id)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount && record.lana_amount > 0 ? record.lana_amount.toLocaleString() : <span className="text-muted-foreground italic text-xs">TBD</span>}</TableCell>
                          <TableCell className="font-semibold">{record.payment_amount || '-'}</TableCell>
                          <TableCell>{record.currency || '-'}</TableCell>
                          <TableCell className="capitalize">{record.payment_method}</TableCell>
                          <TableCell>{record.phone_number || '-'}</TableCell>
                          <TableCell className="text-xs">{record.email || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleMarkAsPaid(record.id)}
                                disabled={processingIds.has(record.id)}
                              >
                                {processingIds.has(record.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Mark Paid'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteClick(record.id)}
                                disabled={processingIds.has(record.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {pendingRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">No pending records</div>
                ) : (
                  pendingRecords.map((record) => (
                    <RecordInfoCard key={record.id} record={record}>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => handleMarkAsPaid(record.id)}
                          disabled={processingIds.has(record.id)}
                        >
                          {processingIds.has(record.id) ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                          ) : (
                            'Mark as Paid'
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteClick(record.id)}
                          disabled={processingIds.has(record.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </RecordInfoCard>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ===================== TAB 2: WAITING FOR SLOTS ===================== */}
            <TabsContent value="waiting">
              {/* Current exchange rates from KIND 38888 */}
              {nostrParams?.exchangeRates && (
                <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-primary">Current rates (Split {nostrParams.split}):</span>
                    <span>100 EUR = {Math.floor(100 / nostrParams.exchangeRates.EUR).toLocaleString()} LANA</span>
                    <span>100 GBP = {Math.floor(100 / nostrParams.exchangeRates.GBP).toLocaleString()} LANA</span>
                    <span>100 USD = {Math.floor(100 / nostrParams.exchangeRates.USD).toLocaleString()} LANA</span>
                  </div>
                </div>
              )}
              {nostrLoading && (
                <div className="mb-3 p-3 bg-yellow-500/10 rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading exchange rates from KIND 38888...
                </div>
              )}
              <div className="mb-3 p-3 bg-blue-500/10 rounded-lg text-sm text-muted-foreground flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <span>Users who have paid and are waiting for available slots. LANA amount is calculated when you send to processing.</span>
                {waitingRecords.length > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleApproveAllForTransfer}
                    disabled={processingIds.size > 0 || !nostrParams?.exchangeRates}
                    className="whitespace-nowrap"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send All ({waitingRecords.length})
                  </Button>
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA (preview)</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Split</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waitingRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No records waiting for slots
                        </TableCell>
                      </TableRow>
                    ) : (
                      waitingRecords.map((record) => (
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
                            <div className="flex items-center gap-1">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyWalletId(record.lana_wallet_id)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>
                            {nostrParams?.exchangeRates && record.currency
                              ? <span className="text-primary font-medium">{calculateLanaAmount(record.currency, record.payment_amount, nostrParams.exchangeRates).toLocaleString()}</span>
                              : <span className="text-muted-foreground italic text-xs">Loading...</span>
                            }
                          </TableCell>
                          <TableCell className="font-semibold">{record.payment_amount || '-'}</TableCell>
                          <TableCell>{record.currency || '-'}</TableCell>
                          <TableCell>{record.split || '-'}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => handleApproveForTransfer(record.id)}
                              disabled={processingIds.has(record.id) || !nostrParams?.exchangeRates}
                              className="gap-1"
                            >
                              {processingIds.has(record.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Send className="h-3 w-3" />
                                  Send
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {waitingRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">No records waiting for slots</div>
                ) : (
                  waitingRecords.map((record) => (
                    <RecordInfoCard key={record.id} record={record}>
                      {record.paid_on_account && (
                        <div className="text-xs text-muted-foreground">
                          Paid on: <span className="font-medium text-foreground">{new Date(record.paid_on_account).toLocaleDateString()}</span>
                        </div>
                      )}
                      {nostrParams?.exchangeRates && record.currency && (
                        <div className="text-xs text-muted-foreground">
                          Will receive: <span className="font-medium text-foreground">
                            {calculateLanaAmount(record.currency, record.payment_amount, nostrParams.exchangeRates).toLocaleString()} LANA
                          </span> (at current rate)
                        </div>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => handleApproveForTransfer(record.id)}
                        disabled={processingIds.has(record.id) || !nostrParams?.exchangeRates}
                      >
                        {processingIds.has(record.id) ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                        ) : (
                          <><Send className="mr-2 h-4 w-4" /> Send to Processing</>
                        )}
                      </Button>
                    </RecordInfoCard>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ===================== TAB 3: PROCESSING (approved, heartbeat will handle) ===================== */}
            <TabsContent value="processing">
              <div className="mb-3 p-3 bg-orange-500/10 rounded-lg text-sm text-muted-foreground">
                Approved for LANA transfer. The heartbeat will automatically process these and fill in the TX ID.
                You can also enter a TX ID manually.
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No records in processing
                        </TableCell>
                      </TableRow>
                    ) : (
                      processingRecords.map((record) => (
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
                            <div className="flex items-center gap-1">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyWalletId(record.lana_wallet_id)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount && record.lana_amount > 0 ? record.lana_amount.toLocaleString() : <span className="text-muted-foreground italic text-xs">TBD</span>}</TableCell>
                          <TableCell className="font-semibold">{record.payment_amount || '-'}</TableCell>
                          <TableCell>{record.currency || '-'}</TableCell>
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

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {processingRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">No records in processing</div>
                ) : (
                  processingRecords.map((record) => (
                    <RecordInfoCard key={record.id} record={record}>
                      {record.paid_on_account && (
                        <div className="text-xs text-muted-foreground">
                          Paid on: <span className="font-medium text-foreground">{new Date(record.paid_on_account).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">Transaction ID</div>
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
                            disabled={processingIds.has(record.id)}
                          />
                          <Button
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
                      </div>
                    </RecordInfoCard>
                  ))
                )}
              </div>
            </TabsContent>

            {/* ===================== TAB 4: COMPLETED ===================== */}
            <TabsContent value="completed">
              <div className="mb-3 p-3 bg-green-500/10 rounded-lg text-sm text-muted-foreground">
                LANA has been transferred to these wallets. All done!
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Paid On</TableHead>
                      <TableHead>Wallet ID</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>LANA</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No completed records
                        </TableCell>
                      </TableRow>
                    ) : (
                      completedRecords.map((record) => (
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
                            <div className="flex items-center gap-1">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyWalletId(record.lana_wallet_id)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{record.payee}</TableCell>
                          <TableCell>{record.lana_amount && record.lana_amount > 0 ? record.lana_amount.toLocaleString() : <span className="text-muted-foreground italic text-xs">TBD</span>}</TableCell>
                          <TableCell className="font-semibold">{record.payment_amount || '-'}</TableCell>
                          <TableCell>{record.currency || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.tx || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {completedRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">No completed records</div>
                ) : (
                  completedRecords.map((record) => (
                    <RecordInfoCard key={record.id} record={record}>
                      <div className="p-3 bg-green-500/10 rounded-lg">
                        <div className="text-sm text-muted-foreground">Transaction ID</div>
                        <div className="font-mono text-xs break-all mt-1">
                          {record.tx || '-'}
                        </div>
                      </div>
                    </RecordInfoCard>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* First Confirmation Dialog */}
      <AlertDialog open={deleteConfirmStep?.step === 1} onOpenChange={(open) => !open && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Record?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this buy LANA record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleFirstConfirm}
            >
              Yes, Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second (Final) Confirmation Dialog */}
      <AlertDialog open={deleteConfirmStep?.step === 2} onOpenChange={(open) => !open && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final Confirmation</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-semibold text-foreground">
                This is your last chance to cancel!
              </span>
              <span className="block">
                The record will be permanently deleted and cannot be recovered. Are you absolutely sure?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleFinalDelete}
              disabled={processingIds.has(deleteConfirmStep?.id || '')}
            >
              {processingIds.has(deleteConfirmStep?.id || '') ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBuyLana;
