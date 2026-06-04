'use strict';

const form = document.getElementById('quick-add-form');
const saveBtn = document.getElementById('save-btn');
const recentList = document.getElementById('recent-list');
const toast = document.getElementById('toast');
const statusDot = document.getElementById('status-dot');
const statusTitle = document.getElementById('status-title');
const statusDetail = document.getElementById('status-detail');

let toastTimer = null;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function addRecent(card) {
    if (recentList.children.length === 1 && recentList.children[0].textContent.includes('아직')) {
        recentList.innerHTML = '';
    }

    const item = document.createElement('li');
    item.innerHTML = `
        <strong>${escapeHtml(card.word)}</strong>
        <span>${escapeHtml(card.meaning)}</span>
        <small>${escapeHtml(card.example_sentence)}</small>
    `;
    recentList.prepend(item);

    while (recentList.children.length > 5) {
        recentList.lastElementChild.remove();
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function checkServer() {
    try {
        const res = await fetch('/api/add-word', { method: 'OPTIONS' });
        if (res.status !== 405 && !res.ok) throw new Error('server unavailable');
        statusDot.className = 'status-dot ok';
        statusTitle.textContent = '저장 가능';
        statusDetail.textContent = '단어를 입력하고 저장을 누르세요.';
    } catch (err) {
        statusDot.className = 'status-dot error';
        statusTitle.textContent = '연결 실패';
        statusDetail.textContent = '잠시 뒤 다시 시도하세요.';
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const word = document.getElementById('word-input').value.trim();
    if (!word) {
        showToast('영어 단어를 입력해주세요.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
        const res = await fetch('/api/add-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장에 실패했습니다.');

        addRecent(data.word);
        form.reset();
        document.getElementById('word-input').focus();
        showToast('저장했습니다.');
    } catch (err) {
        showToast(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
    }
});

checkServer();
