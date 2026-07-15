// Neural TTS proxy: turns gage text into natural-sounding speech via Azure
// Cognitive Services. The subscription key stays server-side (app settings
// SPEECH_KEY / SPEECH_REGION) and is never exposed to the browser.
//
// Configure in the Static Web App -> Configuration (Application settings):
//   SPEECH_KEY     = <your Azure Speech resource key>
//   SPEECH_REGION  = <its region, e.g. "westeurope">
//   SPEECH_VOICE   = <optional, default fr-FR-DeniseNeural>

const DEFAULT_VOICE = "fr-FR-DeniseNeural";
const MAX_CHARS = 1000; // guard against abuse / runaway cost

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

module.exports = async function (context, req) {
  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  if (!key || !region) {
    // Not configured yet — the client falls back to the browser voice.
    context.res = { status: 503, body: "TTS not configured" };
    return;
  }

  let text = req.body && req.body.text;
  if (typeof text !== "string" || !text.trim()) {
    context.res = { status: 400, body: "missing text" };
    return;
  }
  text = text.slice(0, MAX_CHARS);
  const voice = (req.body && req.body.voice) || process.env.SPEECH_VOICE || DEFAULT_VOICE;

  const ssml =
    "<speak version='1.0' xml:lang='fr-FR'>" +
    "<voice name='" + voice + "'>" + xmlEscape(text) + "</voice></speak>";

  try {
    const r = await fetch(
      "https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1",
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "donne-moi-un-gage",
        },
        body: ssml,
      }
    );
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      context.res = { status: 502, body: "tts upstream " + r.status + " " + detail };
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    context.res = {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      body: buf,
      isRaw: true,
    };
  } catch (e) {
    context.res = { status: 502, body: "tts error: " + e.message };
  }
};
