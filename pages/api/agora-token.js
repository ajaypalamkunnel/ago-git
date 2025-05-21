// pages/api/agora-token.js

import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export default function handler(req, res) {
  const { channelName, uid } = req.query;

  if (!channelName) {
    return res.status(400).json({ error: 'channelName is required' });
  }

  const appID = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  const expirationTimeInSeconds = 3600; // 1 hour
  const role = RtcRole.PUBLISHER;
  const uidOrZero = uid || 0;

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appID,
    appCertificate,
    channelName,
    uidOrZero,
    role,
    privilegeExpiredTs
  );

  return res.status(200).json({ token });
}
