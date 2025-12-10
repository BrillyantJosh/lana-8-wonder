import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings, ChevronDown, CreditCard, UserCheck } from 'lucide-react';

interface AdminMenuProps {
  className?: string;
}

export const AdminMenu = ({ className }: AdminMenuProps) => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');
        
        if (!sessionData) {
          setIsAdmin(false);
          return;
        }

        const session = JSON.parse(sessionData);
        const userNostrHexId = session.nostrHexId as string | undefined;

        if (!userNostrHexId) {
          setIsAdmin(false);
          return;
        }

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

  if (!isAdmin) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <Settings className="h-4 w-4 mr-2" />
          Admin
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => navigate('/admin-buy-lana')}>
          <CreditCard className="h-4 w-4 mr-2" />
          Buy LANA Management
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/admin-allowance-upgrade')}>
          <UserCheck className="h-4 w-4 mr-2" />
          Allowance to Upgrade
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
