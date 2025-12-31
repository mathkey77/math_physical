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
// 캐시 유효 시간 (예: 60분)
const CACHE_DURATION = 60 * 60 * 1000; 

async function initCourseTopicSelect() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');

  // 로딩 상태 표시
  courseSel.innerHTML = '<option>로딩 중...</option>';
  courseSel.disabled = true;
  topicSel.disabled = true;

  try {
    let data = null;

    // 1. 로컬 스토리지 확인
    const saved = localStorage.getItem('math_course_data');
    const savedTime = localStorage.getItem('math_course_time');
    const now = Date.now();

    if (saved && savedTime && (now - parseInt(savedTime) < CACHE_DURATION)) {
      // 캐시가 유효하면 바로 사용 (즉시 로딩됨)
      console.log('✅ 로컬 캐시 사용');
      data = JSON.parse(saved);
    } else {
      // 캐시가 없거나 만료되었으면 GAS 서버 요청
      console.log('📡 서버 데이터 요청 중...');
      const res = await fetch(`${GAS_BASE_URL}?action=getCoursesAndTopics`);
      const json = await res.json();
      
      if (json.ok) {
        data = json.data;
        // 데이터 저장 및 시간 기록
        localStorage.setItem('math_course_data', JSON.stringify(data));
        localStorage.setItem('math_course_time', String(now));
      } else {
        throw new Error("데이터 형식이 올바르지 않습니다.");
      }
    }

    // 2. 데이터가 준비되었으므로 UI 업데이트
    courseTopicMap = data; // 전역 변수에 할당
    
    // 과정(Course) 목록 채우기
    const courses = Object.keys(courseTopicMap);
    courseSel.innerHTML = '<option value="">과정 선택</option>';
    
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      courseSel.appendChild(opt);
    });

    courseSel.disabled = false;
    courseSel.onchange = onCourseChange; // 코스 변경 시 토픽 업데이트 함수 연결

  } catch (e) {
    console.error(e);
    courseSel.innerHTML = '<option>로드 실패 (새로고침)</option>';
    alert("데이터를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// [보조 함수] 코스 변경 시 토픽 목록 갱신
function onCourseChange() {
  const courseSel = document.getElementById('course-select');
  const topicSel = document.getElementById('topic-select');
  
  const selectedCourse = courseSel.value;
  topicSel.innerHTML = '<option value="">주제 선택</option>';
  
  if (selectedCourse && courseTopicMap[selectedCourse]) {
    courseTopicMap[selectedCourse].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; // 주제명
      opt.innerText = t;
      topicSel.appendChild(opt);
    });
    topicSel.disabled = false;
  } else {
    topicSel.disabled = true;
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
  const total = gameState.totalQ;
  const current = gameState.currentIdx + 1; // 현재 문제 번호 (1부터 시작)

  // 1. 진행률 바 업데이트 (Progress Bar 로직)
  // 전체 문제 수 대비 현재 문제 번호의 비율로 width 설정
  const progressPercent = (gameState.currentIdx / total) * 100; 
  const timeBar = document.getElementById('time-bar');
  if (timeBar) {
    timeBar.style.width = `${progressPercent}%`;
    // (선택사항) 꽉 찼을 때 색상을 바꾸고 싶다면 CSS 추가 가능
  }

  // 2. 문제 번호 표시 (예: "Q. 3 / 10")
  const qNumEl = document.getElementById('q-number');
  if (qNumEl) qNumEl.innerText = `Q. ${current} / ${total}`;

  // 3. 문제 텍스트 렌더링 (KaTeX)
  const qTextEl = document.getElementById('q-text');
  if (qTextEl) {
    // 줄바꿈 처리 및 KaTeX 렌더링
    qTextEl.innerHTML = q.text.replace(/\n/g, '<br>');
    renderMathInElement(qTextEl, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false}
      ]
    });
  }

  // 4. 보기 버튼 렌더링 (기존 로직 유지)
  const choicesDiv = document.getElementById('choices');
  choicesDiv.innerHTML = '';

  // 보기 배열 섞기 (옵션) - 원치 않으면 q.choices 그대로 사용
  // 여기서는 단순히 q.choices를 순회한다고 가정
  q.choices.forEach((choiceText) => {
    const btn = document.createElement('button');
    btn.className = 'nes-btn choice-btn'; // 스타일 클래스
    
    // 보기 텍스트 넣기
    btn.innerHTML = choiceText;
    
    // 클릭 이벤트
    btn.onclick = () => checkAnswer(choiceText);

    choicesDiv.appendChild(btn);
  });

  // 보기 내부 수식 렌더링
  renderMathInElement(choicesDiv, {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "$", right: "$", display: false}
    ]
  });
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
  bindClick('btn-service-info', () => {
    showInfoScreen('서비스 소개', `
      <p><strong>Math Physical</strong>은 수학 개념 학습과 연산 피지컬 훈련을 동시에 할 수 있는 서비스입니다.</p>
      <p>구글 시트를 기반으로 작동하며, 누구나 무료로 이용할 수 있습니다.</p>
      <p>제한 시간 없이 나만의 페이스로 문제를 풀고 랭킹에 도전해보세요!</p>
    `);
  });

  bindClick('btn-privacy', () => {
    showInfoScreen('개인정보처리방침', `
      <p>본 서비스는 <strong>닉네임</strong>과 <strong>게임 기록(점수, 시간)</strong> 외의 개인식별정보를 수집하지 않습니다.</p>
      <p>수집된 데이터는 랭킹 산정 목적으로만 사용되며, 언제든지 구글 시트에서 삭제될 수 있습니다.</p>
    `);
  });

  bindClick('btn-contact', () => {
    showInfoScreen('문의하기', `
      <p>오류 제보나 기능 제안은 아래 이메일로 연락주세요.</p>
      <p style="margin-top:10px;">📧 <strong>mathkey77@gmail.com</strong></p> `);
  });
});

// [보조 함수] 정보 화면 띄우기 (만약 없다면 추가)
function showInfoScreen(title, htmlContent) {
  const titleEl = document.getElementById('info-title');
  const contentEl = document.getElementById('info-content');
  
  if(titleEl) titleEl.innerText = title;
  if(contentEl) contentEl.innerHTML = htmlContent;
  
  switchScreen('info-screen'); // info-screen 화면으로 전환
}


