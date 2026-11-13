import { useEffect, useRef, useState } from 'react';
import {
  Disc,
  Eraser,
  Hand,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PenTool,
  PhoneOff,
  PictureInPicture2,
  Send,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { getSharedSocket } from '../hooks/useSocket';
import { useAppStore } from '../store/useAppStore';
import { UserAvatar } from './UserAvatar';
import type { AnnotationStroke, Message } from '../types/index';

interface HuddleOverlayProps {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenOn: boolean;
  handRaised: boolean;
  noiseSuppression: boolean;
  setNoiseSuppression: (val: boolean) => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioId: string;
  setSelectedAudioId: (id: string) => void;
  selectedVideoId: string;
  setSelectedVideoId: (id: string) => void;
  isRecording: boolean;
  activeSpeakerId: string | null;
  messages: Message[];
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: (withAudio: boolean) => void;
  onToggleRaiseHand: () => void;
  onToggleRecording: () => void;
  onLeaveHuddle: () => void;
  onSendInCallChat: (text: string) => Promise<void>;
}

function StreamVideo({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover rounded-xl" />;
}

export function HuddleOverlay({
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
  messages,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleRaiseHand,
  onToggleRecording,
  onLeaveHuddle,
  onSendInCallChat,
}: HuddleOverlayProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const activeHuddleChannelId = useAppStore((s) => s.activeHuddleChannelId);
  const huddleTopic = useAppStore((s) => s.huddleTopic);
  const huddleMinimized = useAppStore((s) => s.huddleMinimized);
  const huddleParticipants = useAppStore((s) => s.huddleParticipants);
  const huddleAnnotations = useAppStore((s) => s.huddleAnnotations);
  const setHuddleState = useAppStore((s) => s.setHuddleState);
  const addHuddleAnnotation = useAppStore((s) => s.addHuddleAnnotation);
  const locale = useAppStore((s) => s.locale);
  const isFa = locale === 'fa';

  const [annotateMode, setAnnotateMode] = useState<'none' | 'laser' | 'pen'>('none');
  const [shareWithAudio, setShareWithAudio] = useState(true);
  const [sideChatOpen, setSideChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Draw persisted + remote annotations on overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of huddleAnnotations) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
      }
      ctx.stroke();
    }

    if (laserPos) {
      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.arc(laserPos.x * canvas.width, laserPos.y * canvas.height, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [huddleAnnotations, laserPos]);

  if (!activeHuddleChannelId) return null;

  const getRelPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (annotateMode === 'none') return;
    const pt = getRelPoint(e);
    if (annotateMode === 'laser') {
      setLaserPos(pt);
      return;
    }
    isDrawingRef.current = true;
    currentStrokeRef.current = [pt];
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (annotateMode === 'none') return;
    const pt = getRelPoint(e);
    if (annotateMode === 'laser') {
      setLaserPos(pt);
      return;
    }
    if (!isDrawingRef.current) return;
    currentStrokeRef.current.push(pt);
  };

  const handleCanvasPointerUp = () => {
    if (annotateMode === 'laser') {
      setLaserPos(null);
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentStrokeRef.current.length > 1 && currentUser) {
      const stroke: AnnotationStroke = {
        id: `str_${Date.now()}`,
        userId: currentUser.id,
        userName: currentUser.displayName,
        color: '#DC2626',
        points: currentStrokeRef.current,
      };
      addHuddleAnnotation(stroke);
      getSharedSocket()?.emit('huddle:annotation', {
        channelId: activeHuddleChannelId,
        stroke,
      });
    }
    currentStrokeRef.current = [];
  };

  const triggerNativePip = async () => {
    if (screenVideoRef.current && document.pictureInPictureEnabled) {
      try {
        await screenVideoRef.current.requestPictureInPicture();
        return;
      } catch {
        // Fall through to in-app PiP dock
      }
    }
    setHuddleState({ huddleMinimized: true });
  };

  // Floating Picture-in-Picture mini player when minimized
  if (huddleMinimized) {
    return (
      <div className="fixed bottom-5 end-5 z-50 w-72 rounded-xl bg-neutral-900 text-white border border-neutral-700 shadow-2xl overflow-hidden">
        <div className="p-3 flex items-center justify-between gap-2 border-b border-neutral-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-semibold truncate">{huddleTopic}</span>
          </div>
          <button
            type="button"
            onClick={() => setHuddleState({ huddleMinimized: false })}
            aria-label={isFa ? 'بزرگ‌نمایی جلسه' : 'Expand huddle'}
            className="p-1 rounded hover:bg-neutral-800"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {isScreenOn && screenStream && (
          <div className="h-32 bg-black">
            <StreamVideo stream={screenStream} muted />
          </div>
        )}
        <div className="p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? (isFa ? 'وصل میکروفون' : 'Unmute mic') : isFa ? 'قطع میکروفون' : 'Mute mic'}
              className={`p-2 rounded-lg ${isMuted ? 'bg-red-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onToggleScreenShare(shareWithAudio)}
              aria-label={isFa ? 'اشتراک‌گذاری صفحه' : 'Toggle screen share'}
              className={`p-2 rounded-lg ${isScreenOn ? 'bg-red-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={onLeaveHuddle}
            aria-label={isFa ? 'خروج از جلسه' : 'Leave huddle'}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium whitespace-nowrap shrink-0"
          >
            {isFa ? 'خروج' : 'Leave'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs p-4 lg:p-8 flex items-center justify-center">
      <div
        role="dialog"
        aria-label={isFa ? 'اتاق جلسه زنده اصفهان چالاک' : 'Active Huddle Meeting Stage'}
        className="w-full h-full rounded-2xl bg-neutral-950 text-white border border-neutral-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Bar */}
        <div className="h-14 px-5 border-b border-neutral-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-sm truncate">{huddleTopic}</h2>
              <p className="text-[11px] text-neutral-400 tabular-nums">
                {huddleParticipants.length}{' '}
                {isFa ? 'شرکت‌کننده متصل · WebRTC · حذف نویز' : 'connected · WebRTC Mesh + Noise Suppression'}{' '}
                {noiseSuppression ? 'ON' : 'OFF'}
              </p>
            </div>
            {isRecording && (
              <span className="px-2 py-0.5 rounded bg-red-600/20 border border-red-500/40 text-red-300 text-[11px] font-mono">
                REC
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={triggerNativePip}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 whitespace-nowrap shrink-0"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span>{isFa ? 'تصویر در تصویر' : 'PiP Mode'}</span>
            </button>
            <button
              type="button"
              onClick={() => setHuddleState({ huddleMinimized: true })}
              aria-label={isFa ? 'کوچک‌کردن جلسه' : 'Minimize huddle'}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Stage + Optional Side Chat */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 p-4 flex flex-col gap-4 min-w-0 overflow-y-auto">
            {/* Screen Share / Presentation Stage with Live Annotation Canvas */}
            {isScreenOn && (
              <div className="relative flex-1 min-h-[280px] rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center">
                {screenStream ? (
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8 space-y-2">
                    <Monitor className="w-10 h-10 text-red-400 mx-auto" />
                    <div className="text-sm font-semibold">
                      {isFa ? 'تخته ارائه و حاشیه‌نویسی زنده' : 'Interactive Presentation & Annotation Canvas'}
                    </div>
                    <p className="text-xs text-neutral-400 max-w-md">
                      {isFa
                        ? 'از لیزر پوینتر یا قلم طراحی برای علامت‌گذاری زنده روی ارائه استفاده کنید.'
                        : 'Use the Laser Pointer or Pen toolbar below to highlight architecture notes in real time for all huddle participants.'}
                    </p>
                  </div>
                )}

                <canvas
                  ref={canvasRef}
                  width={1280}
                  height={720}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  className={`absolute inset-0 w-full h-full ${annotateMode !== 'none' ? 'cursor-crosshair' : 'pointer-events-none'}`}
                />

                {/* Live Annotation Floating Toolbar */}
                <div className="absolute bottom-3 start-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 rounded-xl bg-neutral-900/90 border border-neutral-700 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setAnnotateMode(annotateMode === 'laser' ? 'none' : 'laser')}
                    className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      annotateMode === 'laser' ? 'bg-red-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isFa ? 'لیزر پوینتر' : 'Laser Pointer'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnotateMode(annotateMode === 'pen' ? 'none' : 'pen')}
                    className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      annotateMode === 'pen' ? 'bg-red-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>{isFa ? 'قلم' : 'Draw'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHuddleState({ huddleAnnotations: [] });
                      getSharedSocket()?.emit('huddle:annotation-clear', { channelId: activeHuddleChannelId });
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>{isFa ? 'پاک کردن' : 'Clear'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Participant Grid */}
            <div
              className={`grid gap-3 ${
                isScreenOn
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : huddleParticipants.length <= 1
                  ? 'grid-cols-1 max-w-2xl mx-auto w-full flex-1'
                  : huddleParticipants.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2 flex-1'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 flex-1'
              }`}
            >
              {huddleParticipants.map((p) => {
                const isMe = p.userId === currentUser?.id;
                const stream = isMe ? localStream : remoteStreams[p.userId];
                const hasVideo = isMe ? isCameraOn && localStream && localStream.getVideoTracks().length > 0 : p.isCameraOn && Boolean(stream);
                const speaking = activeSpeakerId === p.userId;

                return (
                  <div
                    key={p.userId}
                    className={`relative min-h-[160px] rounded-xl bg-neutral-900 border flex flex-col items-center justify-center p-4 transition-colors ${
                      speaking ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-neutral-800'
                    }`}
                  >
                    {hasVideo && stream ? (
                      <StreamVideo stream={stream} muted={isMe} />
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <UserAvatar name={p.user.displayName} avatarUrl={p.user.avatarUrl} size="xl" />
                        <div className="text-xs font-semibold text-neutral-100">{p.user.displayName}</div>
                        <div className="text-[11px] text-neutral-400">{p.user.jobTitle}</div>
                      </div>
                    )}

                    <div className="absolute bottom-2.5 start-2.5 end-2.5 flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-neutral-950/75 text-[11px] text-neutral-200 flex items-center gap-1.5">
                        {p.isMuted ? <MicOff className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3 text-emerald-400" />}
                        <span>{isMe ? (isFa ? `${p.user.displayName} (شما)` : `${p.user.displayName} (You)`) : p.user.displayName}</span>
                      </span>
                      {p.handRaised && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[11px] flex items-center gap-1">
                          <Hand className="w-3 h-3" /> {isFa ? 'دست بالا' : 'Raised'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* In-Call Side Chat */}
          {sideChatOpen && (
            <div className="w-80 border-s border-neutral-800 bg-neutral-900 flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-neutral-800 text-xs font-semibold">
                {isFa ? 'گفتگوی حین جلسه' : 'In-Call Channel Chat'}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.slice(-20).map((m) => (
                  <div key={m.id} className="text-xs space-y-0.5">
                    <div className="font-semibold text-neutral-200">{m.author.displayName}</div>
                    <div className="text-neutral-300">{m.content}</div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!chatInput.trim()) return;
                  await onSendInCallChat(chatInput.trim());
                  setChatInput('');
                }}
                className="p-3 border-t border-neutral-800 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={isFa ? 'پیام در کانال...' : 'Message channel...'}
                  aria-label={isFa ? 'ورودی گفتگوی جلسه' : 'In-call chat input'}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs text-white focus:outline-none focus:border-red-500"
                />
                <button type="submit" aria-label={isFa ? 'ارسال پیام' : 'Send in-call chat'} className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Bottom Media Controls Bar */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Device & Audio Processing Controls */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <select
              value={selectedAudioId}
              onChange={(e) => setSelectedAudioId(e.target.value)}
              aria-label={isFa ? 'انتخاب میکروفون' : 'Select microphone'}
              className="px-2 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 max-w-[160px]"
            >
              <option value="">{isFa ? 'میکروفون پیش‌فرض' : 'Default Microphone'}</option>
              {audioDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Mic ${i + 1}`}
                </option>
              ))}
            </select>
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              aria-label={isFa ? 'انتخاب دوربین' : 'Select camera'}
              className="px-2 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 max-w-[150px]"
            >
              <option value="">{isFa ? 'دوربین پیش‌فرض' : 'Default Camera'}</option>
              {videoDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNoiseSuppression(!noiseSuppression)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap shrink-0 ${
                noiseSuppression
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
            >
              {isFa ? 'حذف نویز:' : 'Noise Suppress:'} {noiseSuppression ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Center Call Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isMuted ? (isFa ? 'وصل صدا' : 'Unmute') : isFa ? 'بی‌صدا' : 'Mute'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleCamera}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isCameraOn ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span>{isFa ? 'دوربین' : 'Camera'}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleScreenShare(shareWithAudio)}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isScreenOn ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              {isScreenOn ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              <span>{isScreenOn ? (isFa ? 'توقف اشتراک' : 'Stop Share') : isFa ? 'اشتراک صفحه' : 'Share Screen'}</span>
            </button>

            <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-neutral-300 px-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={shareWithAudio}
                onChange={(e) => setShareWithAudio(e.target.checked)}
                className="rounded border-neutral-600 accent-red-600"
              />
              <span>{isFa ? 'صدای سیستم' : 'System Audio'}</span>
            </label>

            <button
              type="button"
              onClick={onToggleRaiseHand}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                handRaised ? 'bg-amber-600 hover:bg-amber-700' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              <Hand className="w-4 h-4" />
              <span className="hidden sm:inline">{isFa ? 'بالا بردن دست' : 'Raise Hand'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleRecording}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              <Disc className="w-4 h-4" />
              <span className="hidden sm:inline">{isRecording ? (isFa ? 'توقف ضبط' : 'Stop Rec') : isFa ? 'ضبط' : 'Record'}</span>
            </button>
          </div>

          {/* Right Side Chat + End Call */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSideChatOpen((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                sideChatOpen ? 'bg-red-600' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{isFa ? 'گفتگو' : 'Chat'}</span>
            </button>
            <button
              type="button"
              onClick={onLeaveHuddle}
              aria-label={isFa ? 'پایان جلسه' : 'End huddle'}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <PhoneOff className="w-4 h-4" />
              <span>{isFa ? 'پایان' : 'End'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
