'use strict';

const state = {
    allWords: [],
    queue: [],
    current: null,
    completed: 0,
    total: 0,
    revealed: false,
    dailyNewLimit: 20,
    dailyReviewLimit: 50,
};

const els = {
    dueCount: document.getElementById('due-count'),
    newCount: document.getElementById('new-count'),
    totalCount: document.getElementById('total-count'),
    sessionLabel: document.getElementById('session-label'),
    progressCount: document.getElementById('progress-count'),
    progressFill: document.getElementById('progress-fill'),
    cardStage: document.getElementById('card-stage'),
    studyCard: document.getElementById('study-card'),
    cardKicker: document.getElementById('card-kicker'),
    word: document.getElementById('card-word'),
    meaning: document.getElementById('card-meaning'),
    example: document.getElementById('card-example'),
    translation: document.getElementById('card-translation'),
    answerPanel: document.getElementById('answer-panel'),
    emptyState: document.getElementById('empty-state'),
    revealBtn: document.getElementById('reveal-btn'),
    ratingGrid: document.getElementById('rating-grid'),
    soundBtn: document.getElementById('sound-btn'),
    toast: document.getElementById('toast'),
    againTime: document.getElementById('again-time'),
    hardTime: document.getElementById('hard-time'),
    goodTime: document.getElementById('good-time'),
    easyTime: document.getElementById('easy-time'),
};

let toastTimer = null;

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeDueDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const match = raw.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    return raw.slice(0, 10);
}

function normalizeCard(card) {
    return {
        word: String(card.word || '').trim(),
        meaning: String(card.meaning || '').trim(),
        example_sentence: String(card.example_sentence || '').trim(),
        example_translation: String(card.example_translation || '').trim(),
        interval: Math.max(0, Number.parseInt(card.interval || 0, 10) || 0),
        ease_factor: Math.max(1.3, Number.parseFloat(card.ease_factor || 2.5) || 2.5),
        repetitions: Math.max(0, Number.parseInt(card.repetitions || 0, 10) || 0),
        due_date: normalizeDueDate(card.due_date),
        created_at: String(card.created_at || '').trim(),
    };
}

function isNew(card) {
    return !card.due_date || card.repetitions === 0;
}

function isDue(card) {
    return isNew(card) || card.due_date <= todayKey();
}

function calculateNext(card, grade) {
    let interval = Number.parseInt(card.interval || 0, 10) || 0;
    let ease = Number.parseFloat(card.ease_factor || 2.5) || 2.5;
    let repetitions = Number.parseInt(card.repetitions || 0, 10) || 0;

    ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    ease = Math.max(1.3, Number.parseFloat(ease.toFixed(4)));

    if (grade === 1) {
        interval = 0;
        repetitions = 0;
    } else if (grade === 2) {
        interval = 1;
        repetitions = 0;
    } else if (grade === 3) {
        if (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 3;
        else interval = Math.max(1, Math.round(interval * ease));
        repetitions += 1;
    } else {
        if (repetitions === 0) interval = 3;
        else if (repetitions === 1) interval = 6;
        else interval = Math.max(1, Math.round(interval * ease * 1.3));
        repetitions += 1;
    }

    return {
        interval,
        ease_factor: ease,
        repetitions,
        due_date: addDays(interval),
    };
}

function previewInterval(card, grade) {
    const next = calculateNext(card, grade);
    if (grade === 1 || next.interval === 0) return '오늘';
    if (next.interval === 1) return '1일';
    if (next.interval < 7) return `${next.interval}일`;
    if (next.interval < 30) return `${Math.round(next.interval / 7)}주`;
    return `${Math.round(next.interval / 30)}개월`;
}

async function fetchWords() {
    const res = await fetch('/api/cloud-words');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '단어를 불러오지 못했습니다.');
    return data.map(normalizeCard).filter((card) => card.word);
}

async function updateStats(card, next) {
    const res = await fetch('/api/cloud-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'update_stats',
            word: card.word,
            interval: next.interval,
            ease_factor: next.ease_factor,
            repetitions: next.repetitions,
            due_date: next.due_date,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '학습 기록 저장에 실패했습니다.');
    return data;
}

function buildQueue(words) {
    const reviewCards = words
        .filter((card) => !isNew(card) && isDue(card))
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, state.dailyReviewLimit);

    const newCards = words
        .filter(isNew)
        .slice(0, state.dailyNewLimit);

    return [...reviewCards, ...newCards];
}

function updateSummary() {
    const due = state.allWords.filter((card) => !isNew(card) && isDue(card)).length;
    const fresh = state.allWords.filter(isNew).length;
    els.dueCount.textContent = due;
    els.newCount.textContent = fresh;
    els.totalCount.textContent = state.allWords.length;
}

function updateProgress() {
    const total = state.total || 0;
    const done = state.completed || 0;
    const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;

    els.progressCount.textContent = `${done} / ${total}`;
    els.progressFill.style.width = `${percent}%`;
    els.sessionLabel.textContent = state.current ? '오늘의 학습' : '학습 완료';
}

function setAnswerVisible(visible) {
    state.revealed = visible;
    els.answerPanel.hidden = !visible;
    els.revealBtn.hidden = visible;
    els.ratingGrid.hidden = !visible;
}

function renderCard() {
    const card = state.current;
    if (!card) {
        els.cardStage.hidden = true;
        els.emptyState.hidden = false;
        els.revealBtn.hidden = true;
        els.ratingGrid.hidden = true;
        updateProgress();
        return;
    }

    els.cardStage.hidden = false;
    els.emptyState.hidden = true;
    els.cardKicker.textContent = isNew(card) ? '신규 카드' : '복습 카드';
    els.word.textContent = card.word;
    els.meaning.textContent = card.meaning || '뜻 정보가 없습니다.';
    els.example.textContent = card.example_sentence || '';
    els.translation.textContent = card.example_translation || '';
    els.againTime.textContent = previewInterval(card, 1);
    els.hardTime.textContent = previewInterval(card, 2);
    els.goodTime.textContent = previewInterval(card, 3);
    els.easyTime.textContent = previewInterval(card, 4);
    setAnswerVisible(false);
    updateProgress();
}

function nextCard() {
    state.current = state.queue.shift() || null;
    renderCard();
}

async function loadStudy() {
    els.sessionLabel.textContent = '단어 불러오는 중';
    try {
        state.allWords = await fetchWords();
        state.queue = buildQueue(state.allWords);
        state.total = state.queue.length;
        state.completed = 0;
        updateSummary();
        nextCard();
    } catch (error) {
        els.cardStage.hidden = true;
        els.emptyState.hidden = false;
        els.emptyState.querySelector('h2').textContent = '단어를 불러오지 못했습니다';
        els.emptyState.querySelector('p').textContent = error.message;
        els.revealBtn.hidden = true;
        showToast(error.message);
    }
}

async function handleRating(grade) {
    if (!state.current) return;

    const card = state.current;
    const next = calculateNext(card, grade);
    const ratingButtons = [...document.querySelectorAll('.rating-btn')];
    ratingButtons.forEach((button) => { button.disabled = true; });

    try {
        await updateStats(card, next);
        Object.assign(card, next);
        state.completed += 1;

        if (grade === 1 && state.completed < 80) {
            state.queue.push(card);
            state.total += 1;
        }

        nextCard();
    } catch (error) {
        showToast(error.message);
    } finally {
        ratingButtons.forEach((button) => { button.disabled = false; });
    }
}

function speakCurrentWord() {
    if (!state.current || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.current.word);
    utterance.lang = 'en-US';
    utterance.rate = 0.86;
    window.speechSynthesis.speak(utterance);
}

els.revealBtn.addEventListener('click', () => setAnswerVisible(true));
els.studyCard.addEventListener('click', () => {
    if (state.current && !state.revealed) setAnswerVisible(true);
});
els.soundBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    speakCurrentWord();
});
els.ratingGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.rating-btn');
    if (!button) return;
    handleRating(Number.parseInt(button.dataset.grade, 10));
});

loadStudy();
