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
  Gift,
  Globe,
  User,
  ExternalLink,
  Shield,
  Heart,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  nickname: string;
  uniqueId: string;
  userId: string;
  comment: string;
  profilePictureUrl: string;
  timestamp: number;
  rawUser?: any;
}

interface JoinMessage {
  id: string;
  nickname: string;
  uniqueId: string;
  userId: string;
  profilePictureUrl: string;
  timestamp: number;
  rawUser?: any;
}

interface Gifter {
  userId: string;
  nickname: string;
  uniqueId: string;
  profilePictureUrl: string;
  totalCoins: number;
  rawUser?: any;
}

interface GiftNotification {
  id: string;
  nickname: string;
  profilePictureUrl: string;
  giftName: string;
  repeatCount: number;
  diamondCount: number;
  timestamp: number;
}

const extractUserInfo = (data: any) => {
  const user = data?.user || data || {};
  const nickname = user.nickname || user.uniqueId || user.displayId || 'Người dùng';
  const uniqueId = user.uniqueId || user.displayId || '';
  
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
  return { nickname, uniqueId, profilePictureUrl, userId, rawUser: user };
};

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tiktokId, setTiktokId] = useState(localStorage.getItem('lastTiktokId') || '');
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [configTab, setConfigTab] = useState<'chat' | 'welcome' | 'gift' | 'follow' | 'page'>('chat');
  const [externalUrl, setExternalUrl] = useState(localStorage.getItem('externalUrl') || '');
  const [showPage, setShowPage] = useState(localStorage.getItem('showPage') === 'true');
  const [bgColor, setBgColor] = useState('#00FF00');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [joinMessages, setJoinMessages] = useState<JoinMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [topViewers, setTopViewers] = useState<any[]>([]);
  const [gifters, setGifters] = useState<Record<string, Gifter>>({});
  const [giftNotifications, setGiftNotifications] = useState<GiftNotification[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
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
  const [followEnabled, setFollowEnabled] = useState(false);
  const [followTemplate, setFollowTemplate] = useState('Cảm ơn {name} đã follow phòng.');
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsPitch, setTtsPitch] = useState(1);
  const [ttsRate, setTtsRate] = useState(1);
  const [voices, setVoices] = useState<any[]>([]);
  
  const ttsEnabledRef = useRef(ttsEnabled);
  const welcomeEnabledRef = useRef(welcomeEnabled);
  const welcomeTemplateRef = useRef(welcomeTemplate);
  const giftEnabledRef = useRef(giftEnabled);
  const giftTemplateRef = useRef(giftTemplate);
  const followEnabledRef = useRef(followEnabled);
  const followTemplateRef = useRef(followTemplate);
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
    followEnabledRef.current = followEnabled;
  }, [followEnabled]);

  useEffect(() => {
    followTemplateRef.current = followTemplate;
  }, [followTemplate]);

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
    localStorage.setItem('externalUrl', externalUrl);
  }, [externalUrl]);

  useEffect(() => {
    localStorage.setItem('showPage', showPage.toString());
  }, [showPage]);

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

    // Load History
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(err => console.error("Failed to fetch history:", err));
  }, []);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('tiktok-status', (data) => {
      if (data.status === 'connected') {
        setStatus('connected');
        setShowConfig(false);
        if (data.history) setHistory(data.history);
        localStorage.setItem('lastTiktokId', tiktokId);
      } else if (data.status === 'error') {
        setStatus('error');
        setErrorMessage(data.message);
      } else if (data.status === 'disconnected') {
        setStatus('disconnected');
      }
    });

    newSocket.on('tiktok-chat', (data: any) => {
      const { nickname, uniqueId, profilePictureUrl, userId, rawUser } = extractUserInfo(data);
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
        uniqueId,
        userId,
        comment,
        profilePictureUrl,
        timestamp: Date.now(),
        rawUser
      }].slice(-50));
    });

    newSocket.on('tiktok-member', (data: any) => {
      const { nickname, uniqueId, profilePictureUrl, userId, rawUser } = extractUserInfo(data);

      if (welcomeEnabledRef.current) {
        const message = welcomeTemplateRef.current.replace('{name}', nickname);
        speak(message);
      }
      setJoinMessages(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        nickname,
        uniqueId,
        userId,
        profilePictureUrl,
        timestamp: Date.now(),
        rawUser
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

    newSocket.on('tiktok-follow', (data: any) => {
      const { nickname } = extractUserInfo(data);

      if (followEnabledRef.current) {
        const message = followTemplateRef.current.replace('{name}', nickname);
        speak(message);
      }
    });

    newSocket.on('tiktok-gift', (data: any) => {
      const giftType = data.giftDetails?.giftType;
      const diamondCount = data.giftDetails?.diamondCount || 0;
      const giftName = data.giftDetails?.giftName || 'quà';
      const repeatCount = data.repeatCount || 1;
      const { nickname, uniqueId, profilePictureUrl, userId, rawUser } = extractUserInfo(data);

      if (giftType === 1 && !data.repeatEnd) return; // Skip intermediate streak events
      
      const coins = diamondCount * repeatCount;
      if (coins <= 0) return;

      if (giftEnabledRef.current) {
        let message = giftTemplateRef.current.replace('{name}', nickname);
        message = message.replace('{giftName}', giftName);
        message = message.replace('{count}', repeatCount.toString());
        speak(message);
      }

      // Push gift notification
      const notifId = Math.random().toString(36).substring(7);
      setGiftNotifications(prev => [...prev, {
        id: notifId,
        nickname,
        profilePictureUrl,
        giftName,
        repeatCount,
        diamondCount,
        timestamp: Date.now(),
      }].slice(-5));
      // Auto-remove after 4s
      setTimeout(() => {
        setGiftNotifications(prev => prev.filter(n => n.id !== notifId));
      }, 4000);

      setGifters(prev => {
        const existing = prev[userId] || {
          userId,
          nickname,
          uniqueId,
          profilePictureUrl,
          totalCoins: 0,
          rawUser
        };
        return {
          ...prev,
          [userId]: {
            ...existing,
            totalCoins: existing.totalCoins + coins,
            rawUser
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
                className="bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-3 items-start pointer-events-auto cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setSelectedUser({ ...msg, type: 'chat' })}
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

      {/* External Page Overlay */}
      {showPage && externalUrl && (
        <div className="absolute inset-0 z-15 flex items-center justify-center p-20 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full h-full bg-white/10 backdrop-blur-md rounded-3xl overflow-hidden border border-white/20 shadow-2xl pointer-events-auto"
          >
            <iframe 
              src={externalUrl} 
              className="w-full h-full border-none"
              title="External Content"
              allow="autoplay; encrypted-media"
            />
          </motion.div>
        </div>
      )}

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
                className="bg-emerald-500/90 backdrop-blur-sm rounded-full p-1.5 pr-4 shadow-sm border border-emerald-400/50 flex gap-2 items-center pointer-events-auto self-end cursor-pointer hover:bg-emerald-600/90 transition-colors"
                onClick={() => setSelectedUser({ ...msg, type: 'join' })}
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

      {/* Gift Notification Overlay */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {giftNotifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center gap-3 bg-gradient-to-r from-pink-500/90 to-rose-500/90 backdrop-blur-md rounded-full px-4 py-2 shadow-xl border border-pink-400/40"
            >
              <img
                src={notif.profilePictureUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover border-2 border-white/40 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="text-white text-sm font-bold">
                <span className="opacity-90">{notif.nickname}</span>
                <span className="opacity-70 font-medium"> đã tặng </span>
                <span>🎁 {notif.giftName}</span>
                {notif.repeatCount > 1 && (
                  <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-black">×{notif.repeatCount}</span>
                )}
              </div>
              <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
                <span className="text-yellow-300 text-xs font-black">💎 {(notif.diamondCount * notif.repeatCount).toLocaleString()}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
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
                        className="flex items-center gap-3 cursor-pointer hover:bg-white/10 p-2 -mx-2 rounded-xl transition-colors"
                        onClick={() => setSelectedUser({ ...gifter, type: 'gift' })}
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
                      const { nickname, uniqueId, profilePictureUrl, userId, rawUser } = extractUserInfo(viewer);
                      
                      return (
                        <div 
                          key={userId || index} 
                          className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-2xl transition-colors"
                          onClick={() => {
                            setSelectedUser({ nickname, uniqueId, profilePictureUrl, userId, rawUser, type: 'viewer' });
                          }}
                        >
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

      {/* User Details Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setSelectedUser(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="relative h-24 bg-gradient-to-br from-blue-500 to-purple-600">
                <button 
                  onClick={() => setSelectedUser(null)} 
                  className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 backdrop-blur-sm rounded-full transition-colors text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-6">
                <div className="flex gap-6">
                  {/* Avatar Left */}
                  <div className="w-32 h-32 shrink-0">
                    <img 
                      src={selectedUser.profilePictureUrl} 
                      alt="" 
                      className="w-full h-full rounded-full object-cover bg-slate-100 shadow-sm" 
                      referrerPolicy="no-referrer" 
                    />
                  </div>

                  {/* Info Right */}
                  <div className="flex-1 space-y-4">
                    {/* Tên */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0 mt-1">
                        <User size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên</div>
                        <div className="text-sm font-bold text-slate-700 truncate">{selectedUser.nickname || 'Không rõ'}</div>
                      </div>
                    </div>

                    {/* ID */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 shrink-0 mt-1">
                        <Shield size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID</div>
                        <div className="text-sm font-bold text-slate-700 truncate">{selectedUser.uniqueId || selectedUser.userId || 'Không rõ'}</div>
                      </div>
                    </div>

                    {/* Số Follower */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 shrink-0 mt-1">
                        <Heart size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số Follower</div>
                        <div className="text-sm font-bold text-slate-700 truncate">
                          {selectedUser.rawUser?.followInfo?.followerCount != null
                            ? Number(selectedUser.rawUser.followInfo.followerCount).toLocaleString()
                            : 'Không rõ'}
                        </div>
                      </div>
                    </div>

                    {/* Đang Follow */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shrink-0 mt-1">
                        <Award size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang Follow</div>
                        <div className="text-sm font-bold text-slate-700 truncate">
                          {selectedUser.rawUser?.followInfo?.followingCount != null
                            ? Number(selectedUser.rawUser.followInfo.followingCount).toLocaleString()
                            : 'Không rõ'}
                        </div>
                      </div>
                    </div>

                    {/* Vai trò */}
                    {(selectedUser.rawUser?.isModerator || selectedUser.rawUser?.userBadges?.some((b:any) => b?.type === 'moderator')) && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-500 shrink-0 mt-1">
                          <Shield size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vai trò</div>
                          <div className="text-sm font-bold text-amber-600 truncate">Quản lý</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                    <a 
                      href={`https://www.tiktok.com/@${selectedUser.uniqueId || selectedUser.userId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-colors"
                    >
                      <ExternalLink size={14} />
                      TikTok Profile
                    </a>
                </div>
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
                    
                    {history.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 items-center">
                        {history.slice(0, 5).map((id) => (
                          <button
                            key={id}
                            onClick={() => setTiktokId(id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-all border border-slate-200"
                          >
                            {id}
                          </button>
                        ))}
                        {history.length > 0 && (
                          <button 
                            onClick={() => {
                              fetch('/api/history/clear', { method: 'POST' })
                                .then(() => setHistory([]));
                            }}
                            className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors ml-auto"
                          >
                            Xóa lịch sử
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                    {/* Enable All / Disable All */}
                    {(() => {
                      const allEnabled = ttsEnabled && welcomeEnabled && giftEnabled && followEnabled;
                      const handleToggleAll = () => {
                        const next = !allEnabled;
                        setTtsEnabled(next);
                        setWelcomeEnabled(next);
                        setGiftEnabled(next);
                        setFollowEnabled(next);
                      };
                      return (
                        <button
                          onClick={handleToggleAll}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-widest ${
                            allEnabled
                              ? 'bg-gradient-to-r from-blue-50 to-emerald-50 border-emerald-300 text-emerald-600 shadow-sm shadow-emerald-200'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {allEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                          {allEnabled ? '✅ Đang Bật Tất Cả TTS' : '🔇 Bật Tất Cả TTS'}
                        </button>
                      );
                    })()}

                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button 
                        onClick={() => setConfigTab('welcome')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          configTab === 'welcome' ? 'bg-white shadow-sm text-emerald-500' : 'text-slate-400'
                        }`}
                      >
                        <Volume2 size={14} className={configTab === 'welcome' ? 'text-emerald-500' : ''} />
                        Chào
                      </button>
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
                        onClick={() => setConfigTab('follow')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          configTab === 'follow' ? 'bg-white shadow-sm text-pink-500' : 'text-slate-400'
                        }`}
                      >
                        <Volume2 size={14} className={configTab === 'follow' ? 'text-pink-500' : ''} />
                        Follow
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
                      <button 
                        onClick={() => setConfigTab('page')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          configTab === 'page' ? 'bg-white shadow-sm text-indigo-500' : 'text-slate-400'
                        }`}
                      >
                        <Globe size={14} className={configTab === 'page' ? 'text-indigo-500' : ''} />
                        Trang
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

                  {configTab === 'follow' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cảm ơn người Follow</label>
                        <button 
                          onClick={() => setFollowEnabled(!followEnabled)}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-sm ${
                            followEnabled 
                            ? 'bg-pink-50 border-pink-200 text-pink-600' 
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          {followEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          {followEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </button>
                      </div>

                      {followEnabled && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="pt-2"
                        >
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                            <span>Câu cảm ơn (Dùng {'{name}'} để thay tên)</span>
                          </label>
                          <input 
                            type="text" 
                            value={followTemplate}
                            onChange={(e) => setFollowTemplate(e.target.value)}
                            placeholder="Cảm ơn {name} đã follow phòng."
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-pink-500/50 transition-all text-sm"
                          />
                        </motion.div>
                      )}
                    </div>
                  )}

                  {configTab === 'page' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Hiển thị trang web ở giữa</label>
                        <button 
                          onClick={() => setShowPage(!showPage)}
                          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 transition-all font-bold text-sm ${
                            showPage 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          {showPage ? <Globe size={16} /> : <Globe size={16} className="opacity-40" />}
                          {showPage ? 'Đang Hiện' : 'Đang Ẩn'}
                        </button>
                      </div>

                      {showPage && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="pt-2"
                        >
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Link trang web</label>
                          <input 
                            type="text" 
                            value={externalUrl}
                            onChange={(e) => setExternalUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-indigo-500/50 transition-all text-sm"
                          />
                          <p className="mt-2 text-[10px] text-slate-400 font-medium italic">
                            * Lưu ý: Một số trang web có thể chặn hiển thị qua iframe.
                          </p>
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
