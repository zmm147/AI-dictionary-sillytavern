(() => {
  const DEFAULT_CONFIG = {
    endpointUrl: "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0",
    voiceDecodeKey: "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==",
    clientVersion: "4.0.530a 5fe1dc6c",
    userId: "0f04d16a175c411e",
    homeGeographicRegion: "zh-Hans-CN",
    clientTraceId: "aab069b9-70a7-4844-a734-96cd78d94be9",
    userAgent: "okhttp/4.5.0",
    voiceName: "en-US-JennyNeural",
    language: "en-US",
    rate: "0",
    pitch: "0",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    style: "general",
    enableCache: true
  };

  const base64ToBytes = (base64) =>
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

  const bytesToBase64 = (bytes) =>
    btoa(String.fromCharCode(...bytes));

  const base64UrlToBase64 = (value) => {
    let output = value.replace(/-/g, "+").replace(/_/g, "/");
    while (output.length % 4) {
      output += "=";
    }
    return output;
  };

  const createUuid = () => {
    if (crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  };

  const escapeXml = (text) =>
    String(text).replace(/[<>&"']/g, (char) => {
      switch (char) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "\"":
          return "&quot;";
        case "'":
          return "&apos;";
        default:
          return char;
      }
    });

  const createTtsClient = (options = {}) => {
    const config = { ...DEFAULT_CONFIG, ...options };
    const ttsState = {
      token: "",
      region: "",
      expiresAt: 0
    };
    const audioCache = new Map();

    const sign = async (urlStr) => {
      const urlPart = urlStr.split("://")[1];
      const encodedUrl = encodeURIComponent(urlPart);
      const uuidStr = createUuid();
      const formattedDate = new Date().toUTCString().toLowerCase();
      const bytesToSign =
        `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();

      const keyBytes = base64ToBytes(config.voiceDecodeKey);
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(bytesToSign)
      );
      const signatureBase64 = bytesToBase64(new Uint8Array(signature));
      return `MSTranslatorAndroidApp::${signatureBase64}::${formattedDate}::${uuidStr}`;
    };

    const getEndpoint = async () => {
      const now = Math.floor(Date.now() / 1000);
      if (ttsState.token && now < ttsState.expiresAt - 60) {
        return ttsState;
      }

      const signature = await sign(config.endpointUrl);
      const response = await fetch(config.endpointUrl, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-Hans",
          "X-ClientVersion": config.clientVersion,
          "X-UserId": config.userId,
          "X-HomeGeographicRegion": config.homeGeographicRegion,
          "X-ClientTraceId": config.clientTraceId,
          "X-MT-Signature": signature,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

      if (!response.ok) {
        throw new Error("endpoint_failed");
      }

      const data = await response.json();
      const jwtPart = data.t.split(".")[1] || "";
      const payload = JSON.parse(atob(base64UrlToBase64(jwtPart)));
      ttsState.token = data.t;
      ttsState.region = data.r;
      ttsState.expiresAt = payload.exp || 0;
      return ttsState;
    };

    const buildSsml = (text) => `
<speak xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="http://www.w3.org/2001/mstts"
       version="1.0"
       xml:lang="${config.language}">
  <voice name="${config.voiceName}">
    <mstts:express-as style="${config.style}" styledegree="1.0" role="default">
      <prosody rate="${config.rate}%" pitch="${config.pitch}%">
        ${escapeXml(text)}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;

    const getVoiceBuffer = async (text) => {
      const endpoint = await getEndpoint();
      const url = `https://${endpoint.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: endpoint.token,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": config.outputFormat
        },
        body: buildSsml(text)
      });

      if (!response.ok) {
        throw new Error("tts_failed");
      }

      return response.arrayBuffer();
    };

    const clearCache = (cacheKey) => {
      if (!config.enableCache) return;
      if (cacheKey) {
        const url = audioCache.get(cacheKey);
        if (url) {
          URL.revokeObjectURL(url);
          audioCache.delete(cacheKey);
        }
        return;
      }
      for (const url of audioCache.values()) {
        URL.revokeObjectURL(url);
      }
      audioCache.clear();
    };

    const getAudioUrl = async (text, cacheKey = text) => {
      if (!config.enableCache) {
        const buffer = await getVoiceBuffer(text);
        return URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
      }
      const existing = audioCache.get(cacheKey);
      if (existing) return existing;
      const buffer = await getVoiceBuffer(text);
      const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
      audioCache.set(cacheKey, url);
      return url;
    };

    const playText = async (audioElement, text, cacheKey = text) => {
      const url = await getAudioUrl(text, cacheKey);
      audioElement.pause();
      audioElement.src = url;
      return audioElement.play();
    };

    return {
      config,
      getEndpoint,
      getVoiceBuffer,
      getAudioUrl,
      playText,
      clearCache
    };
  };

  window.CkTts = {
    createTtsClient
  };
})();
