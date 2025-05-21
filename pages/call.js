import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { initAgora, leaveAgora, checkDevicePermissions } from "@/utils/agora";

export default function Call() {
  const router = useRouter();
  const { channel } = router.query;

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const clientRef = useRef(null);

  const [callState, setCallState] = useState({
    isInitializing: false,
    hasLocalVideo: false,
    hasLocalAudio: false,
    hasRemoteVideo: false,
    hasRemoteAudio: false,
    remoteUserId: null,
    error: null,
    devices: {
      hasCamera: false,
      hasMicrophone: false
    }
  });

  useEffect(() => {
    const checkDevices = async () => {
      const devices = await checkDevicePermissions();
      setCallState(prev => ({ ...prev, devices }));
    };

    checkDevices();
  }, []);

  useEffect(() => {
    let localTracks = [];
    let remoteUsers = [];

    const startCall = async () => {
      if (!channel || callState.isInitializing) return;

      setCallState(prev => ({ ...prev, isInitializing: true, error: null }));

      try {
        // Clean up any previous tracks
        localTracks.forEach(track => {
          try {
            track.stop();
            track.close();
          } catch (e) {
            console.warn("Track cleanup error:", e);
          }
        });
        localTracks = [];

        const {
          client,
          localVideoTrack,
          localAudioTrack,
          hasVideo,
          hasAudio
        } = await initAgora(channel);

        clientRef.current = client;

        // Store new tracks
        if (localVideoTrack) localTracks.push(localVideoTrack);
        if (localAudioTrack) localTracks.push(localAudioTrack);

        setCallState(prev => ({
          ...prev,
          hasLocalVideo: hasVideo,
          hasLocalAudio: hasAudio,
          isInitializing: false
        }));

        // Play local video
        if (hasVideo && localVideoRef.current) {
          localVideoTrack.play(localVideoRef.current).catch(e => {
            console.error("Local video play failed:", e);
            setCallState(prev => ({ ...prev, hasLocalVideo: false }));
          });
        }

        // Handle remote users
        const handleUserPublished = async (user, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
            remoteUsers.push(user);

            if (mediaType === "video" && user.videoTrack) {
              if (remoteVideoRef.current) {
                user.videoTrack.play(remoteVideoRef.current).catch(e => {
                  console.error("Remote video play failed:", e);
                });
              }
              setCallState(prev => ({
                ...prev,
                hasRemoteVideo: true,
                remoteUserId: user.uid
              }));
            }

            if (mediaType === "audio" && user.audioTrack) {
              user.audioTrack.play().catch(e => {
                console.error("Remote audio play failed:", e);
              });
              setCallState(prev => ({
                ...prev,
                hasRemoteAudio: true
              }));
            }
          } catch (err) {
            console.error("Subscription error:", err);
          }
        };

        const handleUserUnpublished = (user, mediaType) => {
          if (mediaType === "video") {
            setCallState(prev => ({
              ...prev,
              hasRemoteVideo: false,
              remoteUserId: null
            }));
          }
          if (mediaType === "audio") {
            setCallState(prev => ({ ...prev, hasRemoteAudio: false }));
          }
        };

        client.on("user-published", handleUserPublished);
        client.on("user-unpublished", handleUserUnpublished);

        // Handle connection changes
        client.on("connection-state-change", (state) => {
          if (state === "DISCONNECTED") {
            setCallState(prev => ({
              ...prev,
              error: "Connection lost",
              hasRemoteVideo: false,
              hasRemoteAudio: false
            }));
          }
        });

      } catch (err) {
        console.error("Call setup failed:", err);
        setCallState(prev => ({
          ...prev,
          isInitializing: false,
          error: err.message
        }));
      }
    };

    startCall();

    return () => {
      const cleanup = async () => {
        // Cleanup remote users
        if (clientRef.current) {
          remoteUsers.forEach(user => {
            try {
              clientRef.current.unsubscribe(user);
            } catch (e) {
              console.warn("Unsubscribe error:", e);
            }
          });
          remoteUsers = [];
        }

        // Cleanup local tracks
        localTracks.forEach(track => {
          try {
            track.stop();
            track.close();
          } catch (e) {
            console.warn("Track cleanup error:", e);
          }
        });
        localTracks = [];
        
        // Leave Agora session
        await leaveAgora();
      };
      cleanup();
    };
  }, [channel]);

  const handleEndCall = async () => {
    await leaveAgora();
    router.push("/");
  };

  return (
    <div className="call-container">
      <h1>Video Call: {channel}</h1>
      
      {callState.error && (
        <div className="error-message">
          Error: {callState.error}
        </div>
      )}

      <div className="video-grid">
        <div className="video-container local">
          <h2>You ({callState.hasLocalVideo ? "Video On" : "Video Off"})</h2>
          <div
            ref={localVideoRef}
            className={`video-placeholder ${callState.hasLocalVideo ? "active" : ""}`}
          >
            {!callState.hasLocalVideo && (
              <div className="placeholder-text">
                {callState.devices.hasCamera ? "Camera loading..." : "Camera unavailable"}
              </div>
            )}
          </div>
        </div>

        <div className="video-container remote">
          <h2>
            Remote {callState.remoteUserId ? `(User ${callState.remoteUserId})` : "(Waiting...)"}
          </h2>
          <div
            ref={remoteVideoRef}
            className={`video-placeholder ${callState.hasRemoteVideo ? "active" : ""}`}
          >
            {!callState.hasRemoteVideo && (
              <div className="placeholder-text">
                Waiting for remote user...
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="call-controls">
        <button 
          onClick={handleEndCall}
          disabled={callState.isInitializing}
          className="end-call-button"
        >
          {callState.isInitializing ? "Connecting..." : "End Call"}
        </button>
      </div>

      <style jsx>{`
        .call-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .error-message {
          color: #ff4444;
          margin-bottom: 20px;
          padding: 10px;
          background: #ffeeee;
          border-radius: 4px;
        }
        .video-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 20px;
        }
        .video-container {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 15px;
          background: #f9f9f9;
        }
        .video-placeholder {
          width: 100%;
          aspect-ratio: 16/9;
          background: #000;
          position: relative;
        }
        .video-placeholder.active {
          background: transparent;
        }
        .placeholder-text {
          color: white;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .call-controls {
          margin-top: 30px;
          text-align: center;
        }
        .end-call-button {
          padding: 12px 24px;
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .end-call-button:hover {
          background: #cc0000;
        }
        .end-call-button:disabled {
          background: #aaaaaa;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}