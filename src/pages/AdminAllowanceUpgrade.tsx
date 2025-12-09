import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SimplePool, Filter } from 'nostr-tools';
import { supabase } from '@/integrations/supabase/client';
import { useNostrLanaParams } from '@/hooks/useNostrLanaParams';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Search, User, CheckCircle, XCircle } from 'lucide-react';
import { AdminMenu } from '@/components/AdminMenu';

interface AllowedUser {
  nostrHexId: string;
  name?: string;
  displayName?: string;
  picture?: string;
}

interface NostrProfile {
  nostrHexId: string;
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

const AdminAllowanceUpgrade = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NostrProfile[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [allowedUsers, setAllowedUsers] = useState<Set<string>>(new Set());
  const [allowedUsersList, setAllowedUsersList] = useState<AllowedUser[]>([]);
  const [loadingAllowed, setLoadingAllowed] = useState(false);
  const { params, loading: paramsLoading } = useNostrLanaParams();

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
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, []);

  // Fetch allowed users from database and their Nostr profiles
  const fetchAllowedUsers = async () => {
    setLoadingAllowed(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('nostr_hex_id')
        .eq('allowed_upgrade', true);
      
      if (data) {
        setAllowedUsers(new Set(data.map(p => p.nostr_hex_id)));
        
        // Fetch Nostr profiles for allowed users
        if (params?.relays && params.relays.length > 0 && data.length > 0) {
          const pool = new SimplePool();
          const hexIds = data.map(p => p.nostr_hex_id);
          
          try {
            const filter: Filter = {
              kinds: [0],
              authors: hexIds
            };
            
            const events = await pool.querySync(params.relays, filter);
            
            const usersList: AllowedUser[] = hexIds.map(hexId => {
              const event = events.find(e => e.pubkey === hexId);
              if (event) {
                try {
                  const content = JSON.parse(event.content);
                  return {
                    nostrHexId: hexId,
                    name: content.name,
                    displayName: content.display_name,
                    picture: content.picture
                  };
                } catch {
                  return { nostrHexId: hexId };
                }
              }
              return { nostrHexId: hexId };
            });
            
            setAllowedUsersList(usersList);
            pool.close(params.relays);
          } catch (error) {
            console.error('Error fetching Nostr profiles:', error);
            // Still set the list with just hex IDs
            setAllowedUsersList(hexIds.map(hexId => ({ nostrHexId: hexId })));
          }
        } else {
          setAllowedUsersList(data.map(p => ({ nostrHexId: p.nostr_hex_id })));
        }
      }
    } finally {
      setLoadingAllowed(false);
    }
  };

  useEffect(() => {
    if (isAdmin === true && params?.relays) {
      fetchAllowedUsers();
    } else if (isAdmin === false) {
      navigate('/');
    }
  }, [isAdmin, navigate, params?.relays]);

  // Search for users on Nostr relays
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    if (!params?.relays || params.relays.length === 0) {
      toast.error('No relays available from system parameters');
      return;
    }

    setSearching(true);
    setSearchResults([]);

    const pool = new SimplePool();
    const relayUrls = params.relays;

    try {
      // Search for KIND 0 profiles
      const filter: Filter = {
        kinds: [0],
        limit: 100
      };

      const events = await pool.querySync(relayUrls, filter);
      
      // Filter results based on search query
      const results: NostrProfile[] = [];
      const searchLower = searchQuery.toLowerCase();

      for (const event of events) {
        try {
          const content = JSON.parse(event.content);
          const name = content.name || '';
          const displayName = content.display_name || '';
          const nip05 = content.nip05 || '';
          const about = content.about || '';

          // Check if any field matches the search query
          if (
            name.toLowerCase().includes(searchLower) ||
            displayName.toLowerCase().includes(searchLower) ||
            nip05.toLowerCase().includes(searchLower) ||
            about.toLowerCase().includes(searchLower) ||
            event.pubkey.toLowerCase().includes(searchLower)
          ) {
            results.push({
              nostrHexId: event.pubkey,
              name: content.name,
              display_name: content.display_name,
              picture: content.picture,
              about: content.about,
              nip05: content.nip05
            });
          }
        } catch (e) {
          // Skip invalid JSON content
        }
      }

      setSearchResults(results);

      if (results.length === 0) {
        toast.info('No users found matching your search');
      } else {
        toast.success(`Found ${results.length} user(s)`);
      }
    } catch (error) {
      console.error('Error searching Nostr:', error);
      toast.error('Failed to search Nostr relays');
    } finally {
      setSearching(false);
      pool.close(relayUrls);
    }
  };

  // Toggle allowed_upgrade for a user
  const handleToggleAllowance = async (nostrHexId: string, currentlyAllowed: boolean) => {
    setProcessingId(nostrHexId);

    try {
      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('nostr_hex_id', nostrHexId)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({ allowed_upgrade: !currentlyAllowed })
          .eq('nostr_hex_id', nostrHexId);

        if (error) throw error;
      } else {
        // Create new profile with allowed_upgrade = true
        const { error } = await supabase
          .from('profiles')
          .insert({ 
            nostr_hex_id: nostrHexId, 
            allowed_upgrade: true 
          });

        if (error) throw error;
      }

      // Update local state
      setAllowedUsers(prev => {
        const newSet = new Set(prev);
        if (currentlyAllowed) {
          newSet.delete(nostrHexId);
        } else {
          newSet.add(nostrHexId);
        }
        return newSet;
      });

      // Update allowed users list
      if (currentlyAllowed) {
        setAllowedUsersList(prev => prev.filter(u => u.nostrHexId !== nostrHexId));
      } else {
        // Find profile from search results to add to list
        const profile = searchResults.find(p => p.nostrHexId === nostrHexId);
        if (profile) {
          setAllowedUsersList(prev => [...prev, {
            nostrHexId: profile.nostrHexId,
            name: profile.name,
            displayName: profile.display_name,
            picture: profile.picture
          }]);
        }
      }

      toast.success(currentlyAllowed ? 'Upgrade permission removed' : 'Upgrade permission granted');
    } catch (error) {
      console.error('Error updating allowance:', error);
      toast.error('Failed to update permission');
    } finally {
      setProcessingId(null);
    }
  };

  if (isAdmin === null || loading || paramsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Allowance to Upgrade</h1>
          </div>
          <AdminMenu />
        </div>

        {/* Allowed Users Section */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Users with Upgrade Permission</h2>
              <span className="text-sm text-muted-foreground">
                {allowedUsersList.length} user(s)
              </span>
            </div>
            
            {loadingAllowed ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allowedUsersList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No users have upgrade permission yet
              </p>
            ) : (
              <div className="space-y-2">
                {allowedUsersList.map((user) => {
                  const isProcessing = processingId === user.nostrHexId;

                  return (
                    <div
                      key={user.nostrHexId}
                      className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                    >
                      {/* Avatar */}
                      <div className="shrink-0">
                        {user.picture ? (
                          <img
                            src={user.picture}
                            alt={user.name || 'User'}
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {user.displayName || user.name || 'Unknown'}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground truncate">
                          {user.nostrHexId.slice(0, 12)}...{user.nostrHexId.slice(-8)}
                        </div>
                      </div>

                      {/* Remove Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleAllowance(user.nostrHexId, true)}
                        disabled={isProcessing}
                        className="shrink-0"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Remove'
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Search Section */}
        <Card className="p-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Search Users on Nostr</h2>
            <p className="text-sm text-muted-foreground">
              Search for users by name, display name, nip05, or nostr hex ID
            </p>
            
            <div className="flex gap-2">
              <Input
                placeholder="Enter name, nip05, or hex ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button 
                onClick={handleSearch} 
                disabled={searching || !params?.relays}
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {params?.relays && params.relays.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Connected to {params.relays.length} relay(s): {params.relays.slice(0, 2).join(', ')}
                {params.relays.length > 2 && ` +${params.relays.length - 2} more`}
              </p>
            )}
          </div>
        </Card>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Search Results</h2>
            <div className="space-y-3">
              {searchResults.map((profile) => {
                const isAllowed = allowedUsers.has(profile.nostrHexId);
                const isProcessing = processingId === profile.nostrHexId;

                return (
                  <div
                    key={profile.nostrHexId}
                    className="flex items-center gap-4 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="shrink-0">
                      {profile.picture ? (
                        <img
                          src={profile.picture}
                          alt={profile.name || 'User'}
                          className="w-12 h-12 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                            (e.target as HTMLImageElement).className = 'hidden';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {profile.display_name || profile.name || 'Unknown'}
                      </div>
                      {profile.nip05 && (
                        <div className="text-sm text-muted-foreground truncate">
                          {profile.nip05}
                        </div>
                      )}
                      <div className="text-xs font-mono text-muted-foreground truncate">
                        {profile.nostrHexId.slice(0, 16)}...{profile.nostrHexId.slice(-8)}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isAllowed ? (
                        <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                          <CheckCircle className="h-4 w-4" />
                          Allowed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <XCircle className="h-4 w-4" />
                          Not Allowed
                        </span>
                      )}
                    </div>

                    {/* Action Button */}
                    <Button
                      variant={isAllowed ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleToggleAllowance(profile.nostrHexId, isAllowed)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isAllowed ? (
                        'Remove'
                      ) : (
                        'Allow'
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminAllowanceUpgrade;
