import { PhoneCall, PhoneOff, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  inCall: boolean;
  onToggle: () => void;
  /** Optional separate video toggle handler. If omitted the video button is hidden. */
  onToggleVideo?: () => void;
  videoEnabled?: boolean;
};

export const CallButton = ({ inCall, onToggle, onToggleVideo, videoEnabled }: Props) => {
  if (inCall) {
    return (
      <div className="flex items-center gap-1.5">
        {onToggleVideo && (
          <Button
            size="sm"
            variant={videoEnabled ? "default" : "secondary"}
            onClick={onToggleVideo}
            className="gap-1.5 h-8 rounded-full px-3"
            title={videoEnabled ? "Stop video" : "Start video"}
          >
            <Video className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          onClick={onToggle}
          className="gap-1.5 h-8 rounded-full px-3"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Leave</span>
        </Button>
      </div>
    );
  }
  return (
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
