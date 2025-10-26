import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Wifi, Server, TrendingUp } from "lucide-react";
import { LanaSystemParams } from "@/hooks/useNostrLanaParams";

interface NostrStatusCardProps {
  params: LanaSystemParams;
}

const NostrStatusCard = ({ params }: NostrStatusCardProps) => {
  return (
    <Card className="w-full bg-card/95 backdrop-blur-sm border-primary/20 shadow-mystical">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary" />
            Connected to Nostr Network
          </CardTitle>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            relays: {params.connectedRelays}/{params.totalRelays} connected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Relays */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Active Relays:</h4>
          <div className="space-y-1">
            {params.relays.map((relay, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-foreground font-mono">{relay}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exchange Rates */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Exchange Rates:
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card/50 px-3 py-2 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">EUR</p>
              <p className="text-sm font-bold text-primary">{params.exchangeRates.EUR.toFixed(4)} per LANA</p>
            </div>
            <div className="bg-card/50 px-3 py-2 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">USD</p>
              <p className="text-sm font-bold text-accent">{params.exchangeRates.USD.toFixed(4)} per LANA</p>
            </div>
            <div className="bg-card/50 px-3 py-2 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">GBP</p>
              <p className="text-sm font-bold text-secondary">{params.exchangeRates.GBP.toFixed(4)} per LANA</p>
            </div>
          </div>
        </div>

        {/* Electrum Servers */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Server className="w-4 h-4" />
            Electrum Servers:
          </h4>
          <div className="space-y-1">
            {params.electrum.map((server, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-foreground font-mono">{server.host}:{server.port}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Info */}
        <div className="pt-2 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>Split Round: <span className="text-foreground font-semibold">{params.split}</span></p>
          <p>System Version: <span className="text-foreground font-semibold">{params.version}</span></p>
        </div>
      </CardContent>
    </Card>
  );
};

export default NostrStatusCard;
