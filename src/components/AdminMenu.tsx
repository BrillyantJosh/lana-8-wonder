import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDomainKey } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Settings, ChevronDown, CreditCard, Globe } from 'lucide-react';

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
        <DropdownMenuItem onClick={() => navigate('/admin-domain-settings')}>
          <Globe className="h-4 w-4 mr-2" />
          Domain Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
