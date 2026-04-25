/**
 * Listens for new DM call_sessions where the current user is a member of the conversation,
 * and shows an incoming-call toast with a "Join" action.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "@/hooks/useRubixAuth";
import { requestCallMicrophone, stashCallStream } from "@/lib/call-media";
import { playSound, stopSound } from "@/lib/sounds";

export const IncomingCallToast = () => {
  const { user } = useRubixAuth();
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const meId = user.id;

    const ch = supabase
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_sessions" },
        async (payload) => {
          const session = payload.new as {
            id: string;
            conversation_id: string | null;
            channel_id: string | null;
            started_by: string;
          };
          if (seen.current.has(session.id)) return;
          if (session.started_by === meId) return;
          if (!session.conversation_id) return; // only DM calls toast

          // Verify membership (RLS already filters, but be defensive)
          const { data: mem } = await supabase
            .from("conversation_members")
            .select("user_id")
            .eq("conversation_id", session.conversation_id)
            .eq("user_id", meId)
            .maybeSingle();
          if (!mem) return;

          seen.current.add(session.id);

          // Resolve caller name
          const { data: caller } = await supabase
            .from("profiles")
            .select("username, display_name")
            .eq("user_id", session.started_by)
            .maybeSingle();
          const name = caller?.display_name ?? caller?.username ?? "Someone";

          playSound("call-receive", { loop: true, volume: 0.6 });

          toast(`📞 Incoming call from ${name}`, {
            duration: 30_000,
            onDismiss: () => stopSound("call-receive"),
            onAutoClose: () => stopSound("call-receive"),
            action: {
              label: "Join",
              onClick: async () => {
                stopSound("call-receive");
                try {
                  const stream = await requestCallMicrophone();
                  stashCallStream(session.id, stream);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Microphone permission denied");
                  return;
                }
                navigate(`/messages?conv=${session.conversation_id}&join=${session.id}`);
              },
            },
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, navigate]);

  return null;
};
