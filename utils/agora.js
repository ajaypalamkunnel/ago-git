import AgoraRTC from "agora-rtc-sdk-ng";

let client = null;
let localAudioTrack = null;
let localVideoTrack = null;

export const checkDevicePermissions = async () => {
  try {
    const [cameras, microphones] = await Promise.all([
      AgoraRTC.getCameras(),
      AgoraRTC.getMicrophones()
    ]);
    return {
      hasCamera: cameras.length > 0,
      hasMicrophone: microphones.length > 0
    };
  } catch (error) {
    console.error("Device permission check failed:", error);
    return {
      hasCamera: false,
      hasMicrophone: false
    };
  }
};

const createTrackWithRetry = async (creatorFn, retries = 2) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await creatorFn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

export const initAgora = async (channelName) => {
  try {
    if (!channelName) throw new Error("Channel name is required");

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!appId) throw new Error("Missing Agora App ID");

    // Check device permissions
    const { hasCamera, hasMicrophone } = await checkDevicePermissions();
    if (!hasCamera && !hasMicrophone) {
      throw new Error("No media devices available");
    }

    // Fetch token
    const tokenRes = await fetch(`/api/agora-token?channelName=${channelName}`);
    if (!tokenRes.ok) throw new Error("Failed to fetch token");
    const { token } = await tokenRes.json();

    // Create new client instance
    const newClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    // Clean up previous connection if exists
    if (client) {
      await leaveAgora();
    }

    client = newClient;

    // Add connection state listener
    client.on("connection-state-change", (state, prevState, reason) => {
      console.log(`Connection state: ${prevState} => ${state} (${reason})`);
    });

    // Join channel
    const uid = await client.join(appId, channelName, token, null);
    console.log(`Joined channel ${channelName} with UID ${uid}`);

    // Create tracks
    let audioTrackCreated = false;
    let videoTrackCreated = false;

    if (hasMicrophone) {
      try {
        localAudioTrack = await createTrackWithRetry(() => 
          AgoraRTC.createMicrophoneAudioTrack()
        );
        audioTrackCreated = true;
      } catch (audioError) {
        console.warn("Audio track creation failed:", audioError);
      }
    }

    if (hasCamera) {
      try {
        localVideoTrack = await createTrackWithRetry(() =>
          AgoraRTC.createCameraVideoTrack({
            encoderConfig: "720p_1",
            optimizationMode: "detail"
          })
        );
        videoTrackCreated = true;
      } catch (videoError) {
        console.warn("Video track creation failed:", videoError);
      }
    }

    // Prepare tracks for publishing
    const tracksToPublish = [];
    if (audioTrackCreated && localAudioTrack) tracksToPublish.push(localAudioTrack);
    if (videoTrackCreated && localVideoTrack) tracksToPublish.push(localVideoTrack);

    if (tracksToPublish.length === 0) {
      throw new Error("Could not initialize any media tracks");
    }

    // Publish tracks in one operation
    await client.publish(tracksToPublish);
    console.log(`Published ${tracksToPublish.length} track(s)`);

    return {
      client,
      localAudioTrack,
      localVideoTrack,
      hasAudio: audioTrackCreated,
      hasVideo: videoTrackCreated,
      uid
    };

  } catch (err) {
    console.error("Agora initialization failed:", err);
    await leaveAgora();
    throw err;
  }
};

export const leaveAgora = async () => {
  try {
    // Unpublish tracks first
    if (client) {
      try {
        const localTracks = [];
        if (localAudioTrack) localTracks.push(localAudioTrack);
        if (localVideoTrack) localTracks.push(localVideoTrack);
        
        if (localTracks.length > 0) {
          await client.unpublish(localTracks);
        }
      } catch (unpublishError) {
        console.warn("Unpublish error:", unpublishError);
      }
      
      try {
        await client.leave();
      } catch (leaveError) {
        console.warn("Leave error:", leaveError);
      }
    }

    // Cleanup tracks
    if (localAudioTrack) {
      try {
        localAudioTrack.stop();
        localAudioTrack.close();
      } catch (audioError) {
        console.warn("Audio track cleanup error:", audioError);
      }
    }

    if (localVideoTrack) {
      try {
        localVideoTrack.stop();
        localVideoTrack.close();
      } catch (videoError) {
        console.warn("Video track cleanup error:", videoError);
      }
    }

  } finally {
    // Reset references
    client = null;
    localAudioTrack = null;
    localVideoTrack = null;
    console.log("Agora resources cleaned up");
  }
};