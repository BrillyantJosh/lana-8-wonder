import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, ArrowLeft } from 'lucide-react';

const BuyLanaInstructions = () => {
  const navigate = useNavigate();

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

        {/* Additional Info */}
        <Card className="mt-6 bg-muted/50">
          <CardContent className="pt-6">
            <h4 className="font-semibold mb-2">⏰ Important</h4>
            <p className="text-sm text-muted-foreground">
              Please complete your payment within 48 hours to ensure your slot reservation. 
              After confirmation, you'll receive your Lana8Wonder trading plan and access to our exclusive community.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BuyLanaInstructions;
