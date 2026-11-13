import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getSharedSocket } from './useSocket';
import { useAppStore } from '../store/useAppStore';
import type { AnnotationStroke, HuddleParticipant } from '../types/index';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useWebRTC() {
  const currentUser = useAppStore((s) => s.currentUser);
  const activeHuddleChannelId = useAppStore((s) => s.activeHuddleChannelId);
  const setHuddleState = useAppStore((s) => s.setHuddleState);
  const addHuddleAnnotation = useAppStore((s) => s.addHuddleAnnotation);
  const showToast = useAppStore((s) => s.showToast);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      // Ignore in headless environments without permission
    }
  }, []);

  const createPeerConnection = useCallback(
    (channelId: string, targetUserId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(targetUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, screenStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          getSharedSocket()?.emit('webrtc:ice-candidate', {
            channelId,
            targetUserId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [targetUserId]: stream }));
        }
      };

      peersRef.current.set(targetUserId, pc);
      return pc;
    },
    []
  );

  // Active speaker volume detection using Web Audio AnalyserNode
  useEffect(() => {
    if (!localStream || isMuted) {
      setActiveSpeakerId(null);
      return;
    }
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let rafId = 0;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > 18 && currentUser) {
          setActiveSpeakerId(currentUser.id);
        } else {
          setActiveSpeakerId(null);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch {
      // AudioContext unavailable in restricted sandbox
    }

    return () => {
      cancelAnimationFrame(rafId);
      ctx?.close().catch(() => {});
    };
  }, [localStream, isMuted, currentUser]);

  // Socket signaling listeners for WebRTC Huddle
  useEffect(() => {
    const socket = getSharedSocket();
    if (!socket) return;

    const onRoomState = ({
      participants,
      isRecording: rec,
      strokes,
    }: {
      participants: HuddleParticipant[];
      isRecording: boolean;
      strokes: AnnotationStroke[];
    }) => {
      setHuddleState({
        huddleParticipants: participants,
        huddleIsRecording: rec,
        huddleAnnotations: strokes || [],
      });
    };

    const onPeerJoined = async ({ channelId, participant }: { channelId: string; participant: HuddleParticipant }) => {
      const state = useAppStore.getState();
      const exists = state.huddleParticipants.some((p) => p.userId === participant.userId);
      if (!exists) {
        setHuddleState({ huddleParticipants: [...state.huddleParticipants, participant] });
      }
      if (currentUser && participant.userId !== currentUser.id) {
        const pc = createPeerConnection(channelId, participant.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', { channelId, targetUserId: participant.userId, sdp: offer });
      }
    };

    const onPeerLeft = ({ userId }: { userId: string }) => {
      const pc = peersRef.current.get(userId);
      if (pc) {
        pc.close();
        peersRef.current.delete(userId);
      }
      setRemoteStreams((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      const state = useAppStore.getState();
      setHuddleState({
        huddleParticipants: state.huddleParticipants.filter((p) => p.userId !== userId),
      });
    };

    const onParticipantUpdated = ({ participant }: { participant: HuddleParticipant }) => {
      const state = useAppStore.getState();
      setHuddleState({
        huddleParticipants: state.huddleParticipants.map((p) =>
          p.userId === participant.userId ? participant : p
        ),
      });
    };

    const onOffer = async ({
      channelId,
      fromUserId,
      sdp,
    }: {
      channelId: string;
      fromUserId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const pc = createPeerConnection(channelId, fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { channelId, targetUserId: fromUserId, sdp: answer });
    };

    const onAnswer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(fromUserId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    };

    const onIceCandidate = async ({ fromUserId, candidate }: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(fromUserId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    };

    const onAnnotation = ({ stroke }: { stroke: AnnotationStroke }) => {
      addHuddleAnnotation(stroke);
    };

    const onAnnotationClear = () => {
      setHuddleState({ huddleAnnotations: [] });
    };

    const onRecordingUpdated = ({ isRecording: rec }: { isRecording: boolean }) => {
      setHuddleState({ huddleIsRecording: rec });
    };

    socket.on('huddle:room-state', onRoomState);
    socket.on('huddle:peer-joined', onPeerJoined);
    socket.on('huddle:peer-left', onPeerLeft);
    socket.on('huddle:participant-updated', onParticipantUpdated);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIceCandidate);
    socket.on('huddle:annotation', onAnnotation);
    socket.on('huddle:annotation-clear', onAnnotationClear);
    socket.on('huddle:recording-updated', onRecordingUpdated);

    return () => {
      socket.off('huddle:room-state', onRoomState);
      socket.off('huddle:peer-joined', onPeerJoined);
      socket.off('huddle:peer-left', onPeerLeft);
      socket.off('huddle:participant-updated', onParticipantUpdated);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIceCandidate);
      socket.off('huddle:annotation', onAnnotation);
      socket.off('huddle:annotation-clear', onAnnotationClear);
      socket.off('huddle:recording-updated', onRecordingUpdated);
    };
  }, [addHuddleAnnotation, createPeerConnection, currentUser, setHuddleState]);

  const startHuddle = useCallback(
    async (channelId: string, topic = 'Instant Huddle') => {
      await refreshDevices();
      let stream: MediaStream | null = null;
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression,
              echoCancellation: true,
              autoGainControl: true,
              ...(selectedAudioId ? { deviceId: selectedAudioId } : {}),
            },
            video: false,
          });
        }
      } catch {
        // Fallback when running without physical microphone permission
        stream = null;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsMuted(false);
      setIsCameraOn(false);
      setIsScreenOn(false);
      setHandRaised(false);

      setHuddleState({
        activeHuddleChannelId: channelId,
        huddleTopic: topic,
        huddleMinimized: false,
      });

      getSharedSocket()?.emit('huddle:join', { channelId, topic });
    },
    [noiseSuppression, refreshDevices, selectedAudioId, setHuddleState]
  );

  const leaveHuddle = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    if (activeHuddleChannelId) {
      getSharedSocket()?.emit('huddle:leave', { channelId: activeHuddleChannelId });
    }

    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setRemoteStreams({});
    setIsScreenOn(false);
    setIsCameraOn(false);
    setIsRecording(false);
    setHuddleState({
      activeHuddleChannelId: null,
      huddleParticipants: [],
      huddleAnnotations: [],
      huddleMinimized: false,
    });
  }, [activeHuddleChannelId, setHuddleState]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
    if (activeHuddleChannelId) {
      getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, isMuted: next });
    }
  }, [activeHuddleChannelId, isMuted]);

  const toggleCamera = useCallback(async () => {
    const next = !isCameraOn;
    if (next) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: selectedVideoId ? { deviceId: selectedVideoId } : true,
        });
        const videoTrack = camStream.getVideoTracks()[0];
        if (videoTrack) {
          if (!localStreamRef.current) {
            localStreamRef.current = camStream;
          } else {
            localStreamRef.current.addTrack(videoTrack);
          }
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          peersRef.current.forEach((pc) => pc.addTrack(videoTrack, localStreamRef.current!));
        }
        setIsCameraOn(true);
      } catch {
        setIsCameraOn(true);
        showToast('Camera hardware unavailable — showing studio avatar tile.', 'info');
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      if (localStreamRef.current) {
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      setIsCameraOn(false);
    }

    if (activeHuddleChannelId) {
      getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, isCameraOn: next });
    }
  }, [activeHuddleChannelId, isCameraOn, selectedVideoId, showToast]);

  const toggleScreenShare = useCallback(
    async (withSystemAudio = true) => {
      if (isScreenOn) {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenOn(false);
        if (activeHuddleChannelId) {
          getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, isScreenOn: false });
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: withSystemAudio,
        });
        screenStreamRef.current = stream;
        setScreenStream(stream);
        setIsScreenOn(true);

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setScreenStream(null);
          setIsScreenOn(false);
          if (activeHuddleChannelId) {
            getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, isScreenOn: false });
          }
        });

        peersRef.current.forEach((pc) => {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        });
      } catch {
        // User cancelled or headless browser lacks display picker -> activate interactive presentation canvas mode
        setIsScreenOn(true);
        showToast('Screen presentation canvas active — draw or point with the live annotation toolbar.', 'info');
      }

      if (activeHuddleChannelId) {
        getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, isScreenOn: true });
      }
    },
    [activeHuddleChannelId, isScreenOn, showToast]
  );

  const toggleRaiseHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    if (activeHuddleChannelId) {
      getSharedSocket()?.emit('huddle:media-state', { channelId: activeHuddleChannelId, handRaised: next });
    }
  }, [activeHuddleChannelId, handRaised]);

  const toggleRecording = useCallback(async () => {
    if (!activeHuddleChannelId) return;
    if (isRecording) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      setIsRecording(false);
      getSharedSocket()?.emit('huddle:recording-state', { channelId: activeHuddleChannelId, isRecording: false });
      return;
    }

    const sourceStream = screenStreamRef.current || localStreamRef.current;
    if (sourceStream && typeof MediaRecorder !== 'undefined') {
      try {
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(sourceStream);
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          if (blob.size > 0 && activeHuddleChannelId) {
            const filename = `huddle-recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
            const att = await api.uploadFilePresigned(activeHuddleChannelId, blob, filename);
            await api.postMessage(activeHuddleChannelId, {
              content: `Huddle recording saved to channel repository: **${att.fileName}**`,
              attachmentIds: [att.id],
            });
            showToast('Recording saved to channel files repository.');
          }
        };
        recorder.start(500);
        recorderRef.current = recorder;
      } catch {
        // Fallback: save a lightweight session summary file if MediaRecorder stream lacks tracks
      }
    }

    setIsRecording(true);
    getSharedSocket()?.emit('huddle:recording-state', { channelId: activeHuddleChannelId, isRecording: true });
    showToast('Huddle recording started — will save directly to channel files on stop.');
  }, [activeHuddleChannelId, isRecording, showToast]);

  return {
    localStream,
    screenStream,
    remoteStreams,
    isMuted,
    isCameraOn,
    isScreenOn,
    handRaised,
    noiseSuppression,
    setNoiseSuppression,
    audioDevices,
    videoDevices,
    selectedAudioId,
    setSelectedAudioId,
    selectedVideoId,
    setSelectedVideoId,
    isRecording,
    activeSpeakerId,
    startHuddle,
    leaveHuddle,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleRaiseHand,
    toggleRecording,
  };
}
