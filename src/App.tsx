import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Settings, 
  X,
  Volume2,
  VolumeX,
  Palette,
  MessageSquare,
  Eye,
  Gift
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  nickname: string;
  comment: string;
  profilePictureUrl: string;
  timestamp: number;
}

interface JoinMessage {
  id: string;
  nickname: string;
  profilePictureUrl: string;
  timestamp: number;
}

interface Gifter {
  userId: string;
  nickname: string;
  profilePictureUrl: string;
  totalCoins: number;
}

const extractUserInfo = (data: any) => {
  const user = data?.user || data || {};
  const nickname = user.nickname || user.uniqueId || user.displayId || 'Người dùng';
  
  let profilePictureUrl = user.profilePictureUrl || user.avatarUrl || '';
  
  if (!profilePictureUrl) {
    const getUrl = (img: any) => Array.isArray(img?.url) ? img.url[0] : (typeof img?.url === 'string' ? img.url : null);
    profilePictureUrl = getUrl(user.profilePicture) || 
                        getUrl(user.profilePictureMedium) || 
                        getUrl(user.profilePictureLarge) || 
                        getUrl(user.avatarThumb) || 
                        '';
  }

  const userId = user.userId || user.id || 'unknown';
  return { nickname, profilePictureUrl, userId };
};

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tiktokId, setTiktokId] = useState('');
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [configTab, setConfigTab] = useState<'chat' | 'welcome' | 'gift'>('chat');
  const [bgColor, setBgColor] = useState('#00FF00');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [joinMessages, setJoinMessages] = useState<JoinMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [topViewers, setTopViewers] = useState<any[]>([]);
  const [gifters, setGifters] = useState<Record<string, Gifter>>({});
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const joinContainerRef = useRef<HTMLDivElement>(null);
  const joinEndRef = useRef<HTMLDivElement>(null);
  
  // TTS Settings
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeTemplate, setWelcomeTemplate] = useState('Chào mừng {name} đã tham gia phòng.');
  const [giftEnabled, setGiftEnabled] = useState(false);
  const [giftTemplate, setGiftTemplate] = useState('Cảm ơn {name} đã tặng {giftName}.');
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsPitch, setTtsPitch] = useState(1);
  const [ttsRate, setTtsRate] = useState(1);
  const [voices, setVoices] = useState<any[]>([]);
  
  const ttsEnabledRef = useRef(ttsEnabled);
  const welcomeEnabledRef = useRef(welcomeEnabled);
  const welcomeTemplateRef = useRef(welcomeTemplate);
  const giftEnabledRef = useRef(giftEnabled);
  const giftTemplateRef = useRef(giftTemplate);
  const ttsVoiceRef = useRef(ttsVoice);
  const ttsPitchRef = useRef(ttsPitch);
  const ttsRateRef = useRef(ttsRate);
  
  const ttsQueue = useRef<string[]>([]);
  const isSpeaking = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokeAt = useRef<Record<string, number>>({});

  // Sync refs with state
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  useEffect(() => {
    welcomeEnabledRef.current = welcomeEnabled;
  }, [welcomeEnabled]);

  useEffect(() => {
    welcomeTemplateRef.current = welcomeTemplate;
  }, [welcomeTemplate]);

  useEffect(() => {
    giftEnabledRef.current = giftEnabled;
  }, [giftEnabled]);

  useEffect(() => {
    giftTemplateRef.current = giftTemplate;
  }, [giftTemplate]);

  useEffect(() => {
    ttsVoiceRef.current = ttsVoice;
  }, [ttsVoice]);

  useEffect(() => {
    ttsPitchRef.current = ttsPitch;
  }, [ttsPitch]);

  useEffect(() => {
    ttsRateRef.current = ttsRate;
  }, [ttsRate]);

  useEffect(() => {
    // Load TTS voices
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const customGoogleVoice = { name: '⭐ CHỊ GOOGLE TIẾNG VIỆT (Tùy chỉnh)', lang: 'vi-VN' };
      
      // Sort voices clearly: custom first, then other VI voices, then the rest
      const viVoicesList = availableVoices.filter(v => v.lang.includes('vi') || v.lang.includes('VI'));
      const otherVoicesList = availableVoices.filter(v => !v.lang.includes('vi') && !v.lang.includes('VI'));
      
      const customVoices: any[] = [customGoogleVoice, ...viVoicesList, ...otherVoicesList];
      setVoices(customVoices);
      
      // Always try to find a Vietnamese voice if ttsVoice is not set or not a VI voice
      const currentVoice = customVoices.find(v => v.name === ttsVoice);
      if (!currentVoice || !currentVoice.lang.includes('vi')) {
        const preferredVoice = customVoices[0]; // will be our custom google voice
        
        if (preferredVoice) {
          setTtsVoice(preferredVoice.name);
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('tiktok-status', (data) => {
      if (data.status === 'connected') {
        setStatus('connected');
        setShowConfig(false);
      } else if (data.status === 'error') {
        setStatus('error');
        setErrorMessage(data.message);
      } else if (data.status === 'disconnected') {
        setStatus('disconnected');
      }
    });

    newSocket.on('tiktok-chat', (data: any) => {
      const { nickname, profilePictureUrl, userId } = extractUserInfo(data);
      const comment = data.comment || '';

      if (ttsEnabledRef.current) {
        const now = Date.now();
        const lastTime = lastSpokeAt.current[userId] || 0;

        // Anti-spam: 3 giây mỗi người, giới hạn 60 ký tự và loại bỏ lặp lại lố bịch
        if (now - lastTime >= 3000) {
          lastSpokeAt.current[userId] = now;
          let safeComment = comment.substring(0, 60);
          safeComment = safeComment.replace(/(.)\1{4,}/g, '$1$1$1...');
          speak(`${nickname} nói: ${safeComment}`);
        }
      }
      setChatMessages(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        nickname,
        comment,
        profilePictureUrl,
        timestamp: Date.now()
      }].slice(-50));
    });

    newSocket.on('tiktok-member', (data: any) => {
      const { nickname, profilePictureUrl } = extractUserInfo(data);

      if (welcomeEnabledRef.current) {
        const message = welcomeTemplateRef.current.replace('{name}', nickname);
        speak(message);
      }
      setJoinMessages(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        nickname,
        profilePictureUrl,
        timestamp: Date.now()
      }].slice(-20));
    });

    newSocket.on('tiktok-roomUser', (data: any) => {
      if (typeof data.viewerCount === 'number') {
        setViewerCount(data.viewerCount);
      }
      if (Array.isArray(data.ranksList)) {
        setTopViewers(data.ranksList.map((rank: any) => ({
          user: rank.user,
          coinCount: rank.coinCount
        })));
      }
    });

    newSocket.on('tiktok-gift', (data: any) => {
      const giftType = data.giftDetails?.giftType;
      const diamondCount = data.giftDetails?.diamondCount || 0;
      const giftName = data.giftDetails?.giftName || 'quà';
      const { nickname, profilePictureUrl, userId } = extractUserInfo(data);

      if (giftType === 1 && !data.repeatEnd) return; // Skip intermediate streak events
      
      const coins = diamondCount * (data.repeatCount || 1);
      if (coins <= 0) return;

      if (giftEnabledRef.current) {
        let message = giftTemplateRef.current.replace('{name}', nickname);
        message = message.replace('{giftName}', giftName);
        message = message.replace('{count}', (data.repeatCount || 1).toString());
        speak(message);
      }

      setGifters(prev => {
        const existing = prev[userId] || {
          userId,
          nickname,
          profilePictureUrl,
          totalCoins: 0
        };
        return {
          ...prev,
          [userId]: {
            ...existing,
            totalCoins: existing.totalCoins + coins
          }
        };
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (joinEndRef.current) {
      joinEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [joinMessages]);

  const speak = (text: string) => {
    if (!window.speechSynthesis && ttsVoiceRef.current !== 'Google Tiếng Việt (Web API)') return;
    
    // Prevent TTS spam by limiting queue size (giữ ở mức độ nhỏ để chat luôn mới)
    if (ttsQueue.current.length > 10) {
      ttsQueue.current.shift(); // Remove oldest message to prevent infinite backlog
    }
    
    ttsQueue.current.push(text);
    processQueue();
  };

  const processQueue = () => {
    if (isSpeaking.current || ttsQueue.current.length === 0) return;
    
    const text = ttsQueue.current.shift();
    if (!text) return;
    
    const isGoogleVoice = ttsVoiceRef.current === '⭐ CHỊ GOOGLE TIẾNG VIỆT (Tùy chỉnh)';

    if (isGoogleVoice && audioPlayerRef.current) {
      isSpeaking.current = true;
      try {
        const url = `/api/tts?text=${encodeURIComponent(text)}`;
        const audio = audioPlayerRef.current;
        audio.src = url;
        audio.playbackRate = ttsRateRef.current;
        
        audio.onended = () => { isSpeaking.current = false; processQueue(); };
        audio.onerror = () => { isSpeaking.current = false; processQueue(); };
        audio.play().catch((e) => { 
          console.error("Audio playback failed", e);
          isSpeaking.current = false; 
          processQueue(); 
        });
      } catch (e) {
        isSpeaking.current = false; processQueue();
      }
      return;
    }

    isSpeaking.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    const availableVoices = window.speechSynthesis.getVoices();
    const selectedVoice = availableVoices.find(v => v.name === ttsVoiceRef.current);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      // Fallback to Vietnamese if no voice is selected or found
      utterance.lang = 'vi-VN';
    }
    
    utterance.pitch = ttsPitchRef.current;
    utterance.rate = ttsRateRef.current;
    utterance.volume = 1;

    utterance.onend = () => {
      isSpeaking.current = false;
      processQueue();
    };

    utterance.onerror = () => {
      isSpeaking.current = false;
      processQueue();
    };
    
    window.speechSynthesis.speak(utterance);
  };



  const connectTiktok = () => {
    if (!tiktokId || !socket) return;
    
    // Unlock Audio Context (bypass browser autoplay block for Google TTS)
    if (audioPlayerRef.current) {
       audioPlayerRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
       audioPlayerRef.current.volume = 1;
       audioPlayerRef.current.play().catch(() => {});
    }

    setStatus('connecting');
    socket.emit('connect-tiktok', tiktokId);
  };

  const disconnectTiktok = () => {
    if (socket) {
      socket.emit('disconnect-tiktok');
      
      // Clear TTS queue and stop speaking
      ttsQueue.current = [];
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
      isSpeaking.current = false;
    }
  };

  const topGiftersList = (Object.values(gifters) as Gifter[])
    .sort((a, b) => b.totalCoins - a.totalCoins)
    .slice(0, 5);

  return (
    <div 
      className="relative min-h-screen overflow-hidden font-sans select-none"
      style={{ backgroundColor: bgColor }}
    >
      <audio ref={audioPlayerRef} style={{ display: 'none' }} referrerPolicy="no-referrer" />
      {/* Background Texture / Grid - Removed for Green Screen */}

      {/* Main Splat Area */}
      <div className="absolute inset-0 z-10">
      </div>

      {/* Chat Overlay */}
      <div className="absolute inset-y-0 left-0 w-96 p-6 z-20 flex flex-col justify-end pointer-events-none">
        <div 
          ref={chatContainerRef}
          className="flex flex-col gap-3 overflow-y-auto pointer-events-auto pr-2 custom-scrollbar" 
          style={{ 
            maxHeight: '80vh',
            maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 100%)', 
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 100%)' 
          }}
        >
          <AnimatePresence initial={false}>
            {chatMessages.map((msg) => (
              <motion.div
                layout
                key={msg.id}
                initial={{ opacity: 0, x: -20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-3 items-start pointer-events-auto"
              >
                <img src={msg.profilePictureUrl} alt="" className="w-8 h-8 rounded-full bg-slate-200 object-cover shrink-0" referrerPolicy="no-referrer" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-500 truncate">{msg.nickname}</div>
                  <div className="text-sm font-medium text-slate-800 break-words leading-tight mt-0.5">{msg.comment}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-1 shrink-0" />
        </div>
      </div>

      {/* Join Overlay */}
      <div className="absolute inset-y-0 right-0 w-80 p-6 z-20 flex flex-col justify-end pointer-events-none">
        <div 
          ref={joinContainerRef}
          className="flex flex-col gap-2 overflow-y-auto pointer-events-auto pl-2 custom-scrollbar" 
          style={{ 
            maxHeight: '60vh',
            maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 100%)', 
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 100%)' 
          }}
        >
          <AnimatePresence initial={false}>
            {joinMessages.map((msg) => (
              <motion.div
                layout
                key={msg.id}
                initial={{ opacity: 0, x: 20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="bg-emerald-500/90 backdrop-blur-sm rounded-full p-1.5 pr-4 shadow-sm border border-emerald-400/50 flex gap-2 items-center pointer-events-auto self-end"
              >
                <img src={msg.profilePictureUrl} alt="" className="w-6 h-6 rounded-full bg-emerald-600 object-cover shrink-0" referrerPolicy="no-referrer" />
                <div className="text-xs font-bold text-white truncate max-w-[150px]">
                  {msg.nickname} <span className="font-medium opacity-90">đã tham gia</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={joinEndRef} className="h-1 shrink-0" />
        </div>
      </div>

      {/* Overlay UI */}
      <div className="absolute inset-0 pointer-events-none z-40 flex flex-col p-6">
        <div className="flex items-start justify-between">
          <button 
            onClick={() => setShowViewers(true)}
            className="flex items-center gap-2 pointer-events-auto bg-black/40 backdrop-blur-md rounded-full px-4 py-2 text-white hover:bg-black/60 transition-colors cursor-pointer"
          >
            <Eye size={16} />
            <span className="text-sm font-bold">{viewerCount.toLocaleString()}</span>
          </button>
          
          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-2 pointer-events-auto">
              <button 
                onClick={() => setShowConfig(true)}
                className="p-3 bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-colors text-slate-600"
              >
                <Settings size={20} />
              </button>
            </div>

            {/* Top Gifters Panel */}
            <AnimatePresence>
              {topGiftersList.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-xl pointer-events-auto w-64"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Gift size={16} className="text-pink-500" />
                    <span className="text-sm font-bold text-white uppercase tracking-wider">Top Tặng Quà</span>
                  </div>
                  <div className="space-y-3">
                    {topGiftersList.map((gifter, index) => (
                      <motion.div 
                        layout
                        key={gifter.userId}
                        className="flex items-center gap-3"
                      >
                        <div className="relative shrink-0">
                          <img src={gifter.profilePictureUrl} className="w-8 h-8 rounded-full border border-white/20 object-cover" referrerPolicy="no-referrer" alt="" />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-slate-800 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white/20">
                            {index + 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{gifter.nickname}</div>
                          <div className="text-[10px] font-medium text-pink-400">{gifter.totalCoins.toLocaleString()} coins</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Viewers Modal */}
      <AnimatePresence>
        {showViewers && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowViewers(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Eye size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Người Đang Xem</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{viewerCount.toLocaleString()} người</p>
                  </div>
                </div>
                <button onClick={() => setShowViewers(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                {topViewers.length > 0 ? (
                  <div className="space-y-4">
                    {topViewers.map((viewer, index) => {
                      const { nickname, profilePictureUrl, userId } = extractUserInfo(viewer);
                      
                      return (
                        <div key={userId || index} className="flex items-center gap-3">
                          <img src={profilePictureUrl} alt="" className="w-10 h-10 rounded-full bg-slate-200 object-cover" referrerPolicy="no-referrer" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">{nickname}</div>
                            {viewer.coinCount > 0 && (
                              <div className="text-xs font-medium text-amber-500">{viewer.coinCount} coins</div>
                            )}
                          </div>
                          <div className="text-xs font-black text-slate-300">#{index + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-slate-400 py-8 font-medium">
                    Chưa có dữ liệu người xem (Top Viewers)
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => status === 'connected' && setShowConfig(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <MessageSquare size={20} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800 tracking-tight">Stream Chat TTS</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">TikTok Interactive</p>
                    </div>
                  </div>
                  {status === 'connected' && (
                    <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X size={20} className="text-slate-400" />
                    </button>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">TikTok Username</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={tiktokId}
                        onChange={(e) => setTiktokId(e.target.value)}
                        placeholder="@username"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-slate-800 font-bold outline-none focus:border-red-500/50 transition-all"
                      />
                      {status === 'connecting' && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button 
                      onClick={() => setConfigTab('chat')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        configTab === 'chat' ? 'bg-white shadow-sm text-blue-500' : 'text-slate-400'
                      }`}
                    >
                      <MessageSquare size={14} className={configTab === 'chat' ? 'fill-blue-500' : ''} />
                      Bình Luận
                    </button>
                    <button 
                      onClick={() => setConfigTab('welcome')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        configTab === 'welcome' ? 'bg-white shadow-sm text-emerald-500' : 'text-slate-400'
                      }`}
                    >
                      <Volume2 size={14} className={configTab === 'welcome' ? 'text-emerald-500' : ''} />
                      Chào Mừng
                    </button>
                    <button 
                      onClick={() => setConfigTab('gift')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        configTab === 'gift' ? 'bg-white shadow-sm text-amber-500' : 'text-slate-400'
                      }`}
                    >
                      <Gift size={14} className={configTab === 'gift' ? 'text-amber-500' : ''} />
                      Quà
                    </button>
                  </div>

                  {configTab === 'chat' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Đọc Bình Luận (TTS)</label>
                        <button 
                          onClick={() => setTtsEnabled(!ttsEnabled)}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-sm ${
                            ttsEnabled 
                            ? 'bg-blue-50 border-blue-200 text-blue-600' 
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          {ttsEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </button>
                      </div>
                      
                      {ttsEnabled && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-4"
                        >
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Giọng nói</label>
                            <select 
                              value={ttsVoice}
                              onChange={(e) => setTtsVoice(e.target.value)}
                              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-blue-500/50 transition-all text-sm appearance-none"
                            >
                              {voices.map((voice) => (
                                <option key={voice.name} value={voice.name}>
                                  {voice.name} ({voice.lang})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tốc độ ({ttsRate}x)</label>
                              <input 
                                type="range" 
                                min="0.5" 
                                max="2" 
                                step="0.1"
                                value={ttsRate}
                                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cao độ ({ttsPitch})</label>
                              <input 
                                type="range" 
                                min="0.5" 
                                max="2" 
                                step="0.1"
                                value={ttsPitch}
                                onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {configTab === 'welcome' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chào người tham gia</label>
                        <button 
                          onClick={() => setWelcomeEnabled(!welcomeEnabled)}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-sm ${
                            welcomeEnabled 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          {welcomeEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          {welcomeEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </button>
                      </div>

                      {welcomeEnabled && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="pt-2"
                        >
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                            <span>Câu chào (Dùng {'{name}'} để thay tên)</span>
                          </label>
                          <input 
                            type="text" 
                            value={welcomeTemplate}
                            onChange={(e) => setWelcomeTemplate(e.target.value)}
                            placeholder="Chào mừng {name} đã tham gia phòng."
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-emerald-500/50 transition-all text-sm"
                          />
                        </motion.div>
                      )}
                    </div>
                  )}

                  {configTab === 'gift' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Đọc Tên Người Tặng Quà</label>
                        <button 
                          onClick={() => setGiftEnabled(!giftEnabled)}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-sm ${
                            giftEnabled 
                            ? 'bg-amber-50 border-amber-200 text-amber-600' 
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          {giftEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          {giftEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </button>
                      </div>

                      {giftEnabled && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="pt-2"
                        >
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex flex-col gap-1">
                            <span>Câu cảm ơn</span>
                            <span className="text-slate-400/70 normal-case font-medium text-xs">
                              Dùng {'{name}'} để thay tên, {'{giftName}'} cho tên quà, {'{count}'} cho số lượng
                            </span>
                          </label>
                          <input 
                            type="text" 
                            value={giftTemplate}
                            onChange={(e) => setGiftTemplate(e.target.value)}
                            placeholder="Cảm ơn {name} đã tặng {count} {giftName}"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-amber-500/50 transition-all text-sm"
                          />
                        </motion.div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Màu nền</label>
                    <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-2xl p-2">
                      {['#00FF00', '#0000FF', '#000000', '#FFFFFF', '#f8fafc'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setBgColor(color)}
                          className={`w-8 h-8 rounded-lg border-2 transition-all ${
                            bgColor === color ? 'border-red-500 scale-110 shadow-sm' : 'border-white'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <div className="w-px h-6 bg-slate-200 mx-1" />
                      <div className="relative flex-1">
                        <input 
                          type="color" 
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-lg py-1 px-2 pointer-events-none">
                          <Palette size={12} className="text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-600 uppercase">{bgColor}</span>
                        </div>
                      </div>
                    </div>
                  </div>



                  {status === 'error' && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-bold">
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex gap-3">
                    {status === 'connected' ? (
                      <button 
                        onClick={disconnectTiktok}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                      >
                        Ngắt kết nối
                      </button>
                    ) : (
                      <button 
                        onClick={connectTiktok}
                        disabled={!tiktokId || status === 'connecting'}
                        className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-red-500/25 uppercase tracking-widest text-xs"
                      >
                        Kết nối ngay
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100">
                  <div className="flex items-center justify-center gap-4 text-slate-400">
                    <div className="flex flex-col items-center gap-1">
                      <MessageSquare size={16} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Đọc Bình Luận</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-200" />
                    <div className="flex flex-col items-center gap-1">
                      <Volume2 size={16} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Chào Mừng</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
