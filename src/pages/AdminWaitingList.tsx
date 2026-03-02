import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Download, Trash2, Users } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';
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

interface WaitingListRecord {
  id: string;
  created_at: string;
  email: string;
  phone_number: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  has_wallet: boolean;
  wallet_id: string | null;
  nostr_hex_id: string | null;
  status: string;
  notified_at: string | null;
}

const AdminWaitingList = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [records, setRecords] = useState<WaitingListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Fetch records
  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('waiting_list')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error('Failed to load waiting list');
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

  // Download CSV
  const handleDownloadCSV = () => {
    if (records.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Date',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Address',
      'Has Wallet',
      'Wallet ID',
      'Nostr Hex ID',
      'Status',
      'Notified At'
    ];

    const csvContent = [
      headers.join(','),
      ...records.map(record => [
        new Date(record.created_at).toISOString(),
        `"${record.first_name || ''}"`,
        `"${record.last_name || ''}"`,
        `"${record.email}"`,
        `"${record.phone_number}"`,
        `"${record.address || ''}"`,
        record.has_wallet ? 'Yes' : 'No',
        `"${record.wallet_id || ''}"`,
        `"${record.nostr_hex_id || ''}"`,
        `"${record.status}"`,
        record.notified_at ? new Date(record.notified_at).toISOString() : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `waiting_list_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('CSV downloaded successfully');
  };

  // Delete record
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('waiting_list')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Record deleted successfully');
      fetchRecords();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold">Waiting List</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleDownloadCSV} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <AdminMenu />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{records.length}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">
              {records.filter(r => r.status === 'pending').length}
            </div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {records.filter(r => r.has_wallet).length}
            </div>
            <div className="text-sm text-muted-foreground">With Wallet</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-600">
              {records.filter(r => r.notified_at).length}
            </div>
            <div className="text-sm text-muted-foreground">Notified</div>
          </Card>
        </div>

        {/* Table */}
        <Card className="p-4 md:p-6">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No records in waiting list
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(record.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {record.first_name || record.last_name 
                          ? `${record.first_name || ''} ${record.last_name || ''}`.trim()
                          : '-'
                        }
                      </TableCell>
                      <TableCell>{record.email}</TableCell>
                      <TableCell>{record.phone_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={record.address || ''}>
                        {record.address || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${record.has_wallet ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {record.has_wallet ? 'Yes' : 'No'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          record.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                          record.status === 'notified' ? 'bg-blue-100 text-blue-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {record.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmDeleteId(record.id)}
                          disabled={deletingId === record.id}
                        >
                          {deletingId === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {records.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No records in waiting list
              </div>
            ) : (
              records.map((record) => (
                <Card key={record.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          {record.first_name || record.last_name 
                            ? `${record.first_name || ''} ${record.last_name || ''}`.trim()
                            : 'No Name'
                          }
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(record.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(record.id)}
                        disabled={deletingId === record.id}
                      >
                        {deletingId === record.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    <div className="space-y-1 text-sm">
                      <div><strong>Email:</strong> {record.email}</div>
                      <div><strong>Phone:</strong> {record.phone_number}</div>
                      {record.address && <div><strong>Address:</strong> {record.address}</div>}
                    </div>

                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${record.has_wallet ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {record.has_wallet ? 'Has Wallet' : 'No Wallet'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        record.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                        record.status === 'notified' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {record.status}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this waiting list entry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AdminWaitingList;
