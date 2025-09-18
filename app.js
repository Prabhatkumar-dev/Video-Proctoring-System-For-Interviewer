(async () => {
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const ctx = overlay.getContext("2d");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const logEl = document.getElementById("log");
  const status = document.getElementById("status");
  const downloadCsv = document.getElementById("downloadCsv");
  const downloadPdf = document.getElementById("downloadPdf");
  const sessionTimeEl = document.getElementById("sessionTime");
  const candidateNameInput = document.getElementById("candidateName");
  const focusCountEl = document.getElementById("focusCount");
  const suspCountEl = document.getElementById("suspCount");
  const interviewerAlerts = document.getElementById("interviewerAlerts");

  let mediaStream = null, recorder = null, chunks = [];
  let running = false, logs = [], sessionStart = null, timerInterval = null;
  let focusLostCount = 0, suspCount = 0;
  let lookingAwayStart = null, lastFaceSeenAt = Date.now(), lastLookingAwayAt = null;

  // Audio detection vars
  let audioCtx = null, analyser = null, micStream = null, audioInterval = null, noiseCounter = 0;

  const LOOK_AWAY_THRESHOLD = 5000;
  const NO_FACE_THRESHOLD = 6000;
  const OBJ_CONFIDENCE = 0.5;
  const SUSPICIOUS_CLASSES = new Set(["cell phone","book","laptop","tv","tablet","keyboard","mouse","remote"]);

  status.textContent = "Loading COCO-SSD...";
  const objModel = await cocoSsd.load();
  status.textContent = "Models loaded ✅";

  function addLog(text) {
    const ts = new Date();
    logs.push({ time: ts.toISOString(), text });

    const div = document.createElement("div");
    div.className = "logItem" + (text.includes("⚠️") ? " warning" : "");
    div.innerHTML = `<strong>[${ts.toLocaleTimeString()}]</strong> ${text}`;
    logEl.insertBefore(div, logEl.children[1] || null);

    if (text.includes("⚠️")) {
      showAlert(text);
      addInterviewerAlert(text);
    }
  }

  function addInterviewerAlert(msg) {
    const p = document.createElement("p");
    p.textContent = msg;
    interviewerAlerts.insertBefore(p, interviewerAlerts.firstChild);
  }

  function showAlert(message) {
    const alertBox = document.getElementById("customAlert");
    const alertMsg = document.getElementById("alertMessage");
    alertMsg.textContent = message;
    alertBox.classList.add("show");
    const beep = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    beep.play();
    setTimeout(() => { alertBox.classList.remove("show"); }, 4000);
  }

  function pad(n){return n<10?"0"+n:n;}
  function formatDuration(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return `${pad(m)}:${pad(s%60)}`;}

  const faceMesh = new FaceMesh({locateFile:(f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`});
  faceMesh.setOptions({maxNumFaces:2,refineLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});

  faceMesh.onResults(results=>{
    ctx.clearRect(0,0,overlay.width,overlay.height);
    ctx.drawImage(video,0,0,overlay.width,overlay.height);

    const now=Date.now();
    if(!results.multiFaceLandmarks || results.multiFaceLandmarks.length===0){
      if(now-lastFaceSeenAt>NO_FACE_THRESHOLD){
        addLog("⚠️ No face detected for >6s");
        focusLostCount++; focusCountEl.textContent = focusLostCount;
        lastFaceSeenAt=now;
      }
      return;
    }
    lastFaceSeenAt=now;

    if(results.multiFaceLandmarks.length>1){
      addLog("⚠️ Multiple faces detected");
      suspCount++; suspCountEl.textContent = suspCount;
    }

    // ✅ Improved looking away detection
    const lm = results.multiFaceLandmarks[0];
    const leftEye = lm[33], rightEye = lm[263], nose = lm[1];
    const faceWidth = Math.abs((rightEye.x - leftEye.x) * overlay.width);
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const dx = Math.abs((nose.x - eyeMidX) * overlay.width);

    if (dx > faceWidth * 0.15) { // 15% deviation → looking away
      if (!lookingAwayStart) lookingAwayStart = now;
      if (now - lookingAwayStart > LOOK_AWAY_THRESHOLD &&
          (!lastLookingAwayAt || now - lastLookingAwayAt > LOOK_AWAY_THRESHOLD)) {
        addLog("⚠️ User looking away >5s");
        focusLostCount++; focusCountEl.textContent = focusLostCount;
        lastLookingAwayAt = now;
      }
    } else {
      lookingAwayStart = null;
    }
  });

  const camera=new Camera(video,{onFrame:async()=>{ if(running) await faceMesh.send({image:video}); },width:480,height:360});

  let objInterval=null;
  async function runObjectDetection(){
    if(!running) return;
    const objs=await objModel.detect(video);
    objs.forEach(o=>{
      if(o.score<OBJ_CONFIDENCE) return;
      const [x,y,w,h]=o.bbox;
      ctx.strokeStyle="#FF0066"; ctx.strokeRect(x,y,w,h);
      ctx.fillStyle="#FF0066"; ctx.fillText(`${o.class} ${Math.round(o.score*100)}%`,x+4,y+12);
      if(SUSPICIOUS_CLASSES.has(o.class)){
        addLog(`⚠️ Suspicious object: ${o.class}`);
        suspCount++; suspCountEl.textContent = suspCount;
      }
    });
  }

  // ✅ Audio detection loop (3 intervals ≈ 9s)
  function startAudioDetection() {
    audioInterval = setInterval(() => {
      const dataArray = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        let val = (dataArray[i] - 128) / 128.0;
        sum += val * val;
      }
      let rms = Math.sqrt(sum / dataArray.length);
      if (rms > 0.05) {
        noiseCounter++;
        if (noiseCounter >= 3) {
          addLog("⚠️ Suspicious audio detected (voices/noise)");
          suspCount++; suspCountEl.textContent = suspCount;
          noiseCounter = 0;
        }
      } else {
        noiseCounter = 0;
      }
    }, 3000);
  }

  startBtn.addEventListener("click",async()=>{
    if(running) return;
    mediaStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    video.srcObject=mediaStream; await video.play();
    chunks=[]; recorder=new MediaRecorder(mediaStream,{mimeType:"video/webm"});
    recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data); recorder.start(1000);

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    source.connect(analyser);
    startAudioDetection();

    running=true; sessionStart=Date.now(); focusLostCount=0; suspCount=0; logs=[];
    focusCountEl.textContent=suspCountEl.textContent=0;
    addLog(`✅ Session started: ${candidateNameInput.value||"Unknown"}`);
    startBtn.disabled=true; stopBtn.disabled=false; downloadCsv.disabled=downloadPdf.disabled=true;
    timerInterval=setInterval(()=>{sessionTimeEl.textContent=formatDuration(Date.now()-sessionStart);},500);
    camera.start(); objInterval=setInterval(runObjectDetection,1500);
  });

  stopBtn.addEventListener("click",()=>{
    if(!running) return; running=false;
    recorder.stop(); clearInterval(timerInterval); clearInterval(objInterval); camera.stop();
    if (audioInterval) clearInterval(audioInterval);
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (audioCtx) audioCtx.close();
    stopBtn.disabled=true; startBtn.disabled=false; downloadCsv.disabled=downloadPdf.disabled=false;
    addLog("⛔ Session stopped."); if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:"video/webm"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=(candidateNameInput.value||"candidate")+"_session.webm";
    a.textContent="⬇️ Download recorded video"; a.style.display="block"; logEl.appendChild(a);
  });

  downloadCsv.addEventListener("click",()=>{
    const name=candidateNameInput.value||"Unknown"; const duration=Date.now()-sessionStart;
    const header="candidate,duration_sec,time_iso,event\n";
    const rows=logs.map(l=>`${JSON.stringify(name)},${Math.floor(duration/1000)},${l.time},${JSON.stringify(l.text)}`).join("\n");
    const blob=new Blob([header+rows],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=name+"_report.csv"; a.click();
  });

  downloadPdf.addEventListener("click",()=>{
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    const name=candidateNameInput.value||"Unknown"; const duration=formatDuration(Date.now()-sessionStart);
    doc.setFontSize(14); doc.text("Proctoring Report",14,18);
    doc.setFontSize(11);
    doc.text(`Candidate: ${name}`,14,30);
    doc.text(`Duration: ${duration}`,14,38);
    doc.text(`Focus lost: ${focusLostCount}`,14,46);
    doc.text(`Suspicious events: ${suspCount}`,14,54);
    doc.setFontSize(10); doc.text("Event Logs:",14,68);
    let y=76; logs.forEach(l=>{if(y<280){doc.text(`[${new Date(l.time).toLocaleTimeString()}] ${l.text}`,14,y);y+=6;}});
    doc.save(name+"_report.pdf");
  });

  addLog("Ready ✅ Click Start Session.");
})();
