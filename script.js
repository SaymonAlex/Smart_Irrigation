// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDuSrgVNb8zkyL2NYZveVJWEiXOSztkQvA",
  authDomain: "gardencontrol-54e62.firebaseapp.com",
  databaseURL: "https://gardencontrol-54e62-default-rtdb.firebaseio.com",
  projectId: "gardencontrol-54e62",
  storageBucket: "gardencontrol-54e62.firebasestorage.app",
  messagingSenderId: "464841510963",
  appId: "1:464841510963:web:1ba631baf8551f68c9d346",
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Авторизация
firebase.auth().signInWithEmailAndPassword("nikitryok@gmail.com", "123Nikita#321")
  .then(user => {
    console.log("Вход выполнен:", user.user.email);
    initApp(); // запуск приложения
  })
  .catch(err => console.error("Ошибка авторизации:", err.message));

let set_startHour = "00", set_startMin = "00", set_startSec = "00";
let set_endHour = "00", set_endMin = "00", set_endSec = "00";
let sound_voice = true;
let utterance = null;
const db = firebase.database();

// ---------------------- UI / NAV ------------------------
const pad2 = n => n.toString().padStart(2, "0");
const el = id => document.getElementById(id);

function openNav() {
  el("mySidenav").style.width = "250px";
  ["startHour", "startMin", "startSec", "endHour", "endMin", "endSec"].forEach(id => {
    const val = eval(`set_${id}`); // безопасно здесь, т.к. только 6 известных переменных
    el(id).value = pad2(val);
  });
}

function closeNav() { el("mySidenav").style.width = "0"; }

document.getElementById("container").addEventListener("click", closeNav);

// ---------------------- Общие функции ------------------------
function speak(text) {
  if (!sound_voice) return;
  speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
}

function showInfoMessage(msg, isError = false) {
  const info = el("infoContainer");
  info.innerHTML = msg;
  info.style.backgroundColor = isError ? "red" : "#4CAF50";
  info.style.display = "block";
  setTimeout(() => info.style.display = "none", 3000);
}

// ---------------------- Инициализация ------------------------
function initApp() {

  // --- Сохранение таймера ---
  $("#save_but_time").click(() => {
    const getVal = (id, min, max) => {
      const v = parseInt(el(id).value, 10);
      return (isNaN(v) || v < min || v > max) ? null : v;
    };

    const startHour = getVal("startHour", 0, 23);
    const startMin = getVal("startMin", 0, 59);
    const startSec = getVal("startSec", 0, 59);
    const endHour = getVal("endHour", 0, 23);
    const endMin = getVal("endMin", 0, 59);
    const endSec = getVal("endSec", 0, 59);

    if ([startHour, startMin, startSec, endHour, endMin, endSec].includes(null)) {
      return showInfoMessage("Ошибка: введите корректные значения (часы 0-23, минуты/секунды 0-59)", true);
    }

    db.ref("Timer").update({
      StartHour: startHour, StartMin: startMin, StartSec: startSec,
      EndHour: endHour, EndMin: endMin, EndSec: endSec
    }).then(() => {
      showInfoMessage("Таймер полива сохранён успешно");
      speak("Таймер полива сохранён");
    }).catch(err => showInfoMessage("Ошибка при сохранении: " + err, true));
  });

  // --- Обновление параметров таймера ---
  db.ref("Timer").on("value", snap => {
    const val = snap.val();
    if (!val) return;

    // Таймеры
    set_startHour = val.StartHour; set_startMin = val.StartMin; set_startSec = val.StartSec;
    set_endHour = val.EndHour; set_endMin = val.EndMin; set_endSec = val.EndSec;

    el('startTime').textContent = `${pad2(set_startHour)}:${pad2(set_startMin)}:${pad2(set_startSec)}`;
    el('endTime').textContent = `${pad2(set_endHour)}:${pad2(set_endMin)}:${pad2(set_endSec)}`;
  });

  // --- Слушатель всех сенсоров и статусов ---
  db.ref().on("value", snap => {
    const val = snap.val();
    if (!val) return;
    
    // --- Режим ---
    const mode = val?.Garden_mode ?? 0;
    const automode = el('automode');
    el('set_color_name').innerText = mode === 1 ? "РЕЖИМ-АВТО" : "РУЧ-РЕЖИМ";
    automode.checked = !!mode;

    // --- Мощность ---
    const btn = document.querySelector('.engine');
    const light = document.querySelector('.light');
    const power = val?.Garden_status ?? 0;
    btn.classList.toggle("active", power === 1);
    light.classList.toggle("active", power === 1);
    state = power;

    // --- Статус Wi-Fi ---
    stat_wifi = val?.StatusGarden ?? 0;
  });

  // --- Чтение данных из Sensors ---
  db.ref("Sensors").on("value", snap => {
    const sensors = snap.val();
    if (!sensors) return;

    // --- Данные с датчиков ---
    el("local_temp").innerHTML = sensors.Local_temp ?? "---";
    el("local_hum").innerHTML = sensors.SoilHumidity ?? "---";
    el("signal").innerHTML = sensors.WifiGarden ?? "---";
  });

// -----------Чтение уровней воды----------
  db.ref("Levels").on("value", snap => {
    const val = snap.val();
    if (!val) return;
    el('levelup_status').innerText = val?.DrumUp === 1 ? "Заполнен" : "Низкий";
    el('leveldown_status').innerText = val?.DrumDown === 1 ? "Нет воды" : "В норме";
  });

  // --- Переключение режима ---
  $("#automode").click(() => {
    const newMode = el('automode').checked ? 1 : 0;
    db.ref("Garden_mode").set(newMode);
    speak(newMode ? "Автоматический режим, включен" : "Автоматический режим, выключен");
  });

  // --- Кнопка питания ---
  const button = document.querySelector('.engine');
  button.addEventListener('click', () => {
    const ref = db.ref("Power");
    ref.once("value").then(snapshot => {
      const current = snapshot.val() || 0;  
      const next = current === 0 ? 1 : 0; 
      ref.set(next);                       
    });
  });

  // --- Проверка статуса Wi-Fi ---
  let prev_statwifi;
  setInterval(() => {
    const wifi = el('status_wifi');
    const isSame = stat_wifi === prev_statwifi;
    wifi.classList.toggle('wifi_on', !isSame);
    wifi.classList.toggle('wifi_off', isSame);
    prev_statwifi = stat_wifi;
  }, 15000);

  // --- Анимация капель насоса ---
  const indicator = el("pump-indicator");
  let dropInterval = null;

  function startDrops() {
    indicator.classList.remove('pump-indicator_off');
    if (dropInterval) return;
    dropInterval = setInterval(() => {
      const drop = document.createElement("div");
      drop.className = "drop";
      drop.innerHTML = "💧";
      drop.style.left = Math.random() * 80 + "px";
      indicator.appendChild(drop);
      setTimeout(() => drop.remove(), 2000);
    }, 500);
  }

  function stopDrops() {
    indicator.classList.add('pump-indicator_off');
    clearInterval(dropInterval);
    dropInterval = null;
    indicator.innerHTML = "";
  }

  let lastGardenStatus = null; 
  db.ref("Garden_status").on("value", snap => {
    const current = snap.val();
    if (lastGardenStatus === null) {
      lastGardenStatus = current;
      return;
    }

    if (current !== lastGardenStatus) {
      if (current === 1) {
        startDrops();
        speak("Начался полив растений");
      } else {
        stopDrops();
        speak("Полив растений остановлен");
      }
    }
    lastGardenStatus = current;
  });

}

// ---------------------- Анимация фона ------------------------
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
canvas.width = innerWidth; canvas.height = innerHeight;

class Particle {
  constructor() {
    this.reset();
    this.radius = 4;
    this.points = 8;
    this.innerRadius = 2;
  }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5);
    this.vy = (Math.random() - 0.5);
  }
  update() {
    this.x = (this.x + this.vx + canvas.width) % canvas.width;
    this.y = (this.y + this.vy + canvas.height) % canvas.height;
  }
  draw() {
    const { x, y, points, radius, innerRadius } = this;
    let rot = Math.PI / 2 * 3;
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    for (let i = 0; i < points; i++) {
      let x1 = x + Math.cos(rot) * radius;
      let y1 = y + Math.sin(rot) * radius;
      ctx.lineTo(x1, y1);
      rot += Math.PI / points;

      x1 = x + Math.cos(rot) * innerRadius;
      y1 = y + Math.sin(rot) * innerRadius;
      ctx.lineTo(x1, y1);
      rot += Math.PI / points;
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }
}

const particles = Array.from({ length: 20 }, () => new Particle());
const maxDist = 120;

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let p of particles) {
    p.update(); p.draw();
  }
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d = Math.hypot(dx, dy);
      if (d < maxDist) {
        ctx.strokeStyle = `rgba(255,255,255,${1 - d / maxDist})`;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});