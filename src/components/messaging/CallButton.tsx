import { PhoneCall, PhoneOff, Video } from "lucide-react";
// ... keep existing code
    <Button
      size="sm"
      variant="ghost"
      onClick={onToggle}
      className={cn(
        "gap-1.5 h-8 rounded-full px-3 border border-border/60",
        "hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors",
      )}
      title="Start call"
    >
      <PhoneCall className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Call</span>
    </Button>
  );
};
