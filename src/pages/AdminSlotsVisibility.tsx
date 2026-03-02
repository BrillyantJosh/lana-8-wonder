import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api as supabase, getDomainKey } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const AdminSlotsVisibility = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSlots, setShowSlots] = useState(true);

  useEffect(() => {
    const checkAdminAndFetchSetting = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');

        if (!sessionData) {
          navigate('/login');
          return;
        }

        const session = JSON.parse(sessionData);
        const userNostrHexId = session.nostrHexId as string | undefined;

        if (!userNostrHexId) {
          navigate('/login');
          return;
        }

        // Check admin via /api/check-admin
        const adminRes = await fetch('/api/check-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          },
          body: JSON.stringify({ nostr_hex_id: userNostrHexId })
        });
        const adminJson = await adminRes.json();

        if (!adminJson.data?.isGlobalAdmin && !adminJson.data?.isDomainAdmin) {
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);

        // Fetch current setting from domain config
        const configRes = await fetch('/api/domain-config', {
          headers: {
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          }
        });
        const configJson = await configRes.json();

        if (configJson.data) {
          const val = configJson.data.show_slots_on_landing_page?.toString().toLowerCase();
          setShowSlots(val !== 'no' && val !== 'false');
        }
      } catch (error) {
        console.error('Error:', error);
        toast.error('Error loading settings');
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchSetting();
  }, [navigate]);

  const handleToggle = async (checked: boolean) => {
    setSaving(true);
    try {
      const domainKey = getDomainKey();

      if (domainKey) {
        // Update via domain config API
        const sessionData = sessionStorage.getItem('lana_session');
        const session = sessionData ? JSON.parse(sessionData) : {};

        const res = await fetch('/api/domain-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Domain-Key': domainKey
          },
          body: JSON.stringify({
            nostr_hex_id: session.nostrHexId,
            show_slots_on_landing_page: checked ? 'Yes' : 'No'
          })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
      } else {
        // Fallback to app_settings for non-domain context
        const { error } = await supabase
          .from('app_settings')
          .update({ setting_value: checked ? 'Yes' : 'No' })
          .eq('setting_key', 'show_lots_on_landing_page');

        if (error) throw error;
      }

      setShowSlots(checked);
      toast.success(`Slots visibility set to ${checked ? 'Yes' : 'No'}`);
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {showSlots ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              Slots Visibility on Landing Page
            </CardTitle>
            <CardDescription>
              Control whether available slots are shown on the landing page. 
              When disabled, visitors will see the waiting list instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="show-slots" className="text-base font-medium">
                  Show Available Slots
                </Label>
                <p className="text-sm text-muted-foreground">
                  {showSlots 
                    ? 'Visitors can see and buy available slots' 
                    : 'Visitors will only see the waiting list'}
                </p>
              </div>
              <Switch
                id="show-slots"
                checked={showSlots}
                onCheckedChange={handleToggle}
                disabled={saving}
              />
            </div>

            <div className={`p-4 rounded-lg border ${showSlots ? 'border-green-500/50 bg-green-500/10' : 'border-orange-500/50 bg-orange-500/10'}`}>
              <div className="flex items-center gap-2">
                {showSlots ? (
                  <>
                    <Eye className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-600">Currently: Showing Slots</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-5 w-5 text-orange-600" />
                    <span className="font-medium text-orange-600">Currently: Showing Waiting List Only</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSlotsVisibility;
