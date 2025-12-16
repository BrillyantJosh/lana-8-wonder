import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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

        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('id')
          .eq('nostr_hex_id', userNostrHexId)
          .maybeSingle();

        if (!adminUser) {
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);

        // Fetch current setting
        const { data: setting } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'show_lots_on_landing_page')
          .maybeSingle();

        if (setting) {
          setShowSlots(setting.setting_value.toLowerCase() === 'yes');
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
      const { error } = await supabase
        .from('app_settings')
        .update({ setting_value: checked ? 'Yes' : 'No' })
        .eq('setting_key', 'show_lots_on_landing_page');

      if (error) throw error;

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
