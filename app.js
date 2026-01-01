// ====== 설정: GAS 웹앱 URL ======
const GAS_BASE_URL = "https://script.google.com/macros/s/AKfycbxnEwKcaxk9gcfAEiG4rXnxuu7o7EtAOGw0ib0sw2naeQBHCW--jpEKa05ZDj4w1Qu9oQ/exec";

// ====== 전역 상태 ======
let courseTopicMap = {};
let currentCourse = "";
let currentTopic = "";
let currentSheetName = "";
let currentQCount = 10;

const CACHE_DURATION = 60 * 60 * 1000;

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

// ====== 유틸 ======
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

function getStudentName() {
  return document.getElementById('student-name')?.value.trim() || "";
}

function bindClick(id, fn) {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
}

// ====== 초기 데이터 로드 ======
async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  courseSel.innerHTML = '<option>로딩 중...</option>';
  courseSel.disabled = true;
  topicSel.disabled = true;

  try {
    const now = Date.now();
    const cached = localStorage.getItem('math_course_data');
    const cachedTime = localStorage.getItem('math_course_time');

    let data;
    if (cached && cachedTime && now - cachedTime < CACHE_DURATION) {
      console.log("✅ 로컬 캐시 사용");
      data = JSON.parse(cached);
    } else {
      console.log("📡 서버 요청");
      const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
      const json = await res.json();
      if (!json.ok) throw new Error("서버 응답 오류");
      data = json.data;
      localStorage.setItem('math_course_data', JSON.stringify(data));
      localStorage.setItem('math_course_time', now);
    }

    courseTopicMap = data;
    courseSel.innerHTML = '<option value="">과정 선택</option>';
    Object.keys(data).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      courseSel.appendChild(opt);
    });

    courseSel.disabled = false;
    courseSel.onchange = onCourseChange;

  } catch (e) {
    console.error(e);
    alert("과정 데이터를 불러오지 못했습니다.");
  }
}

function onCourseChange() {
  const course = document.getElementById('course-select').value;
  const topicSel = document.getElementById('topic-select');

  topicSel.innerHTML = '<option value="">주제 선택</option>';
  topicSel.disabled = true;

  if (course && courseTopicMap[course]) {
    courseTopicMap[course].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      topicSel.appendChild(opt);
    });
    topicSel.disabled = false;
  }
}

// ====== 메뉴 → 개념 ======
async function onClickStartBtn() {
  const name = getStudentName();
  const course = document.getElementById('course-select').value;
  const topic = document.getElementById('topic-select').value;

  if (!name) return alert("이름을 입력해주세요.");
  if (!course || !topic) return alert("과정과 주제를 선택해주세요.");

  // ✅ [수정] 여기서 문제 수를 미리 저장합니다!
  const qRadio = document.querySelector('input[name="q-count"]:checked');
  currentQCount = qRadio ? Number(qRadio.value) : 10;

  currentCourse = course;
  currentTopic = topic;
  currentSheetName = `<${course}>${topic}`;

  document.getElementById('article-title').innerText = `${course} - ${topic}`;
  
  const contentEl = document.getElementById('article-content');
  contentEl.innerText = "설명을 불러오는 중...";

  switchScreen('article-screen');

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getDescription&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    
    // ✅ [수정] 텍스트 넣고나서 수식 렌더링 실행
    contentEl.innerHTML = json.ok && json.data ? json.data : "설명이 없습니다.";
    renderMath(contentEl); 
  } catch {
    contentEl.innerText = "설명 로드 실패";
  }
}
// ====== 개념 → 퀴즈 ======
async function onStartQuizFromArticle() {
  if (!currentSheetName) {
    alert("주제 정보가 유실되었습니다.");
    switchScreen('menu-screen');
    return;
  }
  await startQuiz();
}

// ====== 퀴즈 시작 (수정됨) ======
async function startQuiz() {
  if (!currentSheetName) {
    alert("주제 정보가 유실되었습니다.\n처음 화면으로 돌아갑니다.");
    switchScreen('menu-screen');
    return;
  }
  
  // (여기 있던 라디오 버튼 읽는 코드 삭제됨 - 위에서 이미 저장함)

  switchScreen('game-screen');
  const qTextEl = document.getElementById('q-text');
  qTextEl.innerText = "문제를 불러오는 중...";

  try {
    const url = `${GAS_BASE_URL}?action=getGameData&topic=${encodeURIComponent(currentSheetName)}&count=${currentQCount}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);

    gameState = {
      questions: json.data,
      currentIdx: 0,
      score: 0,
      startTime: Date.now(),
      totalQ: json.data.length
    };

    startTimer();
    renderQuestion();
  } catch (e) {
    alert("문제를 불러오지 못했습니다.");
    console.error(e);
    switchScreen('menu-screen');
  }
}


// ====== 타이머 ======
function startTimer() {
  clearInterval(gameState.timerInterval);
  gameState.startTime = Date.now();

  gameState.timerInterval = setInterval(() => {
    const diff = (Date.now() - gameState.startTime) / 1000;
    const m = Math.floor(diff / 60);
    const s = Math.floor(diff % 60);
    document.getElementById('stopwatch').innerText =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

// ====== 문제 렌더 (수정됨) ======
function renderQuestion() {
  const q = gameState.questions[gameState.currentIdx];
  if (!q) return;

  const progress = ((gameState.currentIdx + 1) / gameState.totalQ) * 100;
  document.getElementById('time-bar').style.width = progress + "%";

    const progressText = document.getElementById('q-progress-text');
  if (progressText) {
    progressText.innerText = `Q. ${gameState.currentIdx + 1} / ${gameState.totalQ}`;
  }
  
  const qTextEl = document.getElementById('q-text');
  qTextEl.innerHTML = q.text; 
  renderMath(qTextEl); // ✅ 문제 텍스트 수식 렌더링

  const wrap = document.getElementById('choices');
  wrap.innerHTML = "";

  q.choices.forEach(c => {
    const btn = document.createElement('button');
    btn.innerHTML = c; // ✅ 버튼 내부 텍스트 HTML로 처리
    btn.onclick = () => checkAnswer(c);
    wrap.appendChild(btn);
  });
  
  renderMath(wrap); // ✅ 보기 버튼들도 일괄 수식 렌더링
}

// ====== 정답 체크 ======
function checkAnswer(choice) {
  const q = gameState.questions[gameState.currentIdx];
  if (choice === q.answer) gameState.score++;  // ✅ q.answer 사용
  gameState.currentIdx++;
  if (gameState.currentIdx < gameState.totalQ) renderQuestion();
  else endGame();
}

// ====== 종료 ======
function endGame() {
  clearInterval(gameState.timerInterval);
  gameState.endTime = Date.now();

  const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
  document.getElementById('result-score').innerText = `${gameState.score} / ${gameState.totalQ}`;
  document.getElementById('result-time').innerText = `${duration}초`;

  switchScreen('result-screen');
}

// ====== 랭킹 ======
async function showRanking() {
  switchScreen('ranking-screen');
  const wrap = document.getElementById('ranking-table-wrap');
  wrap.innerText = "로딩 중...";

  try {
    const res = await fetch(`${GAS_BASE_URL}?action=getRankings&topic=${encodeURIComponent(currentSheetName)}`);
    const json = await res.json();
    wrap.innerText = JSON.stringify(json.data, null, 2);
  } catch {
    wrap.innerText = "랭킹 로드 실패";
  }
}

// 3. 이벤트 바인딩 추가 (window.addEventListener 내부)
window.addEventListener('load', () => {
  initCourseTopicSelect();
  bindClick('start-btn', onClickStartBtn);
  bindClick('go-to-quiz-btn', onStartQuizFromArticle);
  bindClick('view-ranking-btn', showRanking);

  // ✅ 누락된 버튼들
  bindClick('back-to-menu-from-article', () => switchScreen('menu-screen'));
  bindClick('back-to-result-btn', () => switchScreen('result-screen'));
  bindClick('save-score-btn', async () => {
    const name = getStudentName();
    const duration = ((gameState.endTime - gameState.startTime) / 1000).toFixed(2);
    try {
      const url = `${GAS_BASE_URL}?action=saveScore&name=${encodeURIComponent(name)}&topic=${encodeURIComponent(currentSheetName)}&totalQ=${gameState.totalQ}&score=${gameState.score}&timeSec=${duration}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) alert("랭킹에 저장되었습니다!");
      else alert("저장 실패: " + json.error);
    } catch (e) {
      alert("저장 중 오류 발생");
    }
  });
});
function renderMath(element) {
  if (window.renderMathInElement) {
    renderMathInElement(element, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\(", right: "\\)", display: false},
        {left: "\\[", right: "\\]", display: true}
      ]
    });
  }
}




