# Powerlifting & Computer Vision

Applicazione web per l'analisi cinematica nel browser e il riconoscimento automatico delle ripetizioni di squat, stacco da terra e distensione sopra la testa.
I frame vengono elaborati localmente con MediaPipe Pose Landmarker e non sono inviati a server esterni.

![Anteprima dell'applicazione](./docs/screenshot.png)

## Funzionalità

- Acquisizione da fotocamera anteriore o posteriore.
- Analisi di video MP4, WebM e QuickTime caricati dall'utente.
- Conteggio delle ripetizioni valide e segnalazione esplicita delle ripetizioni
  non valide per lo squat.
- Overlay su canvas con scheletro, angolo articolare e feedback immediato.
- Registrazione ed esportazione dell'analisi con riepilogo della sessione.
- Elaborazione multi-persona con continuità del soggetto selezionato.
- Mantenimento dello schermo attivo durante l'allenamento sui browser che supportano la Screen Wake Lock API.

## Architettura

- `src/App.jsx`: interfaccia e flusso di acquisizione.
- `src/hooks/usePose.js`: lifecycle MediaPipe, fotocamera e ciclo di inferenza.
- `src/logic/repLogic.js`: macchine a stati e validazione degli esercizi.
- `src/config/exercises.js`: soglie biomeccaniche e configurazione del motore.
- `src/utils/canvasRenderer.js`: rendering dell'overlay e dell'HUD.
- `src/hooks/useVideoRecorder.js`: registrazione ed esportazione del canvas.

## Avvio locale

Richiede una versione recente di [Node.js](https://nodejs.org/).

```bash
git clone https://github.com/Persheshow/pose-powerlifting-analyzer.git
cd pose-powerlifting-analyzer
npm install
npm run dev
```

Vite mostra nel terminale l'indirizzo locale da aprire nel browser. Per usare la fotocamera fuori da `localhost` è necessario servire l'applicazione tramite HTTPS.

## Controlli tecnici

```bash
npm run lint
npm run build
```

Questi comandi controllano rispettivamente la qualità statica del codice e la
corretta generazione del bundle di produzione. La validazione funzionale del
riconoscimento viene invece svolta manualmente sul campo, mediante sessioni
reali e video registrati in condizioni rappresentative. I video inclusi in
`public/assets` restano esempi dimostrativi e non costituiscono test automatici.

## Utilizzo

1. Selezionare esercizio, target e modalità di acquisizione.
2. Inquadrare tutto il corpo con una vista prevalentemente sagittale.
3. Avviare l'analisi e mantenere visibili le articolazioni richieste.
4. Al termine, scaricare oppure ignorare la registrazione prodotta.

Durante la sessione il punto articolare è rosso mentre il target geometrico non
è raggiunto e verde quando lo è. Dove supportato, il browser mantiene acceso lo
schermo per l'intera analisi; il sistema operativo può comunque revocare il
blocco, ad esempio in modalità di risparmio energetico.

Per una maggiore compatibilità si raccomandano Chrome su Android o PC e Safari
su iOS. Con i video caricati è preferibile evitare risoluzioni estreme, che
possono ridurre fluidità e precisione del tracciamento.

## Contesto accademico

Progetto sviluppato per la tesi del Corso di Laurea in Informatica dell'Università degli Studi di Firenze, A.A. 2025/2026.
