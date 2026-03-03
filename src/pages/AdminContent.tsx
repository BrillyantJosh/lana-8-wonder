import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDomainKey } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Save, Plus, Trash2, ChevronUp, ChevronDown, FileText, Video } from 'lucide-react';
import { toast } from 'sonner';
import { AdminMenu } from '@/components/AdminMenu';

interface FaqItem {
  id: string;
  domain_key: string;
  language: string;
  question: string;
  answer: string;
  position: number;
  active: number;
}

interface WhatIsLanaContent {
  id?: string;
  domain_key?: string;
  language?: string;
  title: string;
  question1: string;
  question2: string;
  description: string;
  video_url: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'hu', name: 'Magyar' },
];

const emptyWhatIsLana: WhatIsLanaContent = {
  title: '',
  question1: '',
  question2: '',
  description: '',
  video_url: '',
};

const AdminContent = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userNostrHexId, setUserNostrHexId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  // FAQ state
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [savingFaq, setSavingFaq] = useState(false);

  // What is Lana state
  const [whatIsLana, setWhatIsLana] = useState<WhatIsLanaContent>(emptyWhatIsLana);
  const [savingVideo, setSavingVideo] = useState(false);

  const domainKey = getDomainKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(domainKey ? { 'X-Domain-Key': domainKey } : {}),
  };

  // Check admin status
  useEffect(() => {
    const init = async () => {
      try {
        const sessionData = sessionStorage.getItem('lana_session');
        if (!sessionData) { navigate('/login'); return; }

        const session = JSON.parse(sessionData);
        const hexId = session.nostrHexId as string | undefined;
        if (!hexId) { navigate('/login'); return; }

        setUserNostrHexId(hexId);

        const res = await fetch('/api/check-admin', {
          method: 'POST',
          headers,
          body: JSON.stringify({ nostr_hex_id: hexId }),
        });
        const json = await res.json();

        if (json.data?.isGlobalAdmin || json.data?.isDomainAdmin) {
          setIsAdmin(true);
        } else {
          toast.error('Not authorized');
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Fetch content when language changes
  useEffect(() => {
    if (!isAdmin) return;
    fetchContent(selectedLanguage);
  }, [isAdmin, selectedLanguage]);

  const fetchContent = async (lang: string) => {
    try {
      const [faqRes, wilRes] = await Promise.all([
        fetch(`/api/content/admin/faq?language=${lang}`, { headers }),
        fetch(`/api/content/admin/what-is-lana?language=${lang}`, { headers }),
      ]);

      const faqJson = await faqRes.json();
      const wilJson = await wilRes.json();

      setFaqItems(faqJson.data || []);
      setWhatIsLana(wilJson.data || { ...emptyWhatIsLana });
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error('Failed to load content');
    }
  };

  // ---- FAQ HANDLERS ----

  const handleAddFaq = async () => {
    try {
      const res = await fetch('/api/content/faq', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nostr_hex_id: userNostrHexId,
          language: selectedLanguage,
          question: '',
          answer: '',
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error.message); return; }
      setFaqItems([...faqItems, json.data]);
      toast.success('FAQ item added');
    } catch (error) {
      toast.error('Failed to add FAQ');
    }
  };

  const handleDeleteFaq = async (id: string) => {
    try {
      await fetch(`/api/content/faq/${id}?nostr_hex_id=${userNostrHexId}`, {
        method: 'DELETE',
        headers,
      });
      setFaqItems(faqItems.filter((f) => f.id !== id));
      toast.success('FAQ item deleted');
    } catch (error) {
      toast.error('Failed to delete FAQ');
    }
  };

  const handleMoveFaq = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === faqItems.length - 1) return;

    const newItems = [...faqItems];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    // Swap positions
    const tempPos = newItems[index].position;
    newItems[index].position = newItems[swapIndex].position;
    newItems[swapIndex].position = tempPos;
    // Swap in array
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    setFaqItems(newItems);
  };

  const handleFaqFieldChange = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...faqItems];
    updated[index] = { ...updated[index], [field]: value };
    setFaqItems(updated);
  };

  const handleFaqActiveToggle = (index: number) => {
    const updated = [...faqItems];
    updated[index] = { ...updated[index], active: updated[index].active ? 0 : 1 };
    setFaqItems(updated);
  };

  const handleSaveFaq = async () => {
    setSavingFaq(true);
    try {
      // Save each item's content + reorder positions
      const reorderItems = faqItems.map((item, idx) => ({ id: item.id, position: idx }));

      // Reorder
      await fetch('/api/content/faq-reorder', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ nostr_hex_id: userNostrHexId, items: reorderItems }),
      });

      // Update each item
      for (const item of faqItems) {
        await fetch(`/api/content/faq/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            nostr_hex_id: userNostrHexId,
            question: item.question,
            answer: item.answer,
            active: item.active,
          }),
        });
      }

      toast.success('FAQ saved successfully');
      await fetchContent(selectedLanguage);
    } catch (error) {
      toast.error('Failed to save FAQ');
    } finally {
      setSavingFaq(false);
    }
  };

  // ---- WHAT IS LANA HANDLERS ----

  const handleSaveWhatIsLana = async () => {
    setSavingVideo(true);
    try {
      const res = await fetch('/api/content/what-is-lana', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nostr_hex_id: userNostrHexId,
          language: selectedLanguage,
          title: whatIsLana.title,
          question1: whatIsLana.question1,
          question2: whatIsLana.question2,
          description: whatIsLana.description,
          video_url: whatIsLana.video_url,
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error.message); return; }
      setWhatIsLana(json.data);
      toast.success('"What is Lana?" saved successfully');
    } catch (error) {
      toast.error('Failed to save video content');
    } finally {
      setSavingVideo(false);
    }
  };

  // ---- RENDER ----

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Content Management</h1>
          </div>
          <AdminMenu />
        </div>

        {/* Domain Info */}
        {domainKey && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Domain: <strong>{domainKey}</strong>
            </p>
          </div>
        )}

        {/* Language Selector */}
        <div className="mb-6">
          <Label className="block text-sm font-medium mb-2">Language</Label>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name} ({lang.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* FAQ Management */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                FAQ Management ({LANGUAGES.find((l) => l.code === selectedLanguage)?.name})
              </CardTitle>
              <Button onClick={handleAddFaq} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {faqItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No FAQ items for this language. Click "Add" to create one.
                {selectedLanguage !== 'en' && ' If empty, the landing page will fall back to English.'}
              </p>
            ) : (
              faqItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 space-y-3 ${item.active ? 'border-border' : 'border-border/50 opacity-60'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveFaq(index, 'up')} disabled={index === 0}>
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveFaq(index, 'down')} disabled={index === faqItems.length - 1}>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!item.active}
                          onCheckedChange={() => handleFaqActiveToggle(index)}
                        />
                        <span className="text-xs text-muted-foreground">{item.active ? 'Active' : 'Hidden'}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteFaq(item.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Question</Label>
                    <Input
                      value={item.question}
                      onChange={(e) => handleFaqFieldChange(index, 'question', e.target.value)}
                      placeholder="Enter question..."
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Answer (HTML supported)</Label>
                    <Textarea
                      value={item.answer}
                      onChange={(e) => handleFaqFieldChange(index, 'answer', e.target.value)}
                      placeholder="Enter answer... (HTML links supported)"
                      rows={3}
                    />
                  </div>
                </div>
              ))
            )}

            {faqItems.length > 0 && (
              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveFaq} disabled={savingFaq}>
                  {savingFaq ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save FAQ
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What is Lana Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              "What is Lana?" Content ({LANGUAGES.find((l) => l.code === selectedLanguage)?.name})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={whatIsLana.title}
                onChange={(e) => setWhatIsLana({ ...whatIsLana, title: e.target.value })}
                placeholder="e.g. What is Lana?"
              />
            </div>

            <div>
              <Label>Question 1</Label>
              <Input
                value={whatIsLana.question1}
                onChange={(e) => setWhatIsLana({ ...whatIsLana, question1: e.target.value })}
                placeholder="e.g. What is Lana8Wonder?"
              />
            </div>

            <div>
              <Label>Question 2</Label>
              <Input
                value={whatIsLana.question2}
                onChange={(e) => setWhatIsLana({ ...whatIsLana, question2: e.target.value })}
                placeholder="e.g. How does it work?"
              />
            </div>

            <div>
              <Label>Description (HTML supported)</Label>
              <Textarea
                value={whatIsLana.description}
                onChange={(e) => setWhatIsLana({ ...whatIsLana, description: e.target.value })}
                placeholder="Enter description..."
                rows={4}
              />
            </div>

            <div>
              <Label>Video URL (YouTube embed URL)</Label>
              <Input
                value={whatIsLana.video_url}
                onChange={(e) => setWhatIsLana({ ...whatIsLana, video_url: e.target.value })}
                placeholder="e.g. https://www.youtube.com/embed/VIDEO_ID"
              />
            </div>

            {whatIsLana.video_url && (
              <div className="rounded-lg overflow-hidden border border-border">
                <div className="aspect-video max-w-sm">
                  <iframe
                    src={whatIsLana.video_url}
                    title="Preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {selectedLanguage !== 'en'
                ? 'If left empty, the landing page will fall back to English content.'
                : 'English is the default fallback language for all domains.'}
            </p>

            <div className="flex justify-end">
              <Button onClick={handleSaveWhatIsLana} disabled={savingVideo}>
                {savingVideo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Video Content
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminContent;
