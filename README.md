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
* **Computer vision (`usePose.js`):** inizializza MediaPipe Pose, seleziona l'atleta e il lato da seguire, gestisce inferenza video/camera, stabilizzazione dei landmark e controllo delle articolazioni critiche.
* **Logica di validazione (`repLogic.js`):** implementa una macchina a stati specifica per ogni esercizio e calcola gli angoli articolari con vettori bidimensionali.
* **Rendering (`canvasRenderer.js`):** disegna frame video, esoscheletro, HUD, conteggio rep e messaggi di validazione sul canvas.
* **Registrazione (`useVideoRecorder.js`):** registra il canvas a 30 FPS, salva chunk periodici e scarica il formato video realmente prodotto dal browser.

## Regole Implementate

### Selezione dell'atleta e del lato

* MediaPipe può rilevare fino a due pose. Il sistema sceglie inizialmente il soggetto con la maggiore area corporea visibile e mantiene la sua identità in base alla continuità spaziale tra i frame.
* Gli spostamenti incompatibili con la posizione precedente vengono scartati, riducendo il rischio che il tracking passi a un'altra persona presente nell'inquadratura.
* Il lato del corpo viene scelto usando soltanto i landmark richiesti dall'esercizio e un'isteresi che evita cambi frequenti tra sinistra e destra.
* Durante una ripetizione di squat il lato rimane bloccato fino alla conclusione del tentativo.

### Landmark, visibilità e smoothing

* Ogni esercizio definisce solo i landmark necessari alla validazione tramite `requiredLandmarks`.
* Il controllo di visibilità usa isteresi: un landmark entra nello stato valido sopra `VISIBILITY_THRESHOLD` e ne esce sotto `VISIBILITY_EXIT_THRESHOLD`.
* Le coordinate dei landmark con bassa confidenza vengono congelate temporaneamente tramite `LANDMARK_FREEZE_VISIBILITY`, evitando jitter quando dischi o bilanciere coprono le articolazioni.
* Un evento di conteggio richiede visibilità reale sufficiente e landmark non congelati: i dati ricostruiti durante un'occlusione possono mantenere stabile lo stato, ma non generare ripetizioni fantasma.
* La logica di conteggio e il disegno usano due flussi di smoothing separati. L'esoscheletro riceve un filtro aggiuntivo che ne riduce il jitter senza rallentare il riconoscimento del movimento.
* Se la pose rimane assente, lo scheletro viene nascosto dopo pochi frame e lo stato di tracking viene poi azzerato, evitando disegni residui sullo sfondo.

### Squat

* Landmark principali: anca, ginocchio, caviglia.
* Prima del conteggio è richiesta una posizione eretta stabile. Gli spostamenti iniziali, il walkout e l'unrack non vengono interpretati come tentativi.
* La rep parte quando il ginocchio scende sotto la soglia di movimento dopo l'armamento iniziale.
* La profondità è valida quando l'angolo del ginocchio raggiunge `bottomKnee`.
* La ripetizione viene chiusa soltanto dopo un ritorno stabile sopra `topKnee` accompagnato da una risalita coerente dell'anca.
* Lo stato viene resettato e riarmato dopo la chiusura, impedendo che la permanenza in buca o il rerack producano doppi conteggi o no-rep fantasma.

### Stacco da terra

* Landmark principali: anca, ginocchio, caviglia; la spalla può essere stimata o recuperata dal lato opposto in caso di occlusione.
* La rep è valida quando anca e ginocchio raggiungono il lockout.
* Il cooldown evita doppi conteggi nella stessa alzata.

### Pressa militare

* Landmark principali: spalla, gomito e polso.
* Una ripetizione viene preparata quando il gomito raggiunge la posizione bassa; il lockout richiede estensione del gomito, polso sopra la spalla e sufficiente escursione verticale del polso.
* Spalla, gomito e polso devono essere realmente visibili per avanzare lo stato e generare un conteggio. Se un disco li copre, la macchina a stati conserva il tentativo ma non può contare una rep.
* Quando i landmark tornano visibili, un lockout osservato correttamente può completare il tentativo già iniziato.
* Dopo il lockout, la flessione visibile del gomito e la discesa del polso riarmano il movimento prima che i dischi coprano nuovamente le articolazioni.

### Conteggio e target

* Non viene imposta una durata minima della ripetizione: la classificazione dipende dalla sequenza geometrica e dagli stati del movimento.
* I cooldown sono usati esclusivamente per prevenire doppi conteggi ravvicinati.
* Quando viene raggiunto un target di ripetizioni, il conteggio si blocca subito per ignorare eventuali movimenti di rerack, mentre la registrazione continua per alcuni secondi così da non tagliare l'ultima rep.

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

Durante l'analisi il canvas mostra video, esoscheletro, angolo corrente, ripetizioni valide e no-rep. Il punto articolare principale diventa verde solo quando il target geometrico è raggiunto con landmark sufficientemente affidabili.

Il video esportato viene registrato dal canvas a `RECORDING_FPS`, acquisito in chunk periodici e scaricato nel formato effettivamente supportato dal browser, evitando blocchi e rinomine non reali tra WebM e MP4.

## Contesto Accademico

Progetto sviluppato per la tesi di Laurea Triennale in Informatica.

**Università degli Studi di Firenze**  
Anno Accademico 2025/2026

* **Studente:** Lorenzo Napolitano - lorenzo.napolitano@edu.unifi.it
* **Relatore:** Michele Ginolfi - michele.ginolfi@unifi.it
