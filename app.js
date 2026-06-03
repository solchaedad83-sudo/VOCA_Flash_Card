/* ==========================================================================
   ANKI VOCA FLASHCARD APP — Main Application Controller
   - Single-Page Application Router
   - SuperMemo SM-2 Spaced Repetition Engine
   - REST API Integration (local Python server)
   ========================================================================== */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const State = {
    allWords: [],           // Full word list from voca.csv
    studyQueue: [],         // Cards queued for this study session
    currentCardIndex: 0,    // Pointer into studyQueue
    isFlipped: false,       // Whether flashcard is currently showing back
    totalForSession: 0,     // Total cards at session start (for progress bar)
    currentView: 'dashboard',
    libraryFilter: 'all',
    librarySearch: '',
    dailyNewLimit: 20,
    dailyReviewLimit: 50,
    editingWord: null,
};

function isOpenedDirectlyFromFile() {
    return window.location.protocol === 'file:';
}

function serverUrl() {
    return 'http://localhost:8000/';
}

// ─── API Helpers ─────────────────────────────────────────────────────────────
const API = {
    async getWords() {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words');
        if (!res.ok) throw new Error('단어 목록을 불러오는 데 실패했습니다.');
        return res.json();
    },
    async addWord(payload) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '단어 저장에 실패했습니다.');
        return data;
    },
    async updateWord(payload) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '카드 업데이트에 실패했습니다.');
        return data;
    },
    async deleteWord(word) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '삭제에 실패했습니다.');
        return data;
    },
    async importCsv(csvText) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어야 CSV를 불러올 수 있습니다.`);
        }
        const res = await fetch('/api/import-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv: csvText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'CSV 파일 불러오기에 실패했습니다.');
        return data;
    },
    async editWord(payload) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '단어 수정에 실패했습니다.');
        return data;
    },
    async resetWord(word) {
        if (isOpenedDirectlyFromFile()) {
            throw new Error(`앱을 ${serverUrl()} 주소로 열어주세요.`);
        }
        const res = await fetch('/api/words/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '학습 기록 초기화에 실패했습니다.');
        return data;
    },
};

// ─── SuperMemo SM-2 Engine ────────────────────────────────────────────────────
const SM2 = {
    /**
     * Calculate next review parameters.
     * @param {object} card - current card with interval, ease_factor, repetitions
     * @param {number} grade - 1=Again, 2=Hard, 3=Good, 4=Easy
     * @returns {object} updated { interval, ease_factor, repetitions, due_date }
     */
    calculate(card, grade) {
        let { interval, ease_factor, repetitions } = card;
        ease_factor = parseFloat(ease_factor) || 2.5;
        interval = parseInt(interval) || 0;
        repetitions = parseInt(repetitions) || 0;

        // Ease factor update (SM-2 formula)
        ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        ease_factor = Math.max(1.3, parseFloat(ease_factor.toFixed(4)));

        if (grade <= 2) {
            // Again or Hard → reset
            repetitions = 0;
            interval = grade === 1 ? 1 : 1;
        } else if (grade === 3) {
            // Good
            if (repetitions === 0) interval = 1;
            else if (repetitions === 1) interval = 3;
            else interval = Math.round(interval * ease_factor);
            repetitions += 1;
        } else {
            // Easy
            if (repetitions === 0) interval = 3;
            else if (repetitions === 1) interval = 6;
            else interval = Math.round(interval * ease_factor * 1.3);
            repetitions += 1;
        }

        const due_date = this.addDays(new Date(), interval);
        return { interval, ease_factor, repetitions, due_date };
    },

    addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    },

    today() {
        return new Date().toISOString().split('T')[0];
    },

    isDue(card) {
        if (this.isNew(card)) return true;
        if (!card.due_date) return true; // new card
        return card.due_date <= this.today();
    },

    isNew(card) {
        return !card.due_date || card.due_date === '' || parseInt(card.repetitions) === 0;
    },

    isMastered(card) {
        return parseInt(card.interval) >= 21;
    },

    isLearning(card) {
        return !this.isNew(card) && !this.isMastered(card);
    },

    isReview(card) {
        return !this.isNew(card) && this.isMastered(card);
    },

    /** Preview next interval string for a given grade */
    previewInterval(card, grade) {
        if (grade === 1) return '<1분';
        const result = this.calculate(card, grade);
        const days = result.interval;
        if (days === 1) return '1일';
        if (days < 7) return `${days}일`;
        if (days < 30) return `${Math.round(days / 7)}주`;
        return `${Math.round(days / 30)}개월`;
    },
};

// ─── Toast Notification ───────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
    toast.className = `toast ${type}`;
    toastMsg.textContent = message;

    // Update lucide icon
    toastIcon.setAttribute('data-lucide', icons[type] || 'info');
    lucide.createIcons({ icons: { [icons[type]]: lucide.icons[icons[type]] } });

    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─── Router / View Management ────────────────────────────────────────────────
const VIEW_META = {
    dashboard: { title: '대시보드', desc: '오늘의 학습 진행 상황과 암기 현황을 확인하세요.' },
    study:     { title: '카드 학습', desc: 'Anki 방식의 스페이스드 리피티션으로 효율적으로 학습하세요.' },
    add:       { title: '단어 추가', desc: '새로운 영어 단어나 표현을 단어장에 등록하세요.' },
    library:   { title: '단어장 관리', desc: '등록된 모든 단어를 검색, 필터링하고 관리하세요.' },
};

function navigateTo(viewName) {
    // Hide all panels
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target panel
    const panel = document.getElementById(`${viewName}-view`);
    if (panel) panel.classList.add('active');

    // Activate nav button
    const navBtn = document.querySelector(`.nav-item[data-target="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Update header
    const meta = VIEW_META[viewName] || {};
    document.getElementById('view-title').textContent = meta.title || viewName;
    document.getElementById('view-description').textContent = meta.desc || '';

    State.currentView = viewName;

    // View-specific initialisation
    if (viewName === 'dashboard') updateDashboard();
    if (viewName === 'study')     initStudySession();
    if (viewName === 'library')   renderLibrary();
}

// ─── Load Data ────────────────────────────────────────────────────────────────
async function loadWords() {
    try {
        State.allWords = await API.getWords();
    } catch (err) {
        showToast(err.message || '서버에서 단어를 불러오지 못했습니다. 서버가 실행 중인지 확인하세요.', 'error');
        State.allWords = [];
    }
}

// ─── Header Stats ─────────────────────────────────────────────────────────────
function updateHeaderStats() {
    const words = State.allWords;
    const newCards = words.filter(w => SM2.isNew(w)).length;
    const dueCards = words.filter(w => !SM2.isNew(w) && SM2.isDue(w)).length;

    document.getElementById('header-new-count').textContent = newCards;
    document.getElementById('header-due-count').textContent = dueCards;
    document.getElementById('header-total-count').textContent = words.length;
    document.getElementById('nav-due-count').textContent = newCards + dueCards;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function updateDashboard() {
    const words = State.allWords;
    const total = words.length;
    const newCards = words.filter(w => SM2.isNew(w)).length;
    const dueCards = words.filter(w => !SM2.isNew(w) && SM2.isDue(w)).length;
    const mastered = words.filter(w => SM2.isMastered(w)).length;
    const learning = words.filter(w => SM2.isLearning(w)).length;
    const studied = total - newCards;
    const rate = total > 0 ? Math.round((studied / total) * 100) : 0;

    document.getElementById('dash-due-value').textContent = dueCards;
    document.getElementById('dash-new-value').textContent = newCards;
    document.getElementById('dash-mastered-value').textContent = mastered;
    document.getElementById('dash-rate-value').textContent = `${rate}%`;

    // Circular progress (circumference = 2π × 70 ≈ 439.8)
    const circumference = 439.8;
    const offset = circumference - (rate / 100) * circumference;
    document.getElementById('circular-progress-bar').style.strokeDashoffset = offset;
    document.getElementById('dash-circular-percent').textContent = `${rate}%`;

    // Legend
    document.getElementById('legend-new-val').textContent = `${newCards}개`;
    document.getElementById('legend-learning-val').textContent = `${learning}개`;
    document.getElementById('legend-mastered-val').textContent = `${mastered}개`;
}

// ─── Study Session ────────────────────────────────────────────────────────────
function initStudySession() {
    const newCards = State.allWords
        .filter(w => SM2.isNew(w))
        .slice(0, State.dailyNewLimit);
    const learningCards = State.allWords
        .filter(w => SM2.isLearning(w) && SM2.isDue(w));
    const reviewCards = State.allWords
        .filter(w => SM2.isReview(w) && SM2.isDue(w))
        .slice(0, State.dailyReviewLimit);
    State.studyQueue = [...newCards, ...learningCards, ...reviewCards];
    State.currentCardIndex = 0;
    State.totalForSession = State.studyQueue.length;

    const hasCards = State.studyQueue.length > 0;
    document.getElementById('empty-study-state').style.display = hasCards ? 'none' : 'flex';
    document.getElementById('flashcard-container').style.display = hasCards ? 'block' : 'none';
    document.querySelector('.study-progress-bar-container').style.display = hasCards ? 'block' : 'none';
    document.getElementById('front-actions').style.display = hasCards ? 'flex' : 'none';
    document.getElementById('back-actions').style.display = 'none';

    if (hasCards) {
        loadCard(0);
    }
}

function showStudyComplete() {
    document.getElementById('empty-study-state').style.display = 'flex';
    document.getElementById('flashcard-container').style.display = 'none';
    document.querySelector('.study-progress-bar-container').style.display = 'none';
    document.getElementById('front-actions').style.display = 'none';
    document.getElementById('back-actions').style.display = 'none';

    document.getElementById('study-progress-fill').style.width = '100%';
    document.getElementById('study-remaining-text').textContent = '남은 카드: 0장';
    document.getElementById('study-session-percent').textContent = '100%';
}

function loadCard(index) {
    const card = State.studyQueue[index];
    if (!card) return;

    State.isFlipped = false;
    const flashcard = document.getElementById('flashcard-element');
    flashcard.classList.remove('flipped');

    // Front
    document.getElementById('card-front-word').textContent = card.word;

    // Back
    document.getElementById('card-back-meaning').textContent = card.meaning;

    const exampleContainer = document.getElementById('card-example-container');
    if (card.example_sentence) {
        exampleContainer.style.display = 'block';
        document.getElementById('card-back-example-en').textContent = card.example_sentence;
        document.getElementById('card-back-example-ko').textContent = card.example_translation || '';
    } else {
        exampleContainer.style.display = 'none';
    }

    // Preview intervals on rating buttons
    document.getElementById('time-again').textContent = SM2.previewInterval(card, 1);
    document.getElementById('time-hard').textContent  = SM2.previewInterval(card, 2);
    document.getElementById('time-good').textContent  = SM2.previewInterval(card, 3);
    document.getElementById('time-easy').textContent  = SM2.previewInterval(card, 4);

    // Progress bar
    const done = index;
    const total = State.totalForSession;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('study-progress-fill').style.width = `${pct}%`;
    document.getElementById('study-remaining-text').textContent = `남은 카드: ${total - done}장`;
    document.getElementById('study-session-percent').textContent = `${pct}%`;

    // Show front actions, hide back actions
    document.getElementById('front-actions').style.display = 'flex';
    document.getElementById('back-actions').style.display = 'none';
}

function flipCard() {
    State.isFlipped = !State.isFlipped;
    const flashcard = document.getElementById('flashcard-element');
    flashcard.classList.toggle('flipped', State.isFlipped);

    if (State.isFlipped) {
        document.getElementById('front-actions').style.display = 'none';
        document.getElementById('back-actions').style.display = 'grid';
    } else {
        document.getElementById('front-actions').style.display = 'flex';
        document.getElementById('back-actions').style.display = 'none';
    }
}

async function gradeCard(grade) {
    const card = State.studyQueue[State.currentCardIndex];
    if (!card) {
        showStudyComplete();
        return;
    }

    const updated = SM2.calculate(card, grade);

    // Update local state immediately for smooth UX
    const globalCard = State.allWords.find(w => w.word === card.word);
    if (globalCard) {
        Object.assign(globalCard, updated);
    }
    Object.assign(card, updated);

    // Persist to CSV via API (non-blocking)
    API.updateWord({ word: card.word, ...updated }).catch(() => {
        showToast('복습 기록 저장에 실패했습니다.', 'error');
    });

    // Advance to next card
    State.currentCardIndex += 1;
    if (State.currentCardIndex >= State.studyQueue.length) {
        // Session complete
        showStudyComplete();
        updateHeaderStats();
    } else {
        loadCard(State.currentCardIndex);
    }
}

// ─── Text-to-Speech ───────────────────────────────────────────────────────────
function speakWord() {
    const word = document.getElementById('card-front-word').textContent.trim();
    if (!word || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

// ─── Add Word Form ────────────────────────────────────────────────────────────
function validateAddForm() {
    const wordInput   = document.getElementById('input-word');
    const meaningInput = document.getElementById('input-meaning');
    let valid = true;

    if (!wordInput.value.trim()) {
        document.getElementById('input-word').closest('.form-group').classList.add('error');
        valid = false;
    } else {
        document.getElementById('input-word').closest('.form-group').classList.remove('error');
    }

    if (!meaningInput.value.trim()) {
        document.getElementById('input-meaning').closest('.form-group').classList.add('error');
        valid = false;
    } else {
        document.getElementById('input-meaning').closest('.form-group').classList.remove('error');
    }

    return valid;
}

async function handleAddWord(e) {
    e.preventDefault();
    if (!validateAddForm()) return;

    const btn = document.getElementById('submit-word-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = '저장 중...';

    const payload = {
        word:                document.getElementById('input-word').value.trim(),
        meaning:             document.getElementById('input-meaning').value.trim(),
        example_sentence:    document.getElementById('input-example-en').value.trim(),
        example_translation: document.getElementById('input-example-ko').value.trim(),
    };

    try {
        await API.addWord(payload);
        showToast(`"${payload.word}" 단어가 추가되었습니다!`, 'success');
        // Reset form
        document.getElementById('add-word-form').reset();
        // Refresh word list
        await loadWords();
        updateHeaderStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = '단어장에 저장하기';
    }
}

async function handleImportCsv(e) {
    e.preventDefault();

    const fileInput = document.getElementById('csv-file-input');
    const importBtn = document.getElementById('import-csv-btn');
    const file = fileInput.files[0];

    if (!file) {
        showToast('불러올 voca.csv 파일을 선택해주세요.', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('CSV 파일만 불러올 수 있습니다.', 'error');
        return;
    }

    const confirmed = confirm('선택한 CSV로 현재 voca.csv 전체를 교체합니다. 계속할까요?');
    if (!confirmed) return;

    importBtn.disabled = true;
    importBtn.querySelector('span').textContent = '불러오는 중...';

    try {
        const csvText = await file.text();
        const result = await API.importCsv(csvText);
        fileInput.value = '';
        showToast(`${result.count}개 단어를 불러왔습니다. 백업: backup/${result.backup}`, 'success');
        await loadWords();
        updateHeaderStats();
        updateDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.querySelector('span').textContent = 'CSV 불러오기';
    }
}

// ─── Library View ─────────────────────────────────────────────────────────────
function getWordStatus(card) {
    if (SM2.isNew(card))      return 'new';
    if (SM2.isMastered(card)) return 'mastered';
    return 'learning';
}

function renderLibrary() {
    const tbody = document.getElementById('library-table-body');
    const emptyState = document.getElementById('empty-library-state');
    const search = State.librarySearch.toLowerCase();
    const filter = State.libraryFilter;
    const today  = SM2.today();

    let words = State.allWords.filter(w => {
        const matchesSearch = !search ||
            w.word.toLowerCase().includes(search) ||
            w.meaning.toLowerCase().includes(search);

        let matchesFilter = true;
        if (filter === 'new')      matchesFilter = SM2.isNew(w);
        if (filter === 'learning') matchesFilter = SM2.isLearning(w);
        if (filter === 'mastered') matchesFilter = SM2.isMastered(w);
        if (filter === 'due')      matchesFilter = !SM2.isNew(w) && SM2.isDue(w);

        return matchesSearch && matchesFilter;
    });

    if (words.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    const statusLabels = { new: '미학습', learning: '학습중', mastered: '장기기억' };

    tbody.innerHTML = words.map(w => {
        const status = getWordStatus(w);
        const dueLabel = w.due_date ? w.due_date : '—';
        const isDue = !SM2.isNew(w) && SM2.isDue(w);
        const dueCellClass = isDue ? 'style="color:var(--accent-orange);font-weight:700;"' : '';
        const wordAttr = escapeHtml(w.word);
        return `
        <tr>
          <td class="td-word">${escapeHtml(w.word)}</td>
          <td class="td-meaning">${escapeHtml(w.meaning)}</td>
          <td><span class="state-tag ${status}">${statusLabels[status]}</span></td>
          <td>${w.interval}일</td>
          <td>${parseFloat(w.ease_factor).toFixed(2)}</td>
          <td ${dueCellClass}>${dueLabel}</td>
          <td>
            <div class="table-actions">
              <button class="table-action-btn" data-action="edit" data-word="${wordAttr}">수정</button>
              <button class="table-action-btn" data-action="reset" data-word="${wordAttr}">리셋</button>
              <button class="table-action-btn danger" data-action="delete" data-word="${wordAttr}">삭제</button>
            </div>
          </td>
        </tr>`;
    }).join('');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function handleDeleteWord(word) {
    if (!confirm(`"${word}" 단어를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.`)) return;
    try {
        await API.deleteWord(word);
        showToast(`"${word}" 단어가 삭제되었습니다.`, 'success');
        await loadWords();
        updateHeaderStats();
        renderLibrary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openEditModal(word) {
    const card = State.allWords.find(w => w.word === word);
    if (!card) return;
    State.editingWord = card.word;
    document.getElementById('edit-original-word').value = card.word;
    document.getElementById('edit-word').value = card.word;
    document.getElementById('edit-meaning').value = card.meaning;
    document.getElementById('edit-example-en').value = card.example_sentence || '';
    document.getElementById('edit-example-ko').value = card.example_translation || '';
    document.getElementById('edit-interval').value = card.interval || 0;
    document.getElementById('edit-ease-factor').value = card.ease_factor || 2.5;
    document.getElementById('edit-repetitions').value = card.repetitions || 0;
    document.getElementById('edit-due-date').value = card.due_date || '';
    document.getElementById('edit-word-modal').classList.add('show');
}

function closeEditModal() {
    State.editingWord = null;
    document.getElementById('edit-word-modal').classList.remove('show');
}

async function handleEditWord(e) {
    e.preventDefault();
    const payload = {
        original_word: document.getElementById('edit-original-word').value,
        word: document.getElementById('edit-word').value.trim(),
        meaning: document.getElementById('edit-meaning').value.trim(),
        example_sentence: document.getElementById('edit-example-en').value.trim(),
        example_translation: document.getElementById('edit-example-ko').value.trim(),
        interval: document.getElementById('edit-interval').value,
        ease_factor: document.getElementById('edit-ease-factor').value,
        repetitions: document.getElementById('edit-repetitions').value,
        due_date: document.getElementById('edit-due-date').value,
    };

    try {
        await API.editWord(payload);
        closeEditModal();
        showToast(`"${payload.word}" 단어를 수정했습니다.`, 'success');
        await loadWords();
        updateHeaderStats();
        renderLibrary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleResetWord(word) {
    if (!confirm(`"${word}" 학습 기록을 처음 상태로 초기화할까요?`)) return;
    try {
        await API.resetWord(word);
        showToast(`"${word}" 학습 기록을 초기화했습니다.`, 'success');
        await loadWords();
        updateHeaderStats();
        renderLibrary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
function wireEvents() {
    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.target));
    });

    // Dashboard → start study
    document.getElementById('dash-start-study-btn').addEventListener('click', () => navigateTo('study'));
    document.getElementById('go-dashboard-btn').addEventListener('click', () => navigateTo('dashboard'));

    document.getElementById('new-limit-input').addEventListener('change', (e) => {
        State.dailyNewLimit = Math.max(0, parseInt(e.target.value) || 0);
        if (State.currentView === 'study') initStudySession();
    });
    document.getElementById('review-limit-input').addEventListener('change', (e) => {
        State.dailyReviewLimit = Math.max(0, parseInt(e.target.value) || 0);
        if (State.currentView === 'study') initStudySession();
    });

    // Flashcard flip (click on card or Space bar)
    document.getElementById('flashcard-element').addEventListener('click', () => {
        if (!State.isFlipped) flipCard();
    });
    document.getElementById('reveal-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        flipCard();
    });

    // Keyboard: Space = flip, 1–4 = grade
    document.addEventListener('keydown', (e) => {
        if (State.currentView !== 'study') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.code === 'Space' && !State.isFlipped) {
            e.preventDefault();
            flipCard();
        }
        if (State.isFlipped) {
            if (e.key === '1') gradeCard(1);
            if (e.key === '2') gradeCard(2);
            if (e.key === '3') gradeCard(3);
            if (e.key === '4') gradeCard(4);
        }
    });

    // Rating buttons
    document.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', () => gradeCard(parseInt(btn.dataset.grade)));
    });

    // TTS button
    document.getElementById('tts-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        speakWord();
    });

    // Add Word form
    document.getElementById('add-word-form').addEventListener('submit', handleAddWord);
    document.getElementById('csv-import-form').addEventListener('submit', handleImportCsv);
    document.getElementById('edit-word-form').addEventListener('submit', handleEditWord);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-word-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-word-modal') closeEditModal();
    });

    // Library: search
    document.getElementById('library-search-input').addEventListener('input', (e) => {
        State.librarySearch = e.target.value;
        renderLibrary();
    });

    // Library: filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.libraryFilter = btn.dataset.filter;
            renderLibrary();
        });
    });

    document.getElementById('library-table-body').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const word = btn.dataset.word;
        if (btn.dataset.action === 'edit') openEditModal(word);
        if (btn.dataset.action === 'reset') handleResetWord(word);
        if (btn.dataset.action === 'delete') handleDeleteWord(word);
    });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
    await loadWords();
    updateHeaderStats();
    updateDashboard();
    wireEvents();
    lucide.createIcons();

    // Navigate to dashboard by default
    navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
