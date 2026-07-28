# Powerlifting Kinematics Vision

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-00B4D8?style=for-the-badge)

Web application for real-time kinematic analysis and automatic recognition of valid repetitions in fundamental powerlifting exercises (Squat, Deadlift, Overhead Press).

![Application Preview](./docs/screenshot.png)

## Project Description
This software tracks human topological landmarks directly in the browser, without sending video frames to external servers. The objective is to validate powerlifting lifts by comparing the user's joint angles with the thresholds established by standard sports regulations.

## System Architecture
The project is divided into four logical modules:

* **Frontend UI (`App.jsx`):** User interface developed in React. It manages exercise selection, file uploading, webcam access, and the display of the acquisition log.
* **Computer Vision (`usePose.js`):** Module dedicated to the initialization and execution of MediaPipe Pose. It extracts the coordinates (x, y, visibility) of 33 body landmarks for each processed video frame.
* **Validation Logic (`repLogic.js`):** Implementation of a Finite State Machine (FSM). It calculates joint angles using trigonometric vectors and determines the state of the movement (e.g., `STANDING`, `DESCENDING`, `ASCENDING`, `SETUP`, `LIFTING`). It emits validation events (`VALID_REP` or `NO_REP`) based on predefined tolerance thresholds.
* **Visual Rendering (`canvasRenderer.js`):** Manages the output on the HTML5 Canvas. It superimposes the vector skeleton onto the original video and changes the color of the primary joint point (red during execution, green upon reaching the geometric target).

## Getting Started

To run the application in a local development environment, you must have [Node.js](https://nodejs.org/) installed.

1. Clone the repository:
```bash
git clone [https://github.com/YourUsername/powerlifting-kinematics-vision.git]

```

2. Navigate to the project directory:
```bash
cd powerlifting-kinematics-vision

```


3. Install the dependencies:
```bash
npm install

```


4. Start the development server:
```bash
npm run dev

```



## App User Guide

### Acquisition Modes

The application supports two video input streams:

1. **Camera (Live):** Utilizes the computer's webcam or the mobile device's camera (front/rear). Pressing "INIZIA ESERCIZIO" (START EXERCISE) triggers a 3-second calibration timer on the screen, allowing the user to position themselves correctly within the frame.
2. **Upload Video (File):** Allows the upload of pre-recorded `.mp4` or `.webm` files. The analysis starts immediately upon pressing the start button.

### Visual Feedback Functionality

During the analysis, a graphical overlay displays the user's skeleton. The system provides instantaneous feedback via a circular indicator positioned on the key joint for the selected exercise (hip for Squat and Deadlift, elbow for Overhead Press).

* **Red Color:** Movement in progress; the geometric threshold has not yet been reached.
* **Green Color:** Angle validated by the Finite State Machine (e.g., breaking the parallel in the squat or complete lockout in the deadlift). The point maintains the green color for the duration of the cooldown, confirming the validity of the repetition.

The upper HUD interface displays the total count of valid repetitions and the angle measured in real-time. Invalid executions are recorded in the bottom session log, specifying the cause of the error.

## Academic Context

Project developed for the Bachelor's Degree in Computer Science Thesis.

**University of Florence (Università degli Studi di Firenze)**
Graduation Date: October 21, 2026

* **Student:** Lorenzo Napolitano - lorenzo.napolitano@edu.unifi.it
* **Thesis Supervisor:** Michele Ginolfi - michele.ginolfi@unifi.it