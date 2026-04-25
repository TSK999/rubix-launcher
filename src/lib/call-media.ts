const pendingCallStreams = new Map<string, MediaStream>();

export const requestCallMicrophone = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this browser");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
      sampleSize: 16,
    } as MediaTrackConstraints,
    video: false,
  });
};

export const stashCallStream = (callId: string, stream: MediaStream) => {
  const existing = pendingCallStreams.get(callId);
  if (existing && existing !== stream) stopCallStream(existing);
  pendingCallStreams.set(callId, stream);
};

export const consumeCallStream = (callId: string): MediaStream | null => {
  const stream = pendingCallStreams.get(callId) ?? null;
  if (stream) pendingCallStreams.delete(callId);
  return stream;
};

export const stopCallStream = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => track.stop());
};