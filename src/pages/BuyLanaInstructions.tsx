import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { getDomainKey } from '@/integrations/api/client';

const BuyLanaInstructions = () => {
  const navigate = useNavigate();
  const [contactDetails, setContactDetails] = useState<string>('');

  // Fetch contact details from domain config
  useEffect(() => {
    const fetchContactDetails = async () => {
      try {
        const res = await fetch('/api/domain-config', {
          headers: {
            ...(getDomainKey() ? { 'X-Domain-Key': getDomainKey()! } : {})
          }
        });
        const json = await res.json();
        if (json.data?.contact_details) {
          setContactDetails(json.data.contact_details);
        }
      } catch (error) {
        console.error('Error fetching domain config:', error);
      }
    };

    fetchContactDetails();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2 text-sm sm:text-base"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden xs:inline">Back to Home</span>
            <span className="xs:hidden">Back</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center px-4 sm:px-6">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl">Payment Recorded</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Your slot has been reserved
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
            {/* Instructions */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4 sm:pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2 text-sm sm:text-base">Your slot is reserved for 48 hours</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      During this time I need to receive your payment to my trading account 
                      and then we will transfer the funds to the one you entered.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold mb-2 text-sm sm:text-base">Next Steps</h4>
                  <ol className="text-xs sm:text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Return to the page</li>
                    <li>Log in with your Private Key</li>
                    <li>Follow the instructions</li>
                  </ol>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold mb-2 text-sm sm:text-base">📱 Phone Notification</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    If you provided a phone number, we will notify you after we receive your payment and transfer the LANA to your wallet.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => navigate('/login')} 
                className="w-full text-sm sm:text-base"
                size="lg"
              >
                Go to Login
              </Button>
              
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="w-full text-sm sm:text-base"
              >
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information Card */}
        {contactDetails && (
          <Card className="mt-4 sm:mt-6 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              <div className="text-center space-y-3 sm:space-y-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <svg 
                    className="w-5 h-5 sm:w-6 sm:h-6 text-primary" 
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
                  <h4 className="font-semibold text-base sm:text-lg mb-2">Have Questions?</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                    If you have any questions, please contact:
                  </p>
                  <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-border">
                    <p className="font-medium text-foreground text-sm sm:text-base break-words">
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
