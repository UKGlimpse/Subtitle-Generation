const apiKeyInput = document.getElementById("apiKey");
const languageInput = document.getElementById("language");
const temperatureInput = document.getElementById("temperature");
const videoInput = document.getElementById("videoInput");
const video = document.getElementById("video");
const generateBtn = document.getElementById("generateBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progressBar");
const subtitleOutput = document.getElementById("subtitleOutput");
const downloadLink = document.getElementById("downloadLink");
const downloadHint = document.getElementById("downloadHint");
const copyBtn = document.getElementById("copyBtn");
const videoStatus = document.getElementById("videoStatus");

let mediaRecorder = null;
let recordedChunks = [];
let currentTrackUrl = null;
let progressTimer = null;

const setStatus = (message) => {
  statusEl.textContent = message;
};

const setProgress = (value) => {
  progressBar.style.width = `${value}%`;
};

const resetOutput = () => {
  subtitleOutput.value = "";
  downloadLink.href = "#";
  downloadLink.setAttribute("aria-disabled", "true");
  copyBtn.disabled = true;
  downloadHint.textContent = "Generate subtitles to enable download.";
  if (currentTrackUrl) {
    URL.revokeObjectURL(currentTrackUrl);
    currentTrackUrl = null;
  }
  const existingTrack = video.querySelector("track");
  if (existingTrack) {
    existingTrack.remove();
  }
};

const updateButtonState = () => {
  const hasVideo = Boolean(video.src);
  const hasKey = apiKeyInput.value.trim().length > 0;
  generateBtn.disabled = !(hasVideo && hasKey);
};

const createTrack = (vttText) => {
  const blob = new Blob([vttText], { type: "text/vtt" });
  currentTrackUrl = URL.createObjectURL(blob);
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = "Generated";
  track.srclang = languageInput.value.trim() || "en";
  track.src = currentTrackUrl;
  track.default = true;
  video.appendChild(track);
  downloadLink.href = currentTrackUrl;
  downloadLink.setAttribute("aria-disabled", "false");
  copyBtn.disabled = false;
  downloadHint.textContent = "Subtitle file ready to download.";
};

const startProgressPulse = () => {
  let value = 0;
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    value = (value + 7) % 100;
    setProgress(value);
  }, 200);
};

const stopProgressPulse = () => {
  clearInterval(progressTimer);
  progressTimer = null;
  setProgress(0);
};

const captureAudio = async () => {
  if (!video.src) {
    throw new Error("Please upload a video first.");
  }

  const stream = video.captureStream();
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    throw new Error("No audio track detected in this video.");
  }

  const audioStream = new MediaStream(audioTracks);
  recordedChunks = [];

  mediaRecorder = new MediaRecorder(audioStream, {
    mimeType: "audio/webm",
  });

  return new Promise((resolve, reject) => {
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = () => reject(new Error("Failed to record audio."));

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(recordedChunks, { type: "audio/webm" });
      resolve(audioBlob);
    };

    mediaRecorder.start(200);
  });
};

const transcribeAudio = async (audioBlob) => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    throw new Error("Missing API key.");
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("response_format", "vtt");

  const language = languageInput.value.trim();
  if (language) {
    formData.append("language", language);
  }

  const temperature = temperatureInput.value.trim();
  if (temperature) {
    formData.append("temperature", temperature);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcription failed: ${errorText}`);
  }

  return response.text();
};

const generateSubtitles = async () => {
  try {
    resetOutput();
    setStatus("Capturing audio. The video will play automatically.");
    generateBtn.disabled = true;
    stopBtn.disabled = false;
    startProgressPulse();

    await video.play();

    const audioPromise = captureAudio();
    video.onended = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    };

    const audioBlob = await audioPromise;
    setStatus("Uploading audio and generating subtitles...");

    const vttText = await transcribeAudio(audioBlob);
    subtitleOutput.value = vttText;
    createTrack(vttText);
    setStatus("Subtitles generated successfully.");
  } catch (error) {
    setStatus(error.message);
  } finally {
    stopBtn.disabled = true;
    updateButtonState();
    stopProgressPulse();
  }
};

videoInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  resetOutput();
  const url = URL.createObjectURL(file);
  video.src = url;
  video.load();
  videoStatus.textContent = `Loaded: ${file.name}`;
  updateButtonState();
});

apiKeyInput.addEventListener("input", updateButtonState);

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    video.pause();
    setStatus("Recording stopped. Processing audio...");
  }
  stopBtn.disabled = true;
});

generateBtn.addEventListener("click", generateSubtitles);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(subtitleOutput.value);
    setStatus("Subtitle text copied to clipboard.");
  } catch (error) {
    setStatus("Unable to copy subtitles.");
  }
});

video.addEventListener("pause", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
  }
});

video.addEventListener("play", () => {
  if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
  }
});
