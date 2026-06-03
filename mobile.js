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
        statusTitle.textContent = 'Vercel 앱 준비됨';
        statusDetail.textContent = '영어 단어를 입력하면 AI가 voca.csv 형식으로 저장합니다.';
    } catch (err) {
        statusDot.className = 'status-dot error';
        statusTitle.textContent = 'API 연결 실패';
        statusDetail.textContent = 'Vercel 배포와 환경변수 설정을 확인하세요.';
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const word = document.getElementById('word-input').value.trim();
    const secret = document.getElementById('secret-input').value.trim();

    if (!word) {
        showToast('영어 단어를 입력해주세요.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'AI가 채우는 중...';

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (secret) headers['x-add-word-secret'] = secret;

        const res = await fetch('/api/add-word', {
            method: 'POST',
            headers,
            body: JSON.stringify({ word }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장에 실패했습니다.');

        addRecent(data.word);
        form.reset();
        document.getElementById('word-input').focus();
        showToast('AI가 채운 단어를 voca.csv에 저장했습니다.');
    } catch (err) {
        showToast(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'AI로 생성하고 저장';
    }
});

checkServer();
