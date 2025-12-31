// ====== 설정: GAS 웹앱 URL ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbw0Jry0N4CJbvJCEXmnD6wH_hOLxfv1wpMruNuT6jl3HYONPwzvM9nKogwLMt2G_ttviA/exec";

let courseTopicMap = {};
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 10;

// ====== 게임 상태 ======
let gameState = {
  questions: [],
  currentIdx: 0,
  score: 0,
  timerInterval: null,
  startTime: 0,
  endTime: 0,
  totalQ: 0
};

// ====== [공통] 유틸리티 ======
function switchScreen(id) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
  }
  window.scrollTo(0, 0);
}

function getStudentName() {
  const el = document.getElementById('student-name');
  return (el ? el.value : "").trim();
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.onclick = handler;
}

// ====== [초기화] 과정 및 토픽 목록 로드 ======
async function initCourseTopicSelect() {
  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
    const json = await res.json();
    if (!json.ok) return;

    courseTopicMap = json.data;
    const cSel = document.getElementById('course-select');
    const tSel = document.getElementById('topic-select');

    if (!cSel || !tSel) return;

    cSel.innerHTML = '<option value="" disabled selected>과정 선택</option>';
    Object.keys(courseTopicMap).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      cSel.appendChild(opt);
    });

    cSel.onchange = () => {
      const topics = courseTopicMap[cSel.value] || [];
      tSel.innerHTML = '<option value="" disabled selected>주제 선택</option>';
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        tSel.appendChild(opt);
      });
    };
  } catch (e) {
    console.error("초기 로드 에러:", e);
  }
}

// ====== [단계 1] 연습 시작 버튼 클릭 (개념 화면으로) ======
async function onClickStartBtn() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }

  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;
  if (!course || !topic) { alert('과정과 주제를 선택하세요!'); return; }

  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;
  
  const countRadio = document.querySelector('input[name="q-count"]:checked');
  currentQCount = countRadio ? parseInt(countRadio.value, 10) : 10;

  switchScreen('article-screen');
  
  const titleEl = document.getElementById('article-title');
  const contentBox = document.getElementById('article-content');
  
  if (titleEl) titleEl.innerText = `${course} - ${topic}`;
  if (contentBox) contentBox.innerHTML = '<p style="text-align:center; padding:20px;">내용을 불러오는 중...</p>';

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();

    if (json.ok && json.data) {
      contentBox.innerHTML = json.data;
      if (window.renderMathInElement) {
        renderMathInElement(contentBox, {
          delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
          throwOnError: false
        });
      }
    } else {
      contentBox.innerHTML = `<div style="text-align:center; padding:30px;"><p>📝 아직 개념 설명이 없습니다.</p></div>`;
    }
  } catch (e) {
    if (contentBox) contentBox.innerHTML = '<p>데이터 로드 오류</p>';
  }
}

// ====== [단계 2] 퀴즈 시작 (게임 화면으로) ======
async function onStartQuizFromArticle() {
  switchScreen('game-screen');
  const qTextEl = document.getElementById('question-text');
  const choicesEl = document.getElementById('choices-container');
  
  if (qTextEl) qTextEl.innerText = '문제를 불러오는 중입니다...';
  if (choicesEl) choicesEl.innerHTML = '';

  gameState.currentIdx = 0;
  gameState.score = 0;
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&sheetName=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok || !json.data || json.data.length === 0) {
      throw new Error("문제를 불러오지 못했습니다.");
    }

    gameState.questions = json.data;
    gameState.totalQ = json.data.length;

    startTimer();
    renderQuestion();
  } catch (e) {
    alert(e.message);
    switchScreen('menu-screen');
    } finally {
     if(btn) btn.disabled = false; // [추가] 로직 종료 후 버튼 활성화
  }
  }
}

function startTimer() {
  gameState.startTime = Date.now();
  const sw = document.getElementById('stopwatch');
  gameState.timerInterval = setInterval(() => {
    const diff = (Date.now() - gameState.startTime) / 1000;
    const min = Math.floor(diff / 60);
    const sec = Math.floor(diff % 60);
    if (sw) sw.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, 1000);
}

// ====== [단계 3] 문제 렌더링 및 정답 처리 ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  const qTextEl = document.getElementById('question-text');
  const choicesEl = document.getElementById('choices-container');

  if (!q || !qTextEl || !choicesEl) return;

  qTextEl.innerHTML = q.question || q.q || "문제 없음";
  choicesEl.innerHTML = '';

  const choices = Array.isArray(q.choices) ? q.choices : [];
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    const choiceText = (typeof choice === 'object') ? choice.text : String(choice);
    btn.innerHTML = choiceText.replace(/\n/g, '<br>');
    
    btn.onclick = () => {
      if (choice.isCorrect || choiceText === q.answer) {
        gameState.score++;
      }
      gameState.currentIdx++;
      if (gameState.currentIdx < gameState.totalQ) {
        renderQuestion();
      } else {
        endGame();
      }
    };
    choicesEl.appendChild(btn);
  });

  if (window.renderMathInElement) {
    renderMathInElement(document.getElementById('game-screen'), {
      delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
      throwOnError: false
    });
  }
}

function endGame() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  const elapsed = (Date.now() - gameState.startTime) / 1000;
  switchScreen('result-screen');
  document.getElementById('result-meta').innerText = `${currentCourse} - ${currentTopic}`;
  document.getElementById('final-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('final-time').innerText = `${elapsed.toFixed(2)}초`;
}

// ====== [추가 기능] 랭킹 저장 및 보기 ======
async function onClickSaveScore() {
  const name = getStudentName();
  if (!name) { alert('이름을 입력하세요!'); return; }
  const timeSec = document.getElementById('final-time').innerText.replace('초', '').trim();
  try {
    const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(currentSheetName)}&totalQ=${gameState.totalQ}&score=${gameState.score}&timeSec=${timeSec}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) alert('랭킹에 등록되었습니다!');
  } catch (e) { alert('저장 실패'); }
}

// 랭킹 보기 기능 (정의되지 않았던 부분 추가)
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerHTML = "로딩 중...";
  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    if (json.ok && json.data.length > 0) {
      let html = '<table class="ranking-table"><thead><tr><th>순위</th><th>이름</th><th>점수</th><th>시간</th></tr></thead><tbody>';
      json.data.forEach((r, i) => {
        html += `<tr>
           <td>${i+1}</td>
           <td>${r.name}</td>
           <td>${r.score}/${r.qCount}</td>
           <td>${r.time}초</td>
         </tr>`;
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
    } else {
      wrap.innerHTML = "기록이 없습니다.";
    }
  } catch (e) { wrap.innerHTML = "로드 실패"; }
}

// ====== [실행] 이벤트 바인딩 ======
window.addEventListener('load', () => {
  initCourseTopicSelect();

  // HTML의 ID와 함수의 이름을 정확히 매칭
  bindClick('start-btn', onClickStartBtn); // 함수명 수정됨
  bindClick('go-to-quiz-btn', onStartQuizFromArticle); // 함수명 수정됨
  bindClick('save-score-btn', onClickSaveScore);
  bindClick('view-ranking-btn', showRanking);
  bindClick('back-home-btn', () => location.reload());
  bindClick('back-home-btn-2', () => location.reload());
  bindClick('back-result-btn', () => switchScreen('result-screen'));

  bindClick('footer-intro', () => switchScreen('intro-screen'));
  bindClick('footer-privacy', () => switchScreen('privacy-screen'));
  bindClick('footer-contact', () => {
    const email = "mathkey77@gmail.com";
    if (confirm(`운영자에게 문의하시겠습니까?\n(${email})`)) {
      window.location.href = `mailto:${email}`;
    }
  });
});

