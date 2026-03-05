import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Globe, Loader2, Save, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminMenu } from '@/components/AdminMenu';

interface DomainConfig {
  domain_key: string | null;
  display_name?: string;
  donation_wallet_id: string;
  contact_details: string;
  payment_link: string;
  nostr_hex_id_buying_lanas: string;
  currency_default: string;
  show_slots_on_landing_page: string;
  enable_buy_lana: number; // 0 or 1 from SQLite
  has_private_key?: number; // 0 or 1 from SQLite
}

interface DomainAdmin {
  id: string;
  domain_key: string;
  nostr_hex_id: string;
  description: string | null;
  created_at: string;
}

const AdminDomainSettings = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DomainConfig | null>(null);
  const [domainAdmins, setDomainAdmins] = useState<DomainAdmin[]>([]);
  const [newAdminHexId, setNewAdminHexId] = useState('');
  const [newAdminDescription, setNewAdminDescription] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);
  const [userNostrHexId, setUserNostrHexId] = useState<string>('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [privateKeyModified, setPrivateKeyModified] = useState(false);

  const domainKey = getDomainKey();

  // Check admin status and load config
  useEffect(() => {
    const init = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');

        if (!sessionData) {
          navigate('/login');
          return;
        }

        const session = JSON.parse(sessionData);
        const hexId = session.nostrHexId as string | undefined;

        if (!hexId) {
          navigate('/login');
          return;
        }

        setUserNostrHexId(hexId);

        // Check admin
        const adminRes = await fetch('/api/check-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(domainKey ? { 'X-Domain-Key': domainKey } : {})
          },
          body: JSON.stringify({ nostr_hex_id: hexId })
        });
        const adminJson = await adminRes.json();

        const globalAdmin = adminJson.data?.isGlobalAdmin || false;
        const domAdmin = adminJson.data?.isDomainAdmin || false;

        if (!globalAdmin && !domAdmin) {
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);
        setIsGlobalAdmin(globalAdmin);

        // Fetch domain config
        const configRes = await fetch('/api/domain-config', {
          headers: {
            ...(domainKey ? { 'X-Domain-Key': domainKey } : {})
          }
        });
        const configJson = await configRes.json();

        if (configJson.data) {
          setConfig(configJson.data);
        }

        // Fetch domain admins if domain key exists
        if (domainKey) {
          const { data: admins } = await supabase
            .from('domain_admins')
            .select('*')
            .eq('domain_key', domainKey);

          if (admins) {
            setDomainAdmins(admins as DomainAdmin[]);
          }
        }
      } catch (error) {
        console.error('Error initializing:', error);
        toast.error('Error loading domain settings');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [navigate, domainKey]);

  // Save domain config
  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      if (domainKey) {
        // Save via PUT /api/domain-config
        const res = await fetch('/api/domain-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Domain-Key': domainKey
          },
          body: JSON.stringify({
            nostr_hex_id: userNostrHexId,
            donation_wallet_id: config.donation_wallet_id,
            ...(privateKeyModified && privateKeyInput.trim() ? { donation_wallet_private_key: privateKeyInput.trim() } : {}),
            contact_details: config.contact_details,
            payment_link: config.payment_link,
            nostr_hex_id_buying_lanas: config.nostr_hex_id_buying_lanas,
            currency_default: config.currency_default,
            show_slots_on_landing_page: config.show_slots_on_landing_page,
            enable_buy_lana: config.enable_buy_lana
          })
        });
        const json = await res.json();

        if (json.error) {
          throw new Error(json.error.message);
        }

        if (json.data) {
          setConfig(json.data);
        }

        // Reset private key input state after save
        setPrivateKeyInput('');
        setPrivateKeyModified(false);

        toast.success('Domain settings saved');
      } else {
        toast.error('No domain context. Settings can only be saved for a specific domain.');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Add domain admin
  const handleAddAdmin = async () => {
    if (!newAdminHexId.trim() || !domainKey) return;

    setAddingAdmin(true);
    try {
      const { error } = await supabase
        .from('domain_admins')
        .insert({
          domain_key: domainKey,
          nostr_hex_id: newAdminHexId.trim(),
          description: newAdminDescription.trim() || null
        });

      if (error) throw error;

      toast.success('Domain admin added');
      setNewAdminHexId('');
      setNewAdminDescription('');

      // Refresh admins list
      const { data: admins } = await supabase
        .from('domain_admins')
        .select('*')
        .eq('domain_key', domainKey);

      if (admins) {
        setDomainAdmins(admins as DomainAdmin[]);
      }
    } catch (error) {
      console.error('Error adding admin:', error);
      toast.error('Failed to add domain admin');
    } finally {
      setAddingAdmin(false);
    }
  };

  // Remove domain admin
  const handleRemoveAdmin = async (adminId: string) => {
    if (!domainKey) return;

    setRemovingAdminId(adminId);
    try {
      const { error } = await supabase
        .from('domain_admins')
        .delete()
        .eq('id', adminId);

      if (error) throw error;

      toast.success('Domain admin removed');
      setDomainAdmins(prev => prev.filter(a => a.id !== adminId));
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error('Failed to remove domain admin');
    } finally {
      setRemovingAdminId(null);
    }
  };

  // Update config field
  const updateField = (field: keyof DomainConfig, value: string) => {
    setConfig(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold">Domain Settings</h1>
            </div>
          </div>
          <AdminMenu />
        </div>

        {/* Domain Info */}
        <Card>
          <CardHeader>
            <CardTitle>Domain Configuration</CardTitle>
            <CardDescription>
              {domainKey
                ? `Settings for domain: ${domainKey}`
                : 'No domain context detected. These are global fallback settings (read-only).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {config && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="donation_wallet_id">Donation Wallet ID</Label>
                  <Input
                    id="donation_wallet_id"
                    value={config.donation_wallet_id || ''}
                    onChange={(e) => updateField('donation_wallet_id', e.target.value)}
                    placeholder="Enter donation wallet ID..."
                    disabled={!domainKey}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="donation_wallet_private_key">
                    Donation Wallet Private Key <span className="text-destructive">*</span>
                  </Label>
                  {/* Status indicator */}
                  {config.has_private_key ? (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      <span>Private key is set</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-destructive text-sm">
                      <XCircle className="h-4 w-4" />
                      <span>No private key — required for automated payments!</span>
                    </div>
                  )}
                  <Input
                    id="donation_wallet_private_key"
                    type="password"
                    value={privateKeyInput}
                    onChange={(e) => {
                      setPrivateKeyInput(e.target.value);
                      setPrivateKeyModified(true);
                    }}
                    placeholder={config.has_private_key ? 'Enter new key to replace existing...' : 'Enter private key (WIF format)...'}
                    disabled={!domainKey}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {config.has_private_key
                      ? 'Leave empty to keep the current key. Only enter a value to replace it.'
                      : 'Required for automated LANA payments. Enter the WIF private key.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_details">Contact Details</Label>
                  <Input
                    id="contact_details"
                    value={config.contact_details || ''}
                    onChange={(e) => updateField('contact_details', e.target.value)}
                    placeholder="Enter contact details..."
                    disabled={!domainKey}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_link">Payment Link</Label>
                  <Input
                    id="payment_link"
                    value={config.payment_link || ''}
                    onChange={(e) => updateField('payment_link', e.target.value)}
                    placeholder="Enter payment link URL..."
                    disabled={!domainKey}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currency_default">Default Currency</Label>
                  <Input
                    id="currency_default"
                    value={config.currency_default || ''}
                    onChange={(e) => updateField('currency_default', e.target.value)}
                    placeholder="EUR, USD, GBP..."
                    disabled={!domainKey}
                    className="max-w-[200px]"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable_buy_lana" className="text-base font-medium">Enable Buy LANA</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow users to buy LANA through this domain. When disabled, users can only create plans (deposit only).
                    </p>
                  </div>
                  <button
                    id="enable_buy_lana"
                    role="switch"
                    aria-checked={config.enable_buy_lana === 1}
                    disabled={!domainKey}
                    onClick={() => updateField('enable_buy_lana', config.enable_buy_lana === 1 ? 0 : 1)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config.enable_buy_lana === 1 ? 'bg-primary' : 'bg-gray-300'
                    } ${!domainKey ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enable_buy_lana === 1 ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nostr_hex_id_buying_lanas">Nostr Hex ID (Buying LANAs)</Label>
                  <Input
                    id="nostr_hex_id_buying_lanas"
                    value={config.nostr_hex_id_buying_lanas || ''}
                    onChange={(e) => updateField('nostr_hex_id_buying_lanas', e.target.value)}
                    placeholder="Enter nostr hex ID..."
                    disabled={!domainKey}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    The Nostr public key (hex) used for KIND 0 profile lookup of the LANA buyer/seller.
                  </p>
                </div>

                {domainKey && (
                  <div className="pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full sm:w-auto"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Settings
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {!domainKey && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      To edit domain settings, access this page from a domain-specific URL (e.g., uk.lana8wonder.com).
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Domain Admins Section */}
        {domainKey && (
          <Card>
            <CardHeader>
              <CardTitle>Domain Admins</CardTitle>
              <CardDescription>
                Manage administrators for the "{domainKey}" domain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current admins list */}
              {domainAdmins.length > 0 ? (
                <div className="space-y-2">
                  {domainAdmins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs break-all">{admin.nostr_hex_id}</p>
                        {admin.description && (
                          <p className="text-sm text-muted-foreground mt-1">{admin.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Added: {new Date(admin.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {(isGlobalAdmin || admin.nostr_hex_id !== userNostrHexId) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-2 flex-shrink-0"
                          onClick={() => handleRemoveAdmin(admin.id)}
                          disabled={removingAdminId === admin.id}
                        >
                          {removingAdminId === admin.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No domain admins configured for this domain.
                </p>
              )}

              {/* Add new admin */}
              <div className="border-t border-border pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Add Domain Admin</h4>
                <div className="space-y-2">
                  <Label htmlFor="new-admin-hex">Nostr Hex ID</Label>
                  <Input
                    id="new-admin-hex"
                    value={newAdminHexId}
                    onChange={(e) => setNewAdminHexId(e.target.value)}
                    placeholder="Enter nostr hex ID..."
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-admin-desc">Description (optional)</Label>
                  <Input
                    id="new-admin-desc"
                    value={newAdminDescription}
                    onChange={(e) => setNewAdminDescription(e.target.value)}
                    placeholder="e.g., UK Regional Admin"
                  />
                </div>
                <Button
                  onClick={handleAddAdmin}
                  disabled={!newAdminHexId.trim() || addingAdmin}
                  className="w-full sm:w-auto"
                >
                  {addingAdmin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Admin
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminDomainSettings;
