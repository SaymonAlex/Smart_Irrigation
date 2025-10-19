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

    db.ref().update({
      StartHour: startHour, StartMin: startMin, StartSec: startSec,
      EndHour: endHour, EndMin: endMin, EndSec: endSec
    }).then(() => {
      showInfoMessage("Таймер полива сохранён успешно");
      speak("Таймер полива сохранён");
    }).catch(err => showInfoMessage("Ошибка при сохранении: " + err, true));
  });

  // --- Обновление параметров таймера ---
  db.ref().on("value", snap => {
    const val = snap.val();
    if (!val) return;

    // Таймеры
    set_startHour = val.StartHour; set_startMin = val.StartMin; set_startSec = val.StartSec;
    set_endHour = val.EndHour; set_endMin = val.EndMin; set_endSec = val.EndSec;

    el('startTime').textContent = `${pad2(set_startHour)}:${pad2(set_startMin)}:${pad2(set_startSec)}`;
    el('endTime').textContent = `${pad2(set_endHour)}:${pad2(set_endMin)}:${pad2(set_endSec)}`;

    // Данные с датчиков
    el("local_temp").innerHTML = val.Local_temp ?? "---";
    el("local_hum").innerHTML = val.SoilHumidity ?? "---";
    el("signal").innerHTML = val.WifiGarden ?? "---";

    // Режим
    const mode = val.Garden_mode;
    const automode = el('automode');
    el('set_color_name').innerText = mode == 1 ? "РЕЖИМ-АВТО" : "РУЧ-РЕЖИМ";
    automode.checked = !!mode;

    // Мощность
    const btn = document.querySelector('.engine');
    const light = document.querySelector('.light');
    const power = val.Garden_status;
    btn.classList.toggle("active", power === 1);
    light.classList.toggle("active", power === 1);
    state = power;

    // Уровни воды
    el('levelup_status').innerText = val.DrumUp == 1 ? "Заполнен" : "Низкий";
    el('leveldown_status').innerText = val.DrumDown == 1 ? "Нет воды" : "В норме";

    // Статус Wi-Fi
    stat_wifi = val.StatusGarden;
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
    db.ref("Power").set(state === 0 ? 1 : 0);
  });

  // --- Проверка статуса Wi-Fi ---
  let prev_statwifi;
  setInterval(() => {
    const wifi = el('status_wifi');
    const isSame = stat_wifi === prev_statwifi;
    wifi.classList.toggle('wifi_on', !isSame);
    wifi.classList.toggle('wifi_off', isSame);
    prev_statwifi = stat_wifi;
  }, 9000);

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

  db.ref("Garden_status").on("value", snap => {
    if (snap.val() === 1) startDrops(); else stopDrops();
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

// Вход (один раз)
// firebase.auth().signInWithEmailAndPassword("nikitryok@gmail.com", "123Nikita#321")
//   .then((userCredential) => {
//     console.log("Вход выполнен:", userCredential.user.email);
//     initApp(); // запускаем приложение
//   })
//   .catch((error) => {
//     console.error("Ошибка авторизации:", error.message);
//   });

// var set_startHour = "00"
// var set_startMin = "00"
// var set_startSec = "00"

// var set_endHour = "00"
// var set_endMin = "00"
// var set_endSec = "00"
// let utterance = null;
// var sound_voice = true;

// //----------SideNAv----------
// const container = document.getElementById('container');
// container.addEventListener("click", () => {
//   closeNav();
// })
// function pad2(num) {
//   return num.toString().padStart(2, "0");
// }

// function openNav() {
//   document.getElementById("mySidenav").style.width = "250px";

//   document.getElementById('startHour').value = pad2(set_startHour);
//   document.getElementById('startMin').value = pad2(set_startMin);
//   document.getElementById('startSec').value = pad2(set_startSec);

//   document.getElementById('endHour').value = pad2(set_endHour);
//   document.getElementById('endMin').value = pad2(set_endMin);
//   document.getElementById('endSec').value = pad2(set_endSec);
// }

// function closeNav() {
//   document.getElementById("mySidenav")
//     .style.width = "0";
// }
// //  -----------start initApp------------
// function initApp() {
// // Установка таймера полива
// $("#save_but_time").click(function () {
//   // Функция проверки диапазонов
//   function validateValue(value, min, max) {
//     const num = parseInt(value, 10);
//     if (isNaN(num) || num < min || num > max) {
//       return null;
//     }
//     return num;
//   }

//   // Читаем и валидируем значения
//   const startHour = validateValue(document.getElementById("startHour").value, 0, 23);
//   const startMin = validateValue(document.getElementById("startMin").value, 0, 59);
//   const startSec = validateValue(document.getElementById("startSec").value, 0, 59);

//   const endHour = validateValue(document.getElementById("endHour").value, 0, 23);
//   const endMin = validateValue(document.getElementById("endMin").value, 0, 59);
//   const endSec = validateValue(document.getElementById("endSec").value, 0, 59);

//   // Если ошибка в вводе — не сохраняем
//   if (
//     startHour === null || startMin === null || startSec === null ||
//     endHour === null || endMin === null || endSec === null
//   ) {
//     showInfoMessage("Ошибка: введите корректные значения (часы 0-23, минуты/секунды 0-59)", true);
//     return;
//   }

//   // Подготавливаем объект для Firebase
//   const updates = {
//     "/StartHour": startHour,
//     "/StartMin": startMin,
//     "/StartSec": startSec,
//     "/EndHour": endHour,
//     "/EndMin": endMin,
//     "/EndSec": endSec
//   };

//   //Сохраняем
//   let firebaseRef = firebase.database().ref();
//   firebaseRef.update(updates)
//     .then(() => {
//       showInfoMessage("Таймер полива сохранён успешно");
//       if (sound_voice === true) {
//         const texton = "Таймер полива сохранён";
//         speechSynthesis.cancel();
//         var utterance = new SpeechSynthesisUtterance(texton);
//         speechSynthesis.speak(utterance);
//       }
//     })
//     .catch((error) => {
//       showInfoMessage("Ошибка при сохранении: " + error, true);
//     });

//   // -----------Функция показа сообщений-----------
//   function showInfoMessage(message, isError = false) {
//     const infoContainer = document.getElementById("infoContainer");
//     infoContainer.innerHTML = message;

//     if (isError) {
//       infoContainer.style.backgroundColor = "red";
//     } else {
//       infoContainer.style.backgroundColor = "#4CAF50";
//     }
//     infoContainer.style.display = "block";

//     setTimeout(() => {
//       infoContainer.style.display = "none";
//     }, 3000);
//   }
// });

// function pad(num) {
//   return String(num).padStart(2, '0');
// }

// let timercheck = firebase.database();
// timercheck.ref().on("value", function (snap) {
//   set_startHour = snap.val().StartHour;
//   set_startMin = snap.val().StartMin;
//   set_startSec = snap.val().StartSec;
//   let timeStr = pad(set_startHour) + ":" + pad(set_startMin) + ":" + pad(set_startSec);
//   document.getElementById('startTime').textContent = timeStr;

//   set_endHour = snap.val().EndHour;
//   set_endMin = snap.val().EndMin;
//   set_endSec = snap.val().EndSec;
//   let timeEnd = pad(set_endHour) + ":" + pad(set_endMin) + ":" + pad(set_endSec);
//   document.getElementById('endTime').textContent = timeEnd;
// });

// $(document).ready(function () {

// });

// // -----Работа с температурой и влажностью + сигнал wifi-----
// let datacheck = firebase.database();
// let local_temp;
// let local_hum;
// let wifi_sig;
// datacheck.ref().on("value", function (snap) {
//   local_temp = snap.val().Local_temp;
//   local_hum = snap.val().SoilHumidity;
//   wifi_sig = snap.val().WifiGarden;
//   document.getElementById("local_temp").innerHTML = `${local_temp}`;
//   document.getElementById("local_hum").innerHTML = `${local_hum}`;
//   document.getElementById("signal").innerHTML = `${wifi_sig}`;
// });


// //--------Режим работы----------
// let modecheck = firebase.database();
// let Automodenow;
// modecheck.ref().on("value", function (snap) {
//   Automodenow = snap.val().Garden_mode;
//   if (Automodenow == 1) {
//     document.getElementById('automode').checked = 1;
//     document.getElementById('set_color_name').innerText = "РЕЖИМ-АВТО";
//   } else {
//     document.getElementById('automode').checked = 0;
//     document.getElementById('set_color_name').innerText = "РУЧ-РЕЖИМ";
//   }
// });



// $("#automode").click(function () {
//   let firebaseMode = firebase.database().ref().child("Garden_mode");
//   if (Automodenow == 1) {
//     firebaseMode.set(0);
//     const modeoff = "Автоматический режим, выключен";
//     speechSynthesis.cancel();
//     var utterance = new SpeechSynthesisUtterance(modeoff);
//     speechSynthesis.speak(utterance);
//   } else {
//     firebaseMode.set(1);
//     const modeon = "Автоматический режим, включен";
//     speechSynthesis.cancel();
//     var utterance = new SpeechSynthesisUtterance(modeon);
//     speechSynthesis.speak(utterance);
//   }
// })


// //----------Engine Knob--------
// const button = document.querySelector('.engine');
// const light = document.querySelector('.light');
// let powercheck = firebase.database();
// let firebasePower;
// var state;

// powercheck.ref().on("value", function (snap) {
//   firebasePower = parseInt(snap.val().Garden_status);
//   if (firebasePower === 1) {
//     button.classList.add("active");
//     light.classList.add("active");
//     state = 1;
//   } else {
//     button.classList.remove("active");
//     light.classList.remove("active");
//     state = 0;
//   }
// });

// button.addEventListener('click', (e) => {
//   let power = firebase.database().ref().child("Power");
//   if (state === 0) {
//     power.set(1);
//   } else if (state === 1) {
//     power.set(0);
//   }
// });

// //------Статус подключения к интернету---------
// var units_status = firebase.database();
// var stat_wifi;
// var prev_statwifi;
// units_status.ref().on("value", function (snap) {
//   stat_wifi = snap.val().StatusGarden;
// });

// function status_device() {
//   let wifi_indicator = document.getElementById('status_wifi');

//   if (stat_wifi == prev_statwifi) {
//     wifi_indicator.classList.remove('wifi_on');
//     wifi_indicator.classList.add('wifi_off');
//     prev_statwifi = stat_wifi;
//   } else {
//     wifi_indicator.classList.remove('wifi_off');
//     wifi_indicator.classList.add('wifi_on');
//     prev_statwifi = stat_wifi;
//   }
// }
// setInterval(status_device, 9000);


// // ----------Status pump-----------
// let pumpcheck = firebase.database();
// let firebasePump;
// const indicator = document.getElementById("pump-indicator");
// let dropInterval = null;

// pumpcheck.ref().on("value", function (snap) {
//   firebasePump = parseInt(snap.val().Garden_status);
//   if (firebasePump === 1) {
//     startDrops();
//   } else {
//     stopDrops();
//   }
// });

// function startDrops() {
//   indicator.classList.remove('pump-indicator_off');
//   if (dropInterval) return; // уже работает
//   dropInterval = setInterval(() => {
//     let drop = document.createElement("div");
//     drop.className = "drop";
//     drop.innerHTML = "💧";
//     // случайное смещение
//     drop.style.left = Math.random() * 80 + "px";
//     indicator.appendChild(drop);
//     // удалить каплю после анимации
//     setTimeout(() => drop.remove(), 2000);
//   }, 500); // новая капля каждые 0.5с
// }

// function stopDrops() {
//   indicator.classList.add('pump-indicator_off');
//   clearInterval(dropInterval);
//   dropInterval = null;
//   indicator.innerHTML = ""; // очистить капли
// }


// // ----------Levels status-------------

//   document.getElementById('leveldown_status');

//   var water_status = firebase.database();
//   var levelUp;
//   var levelDown;
//   water_status.ref().on("value", function (snap) {
//     levelUp = snap.val().DrumUp;
//     levelDown = snap.val().DrumDown;
//     if (levelUp == 1) {
//       document.getElementById('levelup_status').innerText = "Заполнен";
//     }else {
//       document.getElementById('levelup_status').innerText = "Низкий";
//     }
//     if (levelDown == 1) {
//       document.getElementById('leveldown_status').innerText = "Нет воды";
//     } else {
//       document.getElementById('leveldown_status').innerText = "В норме";
//     }
//   });


// }

// // ----------End initApp-------------


// //  ---------Animation BG--------------
// const canvas = document.getElementById('particleCanvas');
// const ctx = canvas.getContext('2d');

// canvas.width = window.innerWidth;
// canvas.height = window.innerHeight;

// const particles = [];
// const particleCount = 20;
// const maxDistance = 120;

// class Particle {
//   constructor() {
//     this.x = Math.random() * canvas.width;
//     this.y = Math.random() * canvas.height;
//     this.vx = (Math.random() - 0.5) * 1;
//     this.vy = (Math.random() - 0.5) * 1;
//     this.radius = 4;
//     this.points = 8; // Количество концов у звезды
//     this.innerRadius = this.radius / 2; // Внутренний радиус звезды
//   }

//   update() {
//     this.x += this.vx;
//     this.y += this.vy;

//     if (this.x > canvas.width) this.x = 0;
//     if (this.x < 0) this.x = canvas.width;
//     if (this.y > canvas.height) this.y = 0;
//     if (this.y < 0) this.y = canvas.height;
//   }

//   drawStar(cx, cy, spikes, outerRadius, innerRadius) {
//     let rot = Math.PI / 2 * 3;
//     let x = cx;
//     let y = cy;
//     let step = Math.PI / spikes;

//     ctx.beginPath();
//     ctx.moveTo(cx, cy - outerRadius);
//     for (let i = 0; i < spikes; i++) {
//       x = cx + Math.cos(rot) * outerRadius;
//       y = cy + Math.sin(rot) * outerRadius;
//       ctx.lineTo(x, y);
//       rot += step;

//       x = cx + Math.cos(rot) * innerRadius;
//       y = cy + Math.sin(rot) * innerRadius;
//       ctx.lineTo(x, y);
//       rot += step;
//     }
//     ctx.lineTo(cx, cy - outerRadius);
//     ctx.closePath();
//     ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
//     ctx.fill();
//   }

//   draw() {
//     this.drawStar(this.x, this.y, this.points, this.radius, this.innerRadius);
//   }
// }

// for (let i = 0; i < particleCount; i++) {
//   particles.push(new Particle());
// }

// function animate() {
//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   particles.forEach(particle => {
//     particle.update();
//     particle.draw();
//   });

//   for (let i = 0; i < particleCount; i++) {
//     for (let j = i + 1; j < particleCount; j++) {
//       const dx = particles[i].x - particles[j].x;
//       const dy = particles[i].y - particles[j].y;
//       const distance = Math.sqrt(dx * dx + dy * dy);

//       if (distance < maxDistance) {
//         const opacity = 1 - distance / maxDistance;
//         ctx.beginPath();
//         ctx.moveTo(particles[i].x, particles[i].y);  // Начало линии в координатах первой частицы
//         ctx.lineTo(particles[j].x, particles[j].y);  // Конец линии в координатах второй частицы
//         ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
//         ctx.lineWidth = 1;
//         ctx.stroke();
//       }
//     }
//   }

//   requestAnimationFrame(animate);
// }
// animate();
// window.addEventListener('resize', () => {
//   canvas.width = window.innerWidth;
//   canvas.height = window.innerHeight;
// });
