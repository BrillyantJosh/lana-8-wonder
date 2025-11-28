import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const BuyLanaInstructions = () => {
  const navigate = useNavigate();
  const [contactDetails, setContactDetails] = useState<string>('');

  // Fetch contact details from app_settings
  useEffect(() => {
    const fetchContactDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'contact_details')
          .single();

        if (!error && data) {
          setContactDetails(data.setting_value);
        }
      } catch (error) {
        console.error('Error fetching contact details:', error);
      }
    };

    fetchContactDetails();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-3xl">Payment Recorded</CardTitle>
            <CardDescription>
              Your slot has been reserved
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Instructions */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Your slot is reserved for 48 hours</h3>
                    <p className="text-sm text-muted-foreground">
                      During this time I need to receive your payment to my trading account 
                      and then we will transfer the funds to the one you entered.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold mb-2">Next Steps</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Return to the page</li>
                    <li>Log in with your Private Key</li>
                    <li>Follow the instructions</li>
                  </ol>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold mb-2">📱 Phone Notification</h4>
                  <p className="text-sm text-muted-foreground">
                    If you provided a phone number, we will notify you after we receive your payment and transfer the LANA to your wallet.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => navigate('/login')} 
                className="w-full"
                size="lg"
              >
                Go to Login
              </Button>
              
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="w-full"
              >
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information Card */}
        {contactDetails && (
          <Card className="mt-6 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <svg 
                    className="w-6 h-6 text-primary" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-lg mb-2">Have Questions?</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    If you have any questions, please contact:
                  </p>
                  <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 border border-border">
                    <p className="font-medium text-foreground">
                      {contactDetails}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BuyLanaInstructions;
