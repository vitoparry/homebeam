import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Monitor,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Cast,
  Layout,
  Wifi,
  WifiOff,
  X,
  Camera,
  Terminal,
  Minimize2,
  Maximize2,
  Link2
} from "lucide-react";

// --- Configuration ---
const rtcConfig = {
  iceServers: []
};

export default function App() {
  const [mode, setMode] = useState("home");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [error, setError] = useState("");
  const [showMediaTest, setShowMediaTest] = useState(false);

  // Toasts + notices
  const [toast, setToast] = useState("");

  // Debug logs
  const [logs, setLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  // Kid theme (Nebula / SuperNova)
  const [kidTheme, setKidTheme] = useState(() => {
    try {
      return localStorage.getItem("homebeamTheme") || "nebula";
    } catch {
      return "nebula";
    }
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const testVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const socketRef = useRef(null);

  const candidateQueue = useRef([]);
  const activeRoomIdRef = useRef("");

  const joinInputRef = useRef(null);

  // --- Theme palette ---
  const theme = useMemo(() => {
    const THEMES = {
      nebula: {
        name: "Nebula",
        gradient: "from-indigo-600 to-purple-600",
        accentText: "text-indigo-300",
        accentBorder: "border-indigo-500/30",
        accentBg: "bg-indigo-500/10"
      },
      supernova: {
        name: "SuperNova",
        gradient: "from-amber-500 to-rose-500",
        accentText: "text-amber-200",
        accentBorder: "border-amber-400/30",
        accentBg: "bg-amber-400/10"
      }
    };
    return THEMES[kidTheme] || THEMES.nebula;
  }, [kidTheme]);

  const cycleTheme = () => {
    const next = kidTheme === "nebula" ? "supernova" : "nebula";
    setKidTheme(next);
    try {
      localStorage.setItem("homebeamTheme", next);
    } catch {}
    showToast(`${next === "nebula" ? "Nebula" : "SuperNova"} mode ✨`);
  };

  // --- Logger ---
  const log = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] ${msg}`;
    console.log(logMsg);
    setLogs((prev) => [logMsg, ...prev].slice(0, 50));
  };

  // --- Toast helper ---
  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(""), 2500);
  };

  const copyToClipboard = async (textToCopy, okMsg = "Copied ✅") => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(okMsg);
    } catch {
      const el = document.createElement("textarea");
      el.value = textToCopy;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      showToast(okMsg);
    }
  };

  // Invite link for laptops (prefill join)
  const inviteLink = useMemo(() => {
    if (!roomId) return "";
    return `${window.location.origin}/?join=${roomId}`;
  }, [roomId]);

  // If opened via invite link, prefill join code
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("join");
      if (code && /^\d{4}$/.test(code)) {
        setJoinCode(code);
        showToast(`Invite detected — code ${code} ready ✅`);
      }
    } catch {}
  }, []);

  // Auto-focus join input on landing page
  useEffect(() => {
    if (mode === "home" && joinInputRef.current) joinInputRef.current.focus();
  }, [mode]);

  // Keep local video attached when layout changes
  useEffect(() => {
    if (mode === "room" && localVideoRef.current && localStream.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
  }, [mode, isRemoteScreenSharing]);

  useEffect(() => {
    if (showMediaTest && testVideoRef.current && localStream.current) {
      testVideoRef.current.srcObject = localStream.current;
    }
  }, [showMediaTest]);

  // --- Init Socket (SAME ORIGIN) ---
  useEffect(() => {
    const socketUrl = window.location.origin;
    log(`Connecting to socket: ${socketUrl}`);

    socketRef.current = io(socketUrl, {
      transports: ["websocket", "polling"]
    });

    socketRef.current.on("connect", () => {
      log("Socket Connected!");
      setError("");
      showToast("Connected to HomeBeam ⚡");
    });

    socketRef.current.on("connect_error", (err) => {
      log(`Socket Error: ${err.message}`);
      setError(`Connection Failed. Trust the cert at ${window.location.origin}`);
      showToast("Connection issue — trust the cert 🔒");
    });

    socketRef.current.on("user-joined", async () => {
      log("Peer joined. Creating offer...");
      try {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socketRef.current.emit("signal", {
          roomId: activeRoomIdRef.current,
          signalData: { type: "offer", sdp: offer.sdp }
        });
        log("Offer sent.");
      } catch (err) {
        log(`Offer Error: ${err.message}`);
      }
    });

    socketRef.current.on("signal", async (data) => {
      if (!peerConnection.current) return;

      try {
        if (data.type === "offer") {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: data.sdp })
          );

          while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          }

          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);

          socketRef.current.emit("signal", {
            roomId: activeRoomIdRef.current,
            signalData: { type: "answer", sdp: answer.sdp }
          });
          log("Answer sent.");
        } else if (data.type === "answer") {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: data.sdp })
          );

          while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          }

          log("Remote desc set (answer).");
        } else if (data.candidate) {
          if (peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            candidateQueue.current.push(data.candidate);
          }
        }
      } catch (err) {
        log(`Signal Error: ${err.message}`);
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // --- WebRTC Setup ---
  const setupPeerConnection = async (currentRoomId) => {
    log(`Initializing WebRTC for Room: ${currentRoomId}`);
    peerConnection.current = new RTCPeerConnection(rtcConfig);

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });
    }

    peerConnection.current.ontrack = (event) => {
      log("Received remote track!");
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      log(`WebRTC State: ${state}`);

      if (state === "connected") {
        setConnectionStatus("connected");
        showToast("Call connected 🎉");
      }
      if (state === "disconnected" || state === "failed") {
        setConnectionStatus("disconnected");
      }
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("signal", {
          roomId: activeRoomIdRef.current,
          signalData: { candidate: event.candidate.toJSON() }
        });
      }
    };
  };

  const openUserMedia = async () => {
    try {
      log("Requesting Camera/Mic permissions...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
        testVideoRef.current.muted = true;
      }
      return true;
    } catch (err) {
      log(`Camera Fail: ${err.message}`);
      setError(`Camera Error: ${err.message}. HTTPS required.`);
      showToast("Camera permission needed 📷");
      return false;
    }
  };

  const stopUserMedia = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
  };

  // --- Actions ---
  const startSession = async () => {
    const success = await openUserMedia();
    if (!success) return;

    const newRoomId = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomId(newRoomId);
    activeRoomIdRef.current = newRoomId;

    await setupPeerConnection(newRoomId);

    socketRef.current.emit("create-room", newRoomId);
    socketRef.current.once("room-created", () => {
      setMode("room");
      setConnectionStatus("waiting");
      showToast("Session ready ✅ Share the code!");
    });
    socketRef.current.once("error", (msg) => {
      setError(msg);
      showToast("Could not create room 😕");
    });
  };

  const joinSession = async () => {
    if (!joinCode || joinCode.length < 4) return;

    setRoomId(joinCode);
    activeRoomIdRef.current = joinCode;

    const success = await openUserMedia();
    if (!success) return;

    await setupPeerConnection(joinCode);

    socketRef.current.emit("join-room", joinCode);
    socketRef.current.once("room-joined", () => {
      setMode("room");
      setConnectionStatus("connecting");
      showToast("Joining… ⚡");
    });
    socketRef.current.once("error", (msg) => {
      setError(msg);
      setMode("home");
      showToast("Could not join 😕");
    });
  };

  const handleTestMedia = async () => {
    const success = await openUserMedia();
    if (success) setShowMediaTest(true);
  };

  const closeTestMedia = () => {
    stopUserMedia();
    setShowMediaTest(false);
  };

  // --- Media Toggles ---
  const toggleMic = () => {
    if (!localStream.current) return;
    const track = localStream.current.getAudioTracks()[0];
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
    showToast(track.enabled ? "Mic on 🎤" : "Mic muted 🔇");
  };

  const toggleCamera = () => {
    if (!localStream.current) return;
    const track = localStream.current.getVideoTracks()[0];
    track.enabled = !track.enabled;
    setIsVideoOff(!track.enabled);
    showToast(track.enabled ? "Camera on 📷" : "Camera off 🚫");
  };

  const toggleScreenShare = async () => {
    if (!peerConnection.current) return;

    if (isScreenSharing) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const track = stream.getVideoTracks()[0];
      const sender = peerConnection.current
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(track);
      localVideoRef.current.srcObject = stream;
      localStream.current = stream;
      setIsScreenSharing(false);
      showToast("Back to camera 📷");
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        const sender = peerConnection.current
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(track);
        localVideoRef.current.srcObject = stream;
        track.onended = () => {
          // If the user stops sharing from browser UI, revert
          setIsScreenSharing(false);
          showToast("Screen share stopped");
        };
        setIsScreenSharing(true);
        showToast("Sharing screen 🖥️");
      } catch {
        showToast("Screen share cancelled");
      }
    }
  };

  const leaveRoom = () => window.location.reload();

  // --- Render ---
  return (
    <div className="w-full min-h-screen bg-slate-950 text-white font-sans relative overflow-hidden flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <img
          src="/background.jpg"
          alt="Ironman Background"
          className="w-full h-full object-cover"
          style={{ animation: "breathing 10s ease-in-out infinite" }}
        />
      </div>

      <style>{`
        @keyframes breathing {
          0% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.03); }
          100% { opacity: 0.35; transform: scale(1); }
        }
        @keyframes glow {
          0% { text-shadow: 0 0 10px #4f46e5, 0 0 20px #4f46e5, 0 0 30px #e0e7ff; }
          50% { text-shadow: 0 0 20px #818cf8, 0 0 30px #818cf8, 0 0 40px #e0e7ff; }
          100% { text-shadow: 0 0 10px #4f46e5, 0 0 20px #4f46e5, 0 0 30px #e0e7ff; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="w-full p-4 border-b border-slate-800/50 bg-slate-900/50 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md">
        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          LAN Only
        </span>

        <div className="flex gap-3 items-center">
          <button
            onClick={cycleTheme}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${theme.accentBorder} ${theme.accentBg} ${theme.accentText} hover:opacity-90`}
            title="Switch kid theme (Nebula / SuperNova)"
          >
            {theme.name}
          </button>

          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`p-1.5 rounded-full transition-colors ${
              showDebug ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-white"
            }`}
            title="Toggle Debug Logs"
          >
            <Terminal className="w-4 h-4" />
          </button>

          <div
            className={`text-xs font-mono px-3 py-1 rounded-full border flex items-center gap-2 ${
              connectionStatus === "connected"
                ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                : error
                ? "bg-red-500/10 border-red-500/50 text-red-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            {error ? "Error" : connectionStatus === "connected" ? "Connected" : "Ready"}
          </div>
        </div>
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-full border border-white/10 bg-black/70 backdrop-blur text-white text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Debugger */}
      {showDebug && (
        <div className="fixed bottom-0 left-0 w-full h-48 bg-black/90 text-green-400 font-mono text-xs p-4 overflow-y-auto z-[100] border-t border-slate-700">
          <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-1">
            <span className="font-bold text-white">SYSTEM LOGS</span>
            <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white">
              Close
            </button>
          </div>
          {logs.length === 0 && <div className="text-slate-600 italic">No logs yet...</div>}
          {logs.map((msg, i) => (
            <div key={i} className="mb-1 border-b border-slate-800/30 pb-0.5">
              {msg}
            </div>
          ))}
        </div>
      )}

      <main className="relative z-10 flex-1 flex items-center justify-center p-6 w-full">
        {error && (
          <div className="absolute top-4 mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 flex items-center gap-3 max-w-md w-full z-50">
            <WifiOff className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Media Test Modal */}
        {showMediaTest && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl relative shadow-2xl">
              <button
                onClick={closeTestMedia}
                className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-white">
                <Camera className="w-6 h-6 text-indigo-400" /> Test Mic & Camera
              </h3>
              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 relative mb-4">
                <video
                  ref={testVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white">
                  Local Preview
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={closeTestMedia}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                >
                  Looks Good
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "home" && (
          <div className="w-full max-w-6xl grid md:grid-cols-2 gap-12 items-center">
            {/* Hero Text */}
            <div className="flex flex-col space-y-8 text-center md:text-left pt-8 md:pt-0">
              <h1
                className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-tight text-white py-2 mb-6"
                style={{ animation: "glow 3s infinite alternate" }}
              >
                HomeBeam
              </h1>
              <p className="mt-2 text-lg italic text-gray-400">I Love You 3000</p>

              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-300">Offline. Secure. Local.</h2>

                <p className="text-slate-400 text-lg max-w-md mx-auto md:mx-0">
                  Screen sharing that stays within your four walls. No Internet required. Data never leaves your router.
                </p>

                <button
                  onClick={handleTestMedia}
                  className={`inline-flex items-center gap-2 ${theme.accentText} hover:opacity-90 font-medium transition-colors border ${theme.accentBorder} px-4 py-2 rounded-lg ${theme.accentBg}`}
                >
                  <Camera className="w-4 h-4" />
                  Test Mic & Camera
                </button>
              </div>
            </div>

            {/* Card */}
            <div className="w-full md:w-[420px] bg-slate-900/70 backdrop-blur-md p-8 rounded-3xl border border-slate-700/50 space-y-8 shadow-2xl">
              <button
                onClick={startSession}
                className={`w-full py-4 bg-gradient-to-r ${theme.gradient} rounded-xl font-bold flex items-center justify-center gap-3 text-white hover:scale-105 transition-transform shadow-lg`}
              >
                <Cast className="w-5 h-5" />
                Start Local Session
              </button>

              <div className="text-center text-sm text-slate-400 font-bold relative">
                <span className="bg-transparent relative z-10 px-2 bg-slate-900/50 rounded">OR JOIN EXISTING</span>
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700/50"></div>
                </div>
              </div>

              <div className="flex gap-3">
                <input
                  ref={joinInputRef}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="0000"
                  maxLength={4}
                  className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl font-mono focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-600"
                />
                <button
                  onClick={joinSession}
                  disabled={joinCode.length < 4}
                  className="px-8 bg-slate-800 rounded-xl font-bold disabled:opacity-50 hover:bg-slate-700 transition-colors border border-slate-700 text-white"
                >
                  Join
                </button>
              </div>

              {joinCode.length > 0 && joinCode.length < 4 && (
                <p className="text-xs text-slate-400 text-center">Enter 4 digits to join.</p>
              )}
            </div>
          </div>
        )}

        {mode === "room" && (
          <div className="w-full max-w-full h-[calc(100vh-80px)] flex flex-col gap-4 p-4">
            <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur p-4 rounded-xl border border-slate-800 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400 text-sm uppercase tracking-wider font-semibold">Room Code</span>

                <span className="text-3xl font-mono font-bold text-indigo-400 tracking-widest bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
                  {roomId}
                </span>

                <button
                  onClick={() => copyToClipboard(roomId, "Room code copied ✅")}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-semibold"
                  title="Copy room code"
                >
                  Copy Code
                </button>

                <button
                  onClick={() => copyToClipboard(inviteLink, "Invite link copied ✅")}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-semibold inline-flex items-center gap-2"
                  title="Copy invite link"
                >
                  <Link2 className="w-4 h-4" />
                  Copy Invite Link
                </button>

                {connectionStatus !== "connected" && (
                  <span className="text-xs text-slate-400 ml-1">Send to Nebula / SuperNova 👆</span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsRemoteScreenSharing(!isRemoteScreenSharing)}
                  className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 font-medium transition-colors border border-slate-700"
                >
                  {isRemoteScreenSharing ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  {isRemoteScreenSharing ? "Reset View" : "Focus Remote Screen"}
                </button>

                <button
                  onClick={leaveRoom}
                  className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors font-medium border border-red-500/10"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {/* VIDEO LAYOUT */}
            <div
              className={`flex-1 relative w-full h-full overflow-hidden rounded-2xl bg-black border border-slate-800 ${
                isRemoteScreenSharing ? "" : "grid md:grid-cols-2 gap-4"
              }`}
            >
              {/* REMOTE */}
              <div
                className={`relative bg-slate-900 overflow-hidden group shadow-2xl backdrop-blur-sm transition-all duration-500 ${
                  isRemoteScreenSharing ? "absolute inset-0 w-full h-full z-0" : "w-full h-full rounded-xl border border-slate-800"
                }`}
              >
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />

                {connectionStatus !== "connected" && !isRemoteScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-6 bg-slate-900/95 z-10 backdrop-blur-sm">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Wifi className="w-8 h-8 text-indigo-500/50" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-lg font-medium text-white">Waiting for the other hero...</p>
                      <p className="text-sm text-slate-500">
                        Share code <span className="font-mono text-indigo-400 font-bold">{roomId}</span> or send the invite link.
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-medium border border-white/10 flex items-center gap-2 z-20">
                  <div className={`w-2 h-2 rounded-full ${connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  Remote
                </div>
              </div>

              {/* LOCAL */}
              <div
                className={`relative bg-slate-900 overflow-hidden group shadow-2xl backdrop-blur-sm transition-all duration-500 ${
                  isRemoteScreenSharing
                    ? "absolute bottom-6 right-6 w-48 h-36 md:w-64 md:h-48 rounded-xl border-2 border-slate-700 z-50 shadow-2xl"
                    : "w-full h-full rounded-xl border border-slate-800"
                }`}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isScreenSharing ? "" : "-scale-x-100"}`}
                />

                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-medium border border-white/10 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  You {isScreenSharing ? "(Screen)" : "(Camera)"}
                </div>

                <div
                  className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-4 transition-opacity duration-300 backdrop-blur-[2px]
                  ${isRemoteScreenSharing ? "opacity-0 hover:opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <button
                    onClick={toggleMic}
                    className={`p-3 md:p-4 rounded-full transition-transform hover:scale-110 shadow-lg ${
                      isMuted ? "bg-red-500 text-white" : "bg-white text-slate-900"
                    }`}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
                  </button>

                  <button
                    onClick={toggleCamera}
                    className={`p-3 md:p-4 rounded-full transition-transform hover:scale-110 shadow-lg ${
                      isVideoOff ? "bg-red-500 text-white" : "bg-white text-slate-900"
                    }`}
                    title={isVideoOff ? "Camera on" : "Camera off"}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5 md:w-6 md:h-6" /> : <Video className="w-5 h-5 md:w-6 md:h-6" />}
                  </button>

                  <button
                    onClick={toggleScreenShare}
                    className={`p-3 md:p-4 rounded-full transition-transform hover:scale-110 shadow-lg ${
                      isScreenSharing ? "bg-indigo-500 text-white" : "bg-white text-slate-900"
                    }`}
                    title={isScreenSharing ? "Stop sharing" : "Share screen"}
                  >
                    {isScreenSharing ? <Layout className="w-5 h-5 md:w-6 md:h-6" /> : <Monitor className="w-5 h-5 md:w-6 md:h-6" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
