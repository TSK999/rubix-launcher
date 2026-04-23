import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  inCall: boolean;
  onToggle: () => void;
};

export const CallButton = ({ inCall, onToggle }: Props) => (
  <Button
    size="sm"
    variant={inCall ? "destructive" : "secondary"}
    onClick={onToggle}
    className="gap-2"
  >
    {inCall ? <PhoneOff className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
    {inCall ? "Leave call" : "Call"}
  </Button>
);
