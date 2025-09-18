# 🎥 Video Proctoring System and Focus\Object Detection in Video Interviews

## 📌 Objective
This project is a *video proctoring system* designed for online interviews.  
It detects whether a candidate is focused and flags unauthorized items in real-time.

---

## 🚀 Features
- 🔴 *Focus Detection*
  - Detects if candidate is not looking at the screen for more than 5 seconds.
  - Detects absence of face for more than 10 seconds.
  - Detects multiple faces in frame.
  - Logs all events with timestamps.

- 📱 *Object Detection*
  - Detects mobile phones.
  - Detects books/paper notes.
  - Detects extra electronic devices.
  - Flags and logs suspicious events.

- 📊 *Reporting*
  - Candidate name, interview duration.
  - Number of times focus lost.
  - Suspicious events log.
  - Integrity score = 100 – deductions.

- ⚙ *Backend (Optional)*
  - Store logs in MongoDB/MySQL/Firebase.
  - API to fetch reports.

- 🎁 *Bonus Features *
  - Eye closure / drowsiness detection.
  - Real-time alerts for interviewer. (Implemented)
  - Background audio detection.       (Implemented)

---

## 🛠 Tech Stack
- *Frontend:* HTML, CSS, JavaScript (Interview Screen)
- *Computer Vision:* OpenCV, MediaPipe, TensorFlow.js
- *Object Detection:* YOLO / TensorFlow.js
- *Backend (Optional):* Node.js + Express / Firebase / MongoDB
- *Reporting:* PDF/CSV generation

---

## ⚡ Installation & Setup


### For running in Vs Code : 
1>  Run a local server (do not open via file://): [ follow step 2 and 3 ]
2>  For Python: {Run ->} python -m http.server 8000
    or 
    For Node:  {Run -> } npx http-server .
3>  Open http://localhost:8000/index.html in Chrome or Edge (recommended).
4>  Allow the browser to access Camera and Microphone when prompted.

### ⿡ Clone the Repository
```bash
git clone https://github.com/<username>/<repo-name>.git
cd <repo-name>
 




