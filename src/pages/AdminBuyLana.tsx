import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Copy, Trash2 } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';

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
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<{ id: string; step: 1 | 2 } | null>(null);

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

        // Check if user is in admin_users table
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('id')
          .eq('nostr_hex_id', userNostrHexId)
          .maybeSingle();

        setIsAdmin(!!adminUser);
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
            <h1 className="text-3xl font-bold">Buy LANA Admin Panel</h1>
          </div>
          <AdminMenu />
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
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                            <div className="flex items-center gap-2">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopyWalletId(record.lana_wallet_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
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
                            <div className="flex gap-2">
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

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {pendingRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No pending records
                  </div>
                ) : (
                  pendingRecords.map((record) => (
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

                        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <div className="text-xs text-muted-foreground">LANA</div>
                            <div className="font-semibold text-sm">
                              {record.lana_amount.toLocaleString()}
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

                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => handleMarkAsPaid(record.id)}
                            disabled={processingIds.has(record.id)}
                          >
                            {processingIds.has(record.id) ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                              </>
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
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Pending for TX Tab */}
            <TabsContent value="pending-tx">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                            <div className="flex items-center gap-2">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopyWalletId(record.lana_wallet_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
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

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {pendingTxRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No records pending for transaction ID
                  </div>
                ) : (
                  pendingTxRecords.map((record) => (
                    <Card key={record.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-muted-foreground">Created</div>
                            <div className="font-medium">
                              {new Date(record.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Paid On</div>
                            <div className="font-medium">
                              {record.paid_on_account
                                ? new Date(record.paid_on_account).toLocaleDateString()
                                : '-'}
                            </div>
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

                        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <div className="text-xs text-muted-foreground">LANA</div>
                            <div className="font-semibold text-sm">
                              {record.lana_amount.toLocaleString()}
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
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Paid Tab */}
            <TabsContent value="paid">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
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
                            <div className="flex items-center gap-2">
                              <span>{record.lana_wallet_id.slice(0, 12)}...</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleCopyWalletId(record.lana_wallet_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
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

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {paidRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No paid records
                  </div>
                ) : (
                  paidRecords.map((record) => (
                    <Card key={record.id} className="p-4 border-green-500/20">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-muted-foreground">Created</div>
                            <div className="font-medium">
                              {new Date(record.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Paid On</div>
                            <div className="font-medium">
                              {record.paid_on_account
                                ? new Date(record.paid_on_account).toLocaleDateString()
                                : '-'}
                            </div>
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

                        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
                          <div>
                            <div className="text-xs text-muted-foreground">LANA</div>
                            <div className="font-semibold text-sm">
                              {record.lana_amount.toLocaleString()}
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

                        <div className="p-3 bg-green-500/10 rounded-lg">
                          <div className="text-sm text-muted-foreground">Transaction ID</div>
                          <div className="font-mono text-xs break-all mt-1">
                            {record.tx || '-'}
                          </div>
                        </div>
                      </div>
                    </Card>
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
            <AlertDialogTitle className="text-destructive">⚠️ Final Confirmation</AlertDialogTitle>
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
