# Powerlifting & Computer Vision

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-00B4D8?style=for-the-badge)

Web application mobile first per l'analisi cinematica e il riconoscimento automatico di ripetizioni valide negli esercizi Squat, Stacco da terra e Pressa militare. L'app usa MediaPipe Pose direttamente nel browser e non invia frame video a server esterni.

![Application Preview](./docs/screenshot.png)

## Descrizione

Il sistema stima 33 landmark corporei tramite MediaPipe Pose, calcola gli angoli articolari rilevanti e usa una macchina a stati finiti per classificare ogni ripetizione come `VALID_REP` o `NO_REP`. L'obiettivo è fornire un prototipo riproducibile per tesi, demo e analisi qualitativa dell'esecuzione.

## Architettura

Il progetto è diviso in moduli principali:

* **Interfaccia (`App.jsx`):** selezione esercizio, target ripetizioni, accesso alla fotocamera, caricamento video e download della registrazione.
* **Computer vision (`usePose.js`):** inizializza MediaPipe Pose, gestisce inferenza video/camera, stabilizzazione landmark e controllo dei landmark critici.
* **Logica di validazione (`repLogic.js`):** implementa la FSM dei movimenti (`STANDING`, `DESCENDING`, `ASCENDING`, `SETUP`, `LIFTING`) e calcola gli angoli con vettori bidimensionali.
* **Rendering (`canvasRenderer.js`):** disegna frame video, esoscheletro, HUD, conteggio rep e messaggi di validazione sul canvas.
* **Registrazione (`useVideoRecorder.js`):** registra il canvas a 30 FPS, salva chunk periodici e scarica il formato video realmente prodotto dal browser.

## Regole Implementate

### Landmark e occlusione

* Ogni esercizio definisce solo i landmark necessari alla validazione tramite `requiredLandmarks`.
* Il controllo di visibilità usa isteresi: un landmark entra nello stato valido sopra `VISIBILITY_THRESHOLD` e ne esce sotto `VISIBILITY_EXIT_THRESHOLD`.
* Le coordinate dei landmark con bassa confidenza vengono congelate temporaneamente tramite `LANDMARK_FREEZE_VISIBILITY`, evitando jitter quando dischi o bilanciere coprono le articolazioni.
* La `validationVisibility` è separata dalla `visibility` usata per disegnare lo scheletro, così la logica resta stabile senza mascherare graficamente l'incertezza del tracking.

### Squat

* Landmark principali: anca, ginocchio, caviglia.
* La rep parte quando il ginocchio scende sotto la soglia di movimento.
* La profondità è valida quando l'angolo del ginocchio raggiunge `bottomKnee`.
* La ripetizione viene chiusa in risalita quando il ginocchio torna sopra `topKnee`.

### Stacco da terra

* Landmark principali: anca, ginocchio, caviglia; la spalla può essere stimata o recuperata dal lato opposto in caso di occlusione.
* La rep è valida quando anca e ginocchio raggiungono il lockout.
* Il cooldown evita doppi conteggi nella stessa alzata.

### Pressa militare

* Landmark principali: spalla, polso, anca, ginocchio e caviglia; il gomito può essere stimato in caso di occlusione.
* La rep è riconosciuta quando il movimento passa da discesa a risalita e raggiunge l'estensione del gomito.
* In presenza di occlusione del disco, il lockout può essere accettato con soglia gomito più permissiva se il polso risulta sopra la spalla.

## Avvio Locale

Serve [Node.js](https://nodejs.org/).

```bash
npm install
npm run dev
```

Verifica produzione:

```bash
npm run lint
npm run build
```

## Uso

### Modalità di acquisizione

1. **Fotocamera:** usa webcam o camera mobile, con timer iniziale configurabile.
2. **Carica video:** analizza file `.mp4`, `.webm` o `.mov` già registrati.

### Feedback visivo

Durante l'analisi il canvas mostra video, esoscheletro, angolo corrente e ripetizioni valide. Il punto articolare principale diventa verde quando viene raggiunto il target geometrico dell'esercizio.

Il video esportato viene registrato dal canvas a `RECORDING_FPS` e scaricato nel formato effettivo supportato dal browser, evitando rinomine non reali tra WebM e MP4.

## Contesto Accademico

Progetto sviluppato per la tesi di Laurea Triennale in Informatica.

**Università degli Studi di Firenze**  
Anno Accademico 2025/2026

* **Studente:** Lorenzo Napolitano - lorenzo.napolitano@edu.unifi.it
* **Relatore:** Michele Ginolfi - michele.ginolfi@unifi.it
