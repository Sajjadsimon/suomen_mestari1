// Suomi Mestari 1 — Personal Finnish Vocabulary Practice PWA
// Client-side offline-first architecture with SRS & Web Speech API

(function() {
  'use strict';

  // --- STATE ---
  let vocabData = null;
  let conceptsMap = new Map();
  let currentQueue = [];
  let currentIndex = 0;
  let isCardFlipped = false;
  let currentMode = 'fi_to_en'; // 'fi_to_en' or 'en_to_fi'
  let audioSpeed = 0.9;
  let activeFilter = 'all';

  // --- STORAGE KEYS ---
  const STORAGE_STATES = 'suomi_pwa_learning_states';
  const STORAGE_REVIEWS = 'suomi_pwa_review_events';
  const STORAGE_SETTINGS = 'suomi_pwa_settings';

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorker();
    initNavigation();
    initAudioVoices();
    initAudioToggle();
    initDiacriticKeys();
    initCardActions();
    initDictionary();
    initConfusingModal();
    initStandaloneExperience();
    initSync();
    updateStreakDisplay();

    try {
      const response = await fetch('./data/vocab_data.json');
      if (!response.ok) throw new Error('Data fetch failed');
      vocabData = await response.json();
      
      // Index concepts
      vocabData.concepts.forEach(c => conceptsMap.set(c.id, c));
      
      renderTopics();
      updateTodayStats();
      renderStatsView();
      renderDictionaryList();
      
      document.getElementById('badge-total-concepts').textContent = `${vocabData.total_concepts.toLocaleString('fi-FI')} sanaa`;
    } catch (err) {
      console.error('Error loading vocabulary:', err);
      alert('Virhe ladattaessa sanastoa. Varmista verkkoyhteys ensimmäisellä kerralla.');
    }
  });

  // --- SERVICE WORKER ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('PWA Service Worker registered:', reg.scope))
        .catch(err => console.log('SW registration error:', err));
    }
  }

  // --- NAVIGATION ---
  function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.getAttribute('data-tab');
        switchView(tabId);
      });
    });

    document.getElementById('card-confusing-shortcut')?.addEventListener('click', () => {
      startConfusingPractice();
    });

    document.getElementById('practice-confusing-btn')?.addEventListener('click', () => {
      startConfusingPractice();
    });

    document.getElementById('btn-start-today')?.addEventListener('click', () => {
      startTodaySession();
    });
  }

  function switchView(tabId) {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.add('active');

    const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeNav) activeNav.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'view-today') updateTodayStats();
    if (tabId === 'view-stats') renderStatsView();
  }

  // --- STANDALONE & IOS PWA EXPERIENCE ---
  function initStandaloneExperience() {
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    const banner = document.getElementById('ios-standalone-banner');
    const dismissBtn = document.getElementById('btn-dismiss-install');

    if (banner && dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.style.display = 'none';
        sessionStorage.setItem('dismissed_install_banner', '1');
      });

      // Show banner if in regular Safari browser and not yet launched in standalone
      if (!isStandalone && isIOS && !sessionStorage.getItem('dismissed_install_banner')) {
        banner.style.display = 'flex';
      }
    }

    // In iOS standalone mode, ensure internal navigation doesn't bounce out to regular Safari
    if (isStandalone) {
      document.addEventListener('click', (e) => {
        let el = e.target;
        while (el && el.nodeName !== 'A') {
          el = el.parentNode;
        }
        if (el && el.nodeName === 'A') {
          const href = el.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#')) {
            e.preventDefault();
            window.location = href;
          }
        }
      });
    }
  }

  // --- STORAGE HELPERS ---
  function getLearningStates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_STATES)) || {};
    } catch {
      return {};
    }
  }

  function saveLearningStates(states) {
    localStorage.setItem(STORAGE_STATES, JSON.stringify(states));
  }

  function getReviewEvents() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_REVIEWS)) || [];
    } catch {
      return [];
    }
  }

  function logReviewEvent(conceptId, result, direction) {
    const events = getReviewEvents();
    events.push({
      concept_id: conceptId,
      result: result,
      direction: direction,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_REVIEWS, JSON.stringify(events));
    updateStreakOnReview();
  }

  // --- AUDIO SPEECH SYNTHESIS & NATIVE AUDIO ---
  let cachedFiVoice = null;
  let activeAudioPlayer = null;

  function initAudioVoices() {
    if (!('speechSynthesis' in window)) return;

    function findVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      cachedFiVoice = voices.find(v => {
        const lang = (v.lang || '').toLowerCase().replace('_', '-');
        const name = (v.name || '').toLowerCase();
        return lang.startsWith('fi') || name.includes('finnish') || name.includes('suomi') || name.includes('satu') || name.includes('onni');
      }) || null;
    }

    findVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  function initAudioToggle() {
    const btn = document.getElementById('btn-audio-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      audioSpeed = audioSpeed === 0.9 ? 0.75 : 0.9;
      btn.textContent = audioSpeed === 0.9 ? '🔊' : '🐢';
      btn.title = `Puhenopeus: ${audioSpeed}x`;
    });
  }

  function speakFinnish(text) {
    if (!text) return;

    // Clean word of parentheticals or slashes for natural Finnish pronunciation
    const clean = text
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\//g, ' tai ')
      .replace(/;/g, ', ')
      .trim();
    if (!clean) return;

    // Cancel any ongoing audio
    if (activeAudioPlayer) {
      try {
        activeAudioPlayer.pause();
        activeAudioPlayer.currentTime = 0;
      } catch (e) {}
      activeAudioPlayer = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Primary: Google Translate Finnish TTS provides authentic native Finnish phonetics
    // regardless of whether the mobile phone has Finnish voice pack downloaded
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=fi&client=tw-ob&q=${encodeURIComponent(clean)}`;
    const audio = new Audio(ttsUrl);
    audio.playbackRate = audioSpeed;
    activeAudioPlayer = audio;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback to local device SpeechSynthesis if offline or audio element blocked
        fallbackToSpeechSynthesis(clean);
      });
    } else {
      fallbackToSpeechSynthesis(clean);
    }
  }

  function fallbackToSpeechSynthesis(clean) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'fi-FI';
    utterance.rate = audioSpeed;

    if (!cachedFiVoice) {
      const voices = window.speechSynthesis.getVoices();
      cachedFiVoice = voices.find(v => {
        const lang = (v.lang || '').toLowerCase().replace('_', '-');
        const name = (v.name || '').toLowerCase();
        return lang.startsWith('fi') || name.includes('finnish') || name.includes('suomi') || name.includes('satu') || name.includes('onni');
      }) || null;
    }

    if (cachedFiVoice) {
      utterance.voice = cachedFiVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  // --- SRS ENGINE (SM-2 Modified) ---
  function getConceptState(conceptId) {
    const states = getLearningStates();
    return states[conceptId] || {
      status: 'new',
      interval_days: 0,
      ease: 2.5,
      repetitions: 0,
      lapses: 0,
      next_review_at: new Date(0).toISOString(),
      last_reviewed_at: null
    };
  }

  function updateConceptSRS(conceptId, result) {
    const states = getLearningStates();
    const current = getConceptState(conceptId);
    const now = new Date();

    let interval = current.interval_days;
    let ease = current.ease || 2.5;
    let reps = current.repetitions || 0;
    let lapses = current.lapses || 0;
    let status = current.status;

    if (result === 'forgot') {
      lapses++;
      reps = 0;
      interval = 0.01; // ~15 minutes
      ease = Math.max(1.3, ease - 0.2);
      status = 'learning';
    } else if (result === 'hard') {
      interval = Math.max(1, Math.round(interval * 1.1));
      ease = Math.max(1.3, ease - 0.15);
      reps = Math.max(1, reps);
      status = 'learning';
    } else if (result === 'good') {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.round(interval * ease);
      reps++;
      status = interval >= 7 ? 'mastered' : 'learning';
    } else if (result === 'easy') {
      if (reps === 0) interval = 4;
      else interval = Math.round(interval * ease * 1.35);
      reps++;
      ease += 0.15;
      status = 'mastered';
    }

    const nextDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    states[conceptId] = {
      status: status,
      interval_days: interval,
      ease: parseFloat(ease.toFixed(2)),
      repetitions: reps,
      lapses: lapses,
      next_review_at: nextDate.toISOString(),
      last_reviewed_at: now.toISOString()
    };

    saveLearningStates(states);
    logReviewEvent(conceptId, result, currentMode);
  }

  // --- STREAK MANAGEMENT ---
  function updateStreakDisplay() {
    const streakData = JSON.parse(localStorage.getItem('suomi_pwa_streak')) || { count: 1, lastDate: '' };
    document.getElementById('streak-days').textContent = streakData.count;
    const statsStreak = document.getElementById('stats-streak-val');
    if (statsStreak) statsStreak.textContent = streakData.count;
  }

  function updateStreakOnReview() {
    const todayStr = new Date().toISOString().slice(0, 10);
    let streakData = JSON.parse(localStorage.getItem('suomi_pwa_streak')) || { count: 1, lastDate: '' };

    if (streakData.lastDate === todayStr) {
      return; // Already counted today
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (streakData.lastDate === yesterdayStr) {
      streakData.count += 1;
    } else if (!streakData.lastDate) {
      streakData.count = 1;
    }
    streakData.lastDate = todayStr;
    localStorage.setItem('suomi_pwa_streak', JSON.stringify(streakData));
    updateStreakDisplay();
  }

  // --- TODAY VIEW LOGIC ---
  function updateTodayStats() {
    if (!vocabData) return;
    const states = getLearningStates();
    const now = new Date();

    let dueCount = 0;
    let newCount = 0;
    let masteredCount = 0;

    vocabData.concepts.forEach(c => {
      const state = states[c.id];
      if (!state || state.status === 'new') {
        newCount++;
      } else if (new Date(state.next_review_at) <= now) {
        dueCount++;
      } else if (state.status === 'mastered') {
        masteredCount++;
      }
    });

    document.getElementById('stat-due-count').textContent = dueCount;
    document.getElementById('stat-new-count').textContent = Math.min(newCount, 30);
    document.getElementById('stat-done-count').textContent = masteredCount;

    const todayDate = new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('today-date-text').textContent = todayDate.charAt(0).toUpperCase() + todayDate.slice(1);
  }

  function startTodaySession() {
    if (!vocabData) return;
    const states = getLearningStates();
    const now = new Date();
    const selectedChapter = document.getElementById('select-chapter-quick').value;
    const DAILY_QUOTA = 30;

    let dueList = [];
    let newList = [];

    vocabData.concepts.forEach(c => {
      // Filter by chapter if selected
      if (selectedChapter !== 'all') {
        const hasChapter = c.occurrences && c.occurrences.some(o => o.chapter_id.endsWith(`_${selectedChapter}`));
        if (!hasChapter) return;
      }

      const state = states[c.id];
      if (!state || state.status === 'new') {
        newList.push(c);
      } else if (new Date(state.next_review_at) <= now) {
        dueList.push(c);
      }
    });

    // Shuffle and pick
    dueList.sort(() => Math.random() - 0.5);
    newList.sort(() => Math.random() - 0.5);

    currentQueue = [...dueList, ...newList.slice(0, DAILY_QUOTA)];
    if (currentQueue.length === 0) {
      // Fallback: pick words from selection for practice
      currentQueue = vocabData.concepts
        .filter(c => selectedChapter === 'all' || (c.occurrences && c.occurrences.some(o => o.chapter_id.endsWith(`_${selectedChapter}`))))
        .sort(() => Math.random() - 0.5)
        .slice(0, DAILY_QUOTA);
    }

    currentIndex = 0;
    switchView('view-cards');
    renderCurrentCard();
  }

  function startConfusingPractice() {
    openConfusingModal();
  }

  function startConfusingCardSession() {
    if (!vocabData || !vocabData.relations) return;
    const confusingRelations = vocabData.relations.filter(r => r.type === 'commonly_confused' || r.type === 'looks_similar');
    const conceptIds = new Set();
    confusingRelations.forEach(r => {
      conceptIds.add(r.from_id);
      conceptIds.add(r.to_id);
    });

    const pool = Array.from(conceptIds).map(id => conceptsMap.get(id)).filter(Boolean);
    pool.sort(() => Math.random() - 0.5);

    currentQueue = pool.slice(0, 30);
    currentIndex = 0;
    closeConfusingModal();
    switchView('view-cards');
    renderCurrentCard();
  }

  // --- FLASHCARDS LOGIC ---
  function initCardActions() {
    const cardEl = document.getElementById('flashcard-element');
    const revealBtn = document.getElementById('btn-reveal-card');

    cardEl.addEventListener('click', () => {
      toggleCardFlip();
    });

    revealBtn.addEventListener('click', () => {
      toggleCardFlip(true);
    });

    // Audio button on front
    document.getElementById('btn-card-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      const currentConcept = currentQueue[currentIndex];
      if (currentConcept) speakFinnish(currentConcept.finnish);
    });

    // Mode toggles
    const btnModeFi = document.getElementById('btn-mode-fi');
    const btnModeEn = document.getElementById('btn-mode-en');

    btnModeFi.addEventListener('click', () => {
      currentMode = 'fi_to_en';
      btnModeFi.className = 'badge badge-blue';
      btnModeEn.className = 'badge';
      btnModeEn.style.background = 'rgba(255,255,255,0.06)';
      btnModeEn.style.color = 'var(--text-muted)';
      renderCurrentCard();
    });

    btnModeEn.addEventListener('click', () => {
      currentMode = 'en_to_fi';
      btnModeEn.className = 'badge badge-blue';
      btnModeFi.className = 'badge';
      btnModeFi.style.background = 'rgba(255,255,255,0.06)';
      btnModeFi.style.color = 'var(--text-muted)';
      renderCurrentCard();
    });

    // SRS outcome buttons
    document.getElementById('btn-srs-forgot').addEventListener('click', () => handleSRSResult('forgot'));
    document.getElementById('btn-srs-hard').addEventListener('click', () => handleSRSResult('hard'));
    document.getElementById('btn-srs-good').addEventListener('click', () => handleSRSResult('good'));
    document.getElementById('btn-srs-easy').addEventListener('click', () => handleSRSResult('easy'));

    // Input checking for diacritics in EN -> FI mode
    const inputRecall = document.getElementById('input-recall-text');
    inputRecall.addEventListener('input', () => {
      checkDiacritics(inputRecall.value);
    });

    inputRecall.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        toggleCardFlip(true);
      }
    });
  }

  function toggleCardFlip(forceReveal = null) {
    if (currentIndex >= currentQueue.length) return;

    const cardEl = document.getElementById('flashcard-element');
    const srsContainer = document.getElementById('srs-actions-container');
    const revealBtn = document.getElementById('btn-reveal-card');

    isCardFlipped = forceReveal !== null ? forceReveal : !isCardFlipped;

    if (isCardFlipped) {
      cardEl.classList.add('flipped');
      srsContainer.style.display = 'grid';
      revealBtn.style.display = 'none';
      
      const currentConcept = currentQueue[currentIndex];
      if (currentConcept) speakFinnish(currentConcept.finnish);
    } else {
      cardEl.classList.remove('flipped');
      srsContainer.style.display = 'none';
      revealBtn.style.display = 'block';
    }
  }

  function renderCompletionScreen() {
    const cardEl = document.getElementById('flashcard-element');
    cardEl.classList.remove('flipped');
    isCardFlipped = false;

    const actionsDock = document.getElementById('card-actions-dock');
    if (actionsDock) actionsDock.classList.add('hidden');
    document.getElementById('btn-reveal-card').style.display = 'none';
    document.getElementById('srs-actions-container').style.display = 'none';
    document.getElementById('card-typing-container').style.display = 'none';
    document.getElementById('card-queue-index').textContent = `${currentQueue.length} / ${currentQueue.length}`;

    document.getElementById('card-front-chapter').textContent = 'Valmis!';
    document.getElementById('btn-card-audio').style.display = 'none';
    document.getElementById('card-front-main').textContent = '🎉 Hienoa työtä!';
    document.getElementById('card-front-hint').innerHTML = `
      <div style="font-size: 0.95rem; margin-top: 10px; color: #f8fafc; font-weight: 600;">
        Olet harjoitellut ${currentQueue.length} sanaa!
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;">
        Haluatko jatkaa oppimista?
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 22px; width: 100%; max-width: 260px; margin-left: auto; margin-right: auto;">
        <button id="btn-continue-more" class="btn-primary" style="padding: 12px; font-size: 0.92rem;">
          ⚡ Kyllä, jatka (+15 sanaa)
        </button>
        <button id="btn-finish-today" class="btn-primary" style="padding: 10px; font-size: 0.88rem; background: rgba(255,255,255,0.08); border: 1px solid var(--border-subtle); box-shadow: none;">
          ✅ Valmis tältä päivältä
        </button>
      </div>
    `;
    document.getElementById('card-front-pos').textContent = 'Päivän sanat tehty';

    // Hook up continuation buttons
    document.getElementById('btn-continue-more')?.addEventListener('click', (e) => {
      e.stopPropagation();
      continueSession();
    });

    document.getElementById('btn-finish-today')?.addEventListener('click', (e) => {
      e.stopPropagation();
      switchView('view-today');
      updateTodayStats();
    });
  }

  function continueSession() {
    if (!vocabData) return;
    const states = getLearningStates();
    const alreadyInQueue = new Set(currentQueue.map(c => c.id));

    // Find new words or due words that were not in the current session
    let moreList = vocabData.concepts.filter(c => !alreadyInQueue.has(c.id));
    moreList.sort(() => Math.random() - 0.5);

    const nextBatch = moreList.slice(0, 15);
    if (nextBatch.length > 0) {
      currentQueue = nextBatch;
      currentIndex = 0;
      renderCurrentCard();
    } else {
      alert('Kaikki sanat on jo käyty läpi!');
      switchView('view-today');
    }
  }

  function renderCurrentCard() {
    if (!currentQueue || currentQueue.length === 0 || currentIndex >= currentQueue.length) {
      renderCompletionScreen();
      return;
    }

    const actionsDock = document.getElementById('card-actions-dock');
    if (actionsDock) actionsDock.classList.remove('hidden');

    const concept = currentQueue[currentIndex];
    const cardEl = document.getElementById('flashcard-element');
    cardEl.classList.remove('flipped');
    isCardFlipped = false;

    document.getElementById('srs-actions-container').style.display = 'none';
    document.getElementById('btn-reveal-card').style.display = 'block';
    document.getElementById('card-queue-index').textContent = `${currentIndex + 1} / ${currentQueue.length}`;

    // Occurrence chapter
    const occ = concept.occurrences && concept.occurrences[0];
    const chapNumber = occ ? occ.chapter_id.replace('ch_', '') : '1';
    const pageNum = occ ? occ.page : '–';

    document.getElementById('card-front-chapter').textContent = `Kappale ${chapNumber}`;
    document.getElementById('card-back-page').textContent = `Sivu ${pageNum}`;
    document.getElementById('card-front-pos').textContent = concept.part_of_speech || 'sana';

    const typingContainer = document.getElementById('card-typing-container');
    const inputRecall = document.getElementById('input-recall-text');
    const feedbackEl = document.getElementById('diacritic-feedback');
    feedbackEl.style.display = 'none';

    if (currentMode === 'fi_to_en') {
      typingContainer.style.display = 'none';
      document.getElementById('card-front-main').textContent = concept.finnish;
      document.getElementById('card-front-hint').textContent = 'Napauta korttia ja katso vastaus';
      document.getElementById('btn-card-audio').style.display = 'inline-flex';
    } else {
      // EN -> FI Active typing mode
      typingContainer.style.display = 'block';
      inputRecall.value = '';
      document.getElementById('card-front-main').textContent = concept.english;
      document.getElementById('card-front-hint').textContent = 'Kirjoita suomeksi ja tarkista';
      document.getElementById('btn-card-audio').style.display = 'none';
      setTimeout(() => inputRecall.focus(), 200);
    }

    // Card Back details
    document.getElementById('card-back-word').textContent = concept.finnish;
    document.getElementById('card-back-meaning').textContent = concept.english;

    // Forms
    const formsEl = document.getElementById('card-back-forms');
    if (concept.forms && concept.forms.length > 0) {
      formsEl.innerHTML = `Muut muodot: <strong>${concept.forms.map(f => f.form).join(', ')}</strong>`;
      formsEl.style.display = 'block';
    } else {
      formsEl.style.display = 'none';
    }

    // Confusing pairs detection - FULL LIST (matching PC version)
    const confusingEl = document.getElementById('card-back-confusing');
    if (vocabData && vocabData.relations) {
      const rels = vocabData.relations.filter(r => 
        (r.from_id === concept.id || r.to_id === concept.id) && 
        (r.type === 'commonly_confused' || r.type === 'looks_similar')
      );
      
      const otherIds = Array.from(new Set(rels.map(r => r.from_id === concept.id ? r.to_id : r.from_id)));
      const confusingConcepts = otherIds.map(id => conceptsMap.get(id)).filter(Boolean);

      if (confusingConcepts.length > 0) {
        confusingEl.innerHTML = `
          <div style="font-weight: 700; font-size: 0.78rem; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <span>⚠️ Älä sekoita näihin sanoihin (${confusingConcepts.length}):</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${confusingConcepts.map(other => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25); padding: 4px 8px; border-radius: 6px;">
                <span><strong>${other.finnish}</strong> = ${other.english}</span>
                <button class="audio-btn-mini" data-word="${other.finnish}">🔊</button>
              </div>
            `).join('')}
          </div>
        `;
        confusingEl.querySelectorAll('.audio-btn-mini').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const w = btn.getAttribute('data-word');
            if (w) speakFinnish(w);
          });
        });
        confusingEl.style.display = 'block';
      } else {
        confusingEl.style.display = 'none';
      }
    } else {
      confusingEl.style.display = 'none';
    }

    // Related words in same topic theme on card back - FULL LIST
    const relatedEl = document.getElementById('card-back-related');
    if (relatedEl) {
      if (concept.topics && concept.topics.length > 0 && vocabData) {
        const related = vocabData.concepts.filter(c => 
          c.id !== concept.id && 
          c.topics && 
          c.topics.some(t => concept.topics.includes(t))
        );
        if (related.length > 0) {
          relatedEl.style.display = 'block';
          relatedEl.innerHTML = `
            <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 700; margin-bottom: 5px;">
              Samaan aiheeseen kuuluvat sanat (${related.length}):
            </div>
            <div class="card-related-scroll">
              ${related.map(r => `
                <span class="related-badge-item" data-id="${r.id}">
                  <strong>${r.finnish}</strong> (${r.english})
                </span>
              `).join('')}
            </div>
          `;
          relatedEl.querySelectorAll('.related-badge-item').forEach(el => {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              const id = el.getAttribute('data-id');
              const found = conceptsMap.get(id);
              if (found) speakFinnish(found.finnish);
            });
          });
        } else {
          relatedEl.style.display = 'none';
        }
      } else {
        relatedEl.style.display = 'none';
      }
    }

    // Interval estimation on card back
    const state = getConceptState(concept.id);
    document.getElementById('card-back-interval').textContent = `Kerrattu: ${state.repetitions} krt • ${state.interval_days.toFixed(0)} pv väli`;
  }

  function handleSRSResult(result) {
    const concept = currentQueue[currentIndex];
    if (concept) {
      updateConceptSRS(concept.id, result);
    }

    currentIndex++;
    if (currentIndex < currentQueue.length) {
      renderCurrentCard();
    } else {
      renderCompletionScreen();
      updateTodayStats();
    }
  }

  // --- DIACRITIC INSPECTION & VIRTUAL KEYS ---
  function initDiacriticKeys() {
    document.querySelectorAll('.quick-key').forEach(keyBtn => {
      keyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const char = keyBtn.getAttribute('data-char');
        const input = document.getElementById('input-recall-text');
        
        const start = input.selectionStart || input.value.length;
        const end = input.selectionEnd || input.value.length;
        input.value = input.value.substring(0, start) + char + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + 1, start + 1);
        checkDiacritics(input.value);
      });
    });
  }

  function checkDiacritics(typed) {
    const feedbackEl = document.getElementById('diacritic-feedback');
    const concept = currentQueue[currentIndex];
    if (!concept) return;

    const target = concept.finnish.toLowerCase();
    const cleanTyped = typed.trim().toLowerCase();

    // Check vowel harmony confusion
    if (target.includes('ä') && cleanTyped.includes('a') && !cleanTyped.includes('ä')) {
      feedbackEl.textContent = '💡 Huomaa: Tässä sanassa on Ä (ei A)!';
      feedbackEl.style.display = 'flex';
    } else if (target.includes('ö') && cleanTyped.includes('o') && !cleanTyped.includes('ö')) {
      feedbackEl.textContent = '💡 Huomaa: Tässä sanassa on Ö (ei O)!';
      feedbackEl.style.display = 'flex';
    } else {
      feedbackEl.style.display = 'none';
    }
  }

  // --- TOPICS PRACTICE VIEW ---
  function renderTopics() {
    const container = document.getElementById('topics-container');
    if (!container || !vocabData) return;

    const topicIcons = {
      weather: '🌦️', family: '👨‍👩‍👧', home: '🏡', work: '💼',
      food: '🍲', routines: '⏰', time: '📅', travel: '✈️',
      adjectives: '🎨', locations: '📍', nature: '🌲', health: '🩺'
    };

    container.innerHTML = '';
    vocabData.topics.forEach(t => {
      // Count concepts
      const count = vocabData.concepts.filter(c => c.topics && c.topics.includes(t.id)).length;
      const tile = document.createElement('div');
      tile.className = 'topic-tile';
      tile.innerHTML = `
        <div style="font-size: 1.4rem;">${topicIcons[t.id] || '📚'}</div>
        <div>
          <div class="topic-title">${t.name}</div>
          <div class="topic-count">${count} sanaa</div>
        </div>
      `;
      tile.addEventListener('click', () => {
        startTopicPractice(t.id);
      });
      container.appendChild(tile);
    });
  }

  function startTopicPractice(topicId) {
    if (!vocabData) return;
    const pool = vocabData.concepts.filter(c => c.topics && c.topics.includes(topicId));
    pool.sort(() => Math.random() - 0.5);

    currentQueue = pool.slice(0, 30);
    currentIndex = 0;
    switchView('view-cards');
    renderCurrentCard();
  }

  // --- DICTIONARY VIEW & SEARCH ---
  function initDictionary() {
    const searchInput = document.getElementById('dict-search-input');
    searchInput.addEventListener('input', () => {
      renderDictionaryList(searchInput.value.trim());
    });

    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => {
          c.classList.remove('active', 'badge-blue');
          c.classList.add('badge');
        });
        chip.classList.add('active', 'badge-blue');
        activeFilter = chip.getAttribute('data-filter');
        renderDictionaryList(searchInput.value.trim());
      });
    });

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('word-modal').addEventListener('click', (e) => {
      if (e.target.id === 'word-modal') closeModal();
    });
  }

  function renderDictionaryList(query = '') {
    const container = document.getElementById('dict-items-list');
    if (!container || !vocabData) return;

    const lowerQuery = query.toLowerCase();
    let filtered = vocabData.concepts.filter(c => {
      // Filter by POS
      if (activeFilter === 'verb' && c.part_of_speech !== 'verbi') return false;
      if (activeFilter === 'noun' && c.part_of_speech !== 'substantiivi') return false;
      if (activeFilter === 'adj' && c.part_of_speech !== 'adjektiivi') return false;
      if (activeFilter === 'phrase' && c.part_of_speech !== 'fraasi' && c.part_of_speech !== 'ilmaus') return false;

      if (!query) return true;
      return c.finnish.toLowerCase().includes(lowerQuery) || c.english.toLowerCase().includes(lowerQuery);
    });

    // Limit to 50 for performance
    const renderBatch = filtered.slice(0, 50);

    container.innerHTML = '';
    renderBatch.forEach(concept => {
      const item = document.createElement('div');
      item.className = 'dict-item';
      item.innerHTML = `
        <div>
          <div class="dict-word">${concept.finnish}</div>
          <div class="dict-trans">${concept.english}</div>
        </div>
        <button class="audio-btn" style="padding: 4px 10px; font-size: 0.8rem;">🔊</button>
      `;

      // Speak on audio click
      item.querySelector('.audio-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        speakFinnish(concept.finnish);
      });

      // Open detail modal
      item.addEventListener('click', () => {
        openWordModal(concept);
      });

      container.appendChild(item);
    });
  }

  function openWordModal(concept) {
    const modal = document.getElementById('word-modal');
    document.getElementById('modal-fi-word').textContent = concept.finnish;
    document.getElementById('modal-en-trans').textContent = concept.english;

    const occ = concept.occurrences && concept.occurrences[0];
    const chapNum = occ ? occ.chapter_id.replace('ch_', '') : '1';
    const pageNum = occ ? occ.page : '–';
    document.getElementById('modal-chapter-badge').textContent = `Kappale ${chapNum}`;
    document.getElementById('modal-provenance').textContent = `Suomen Mestari 1 • Sivu ${pageNum} (Kappale ${chapNum})`;

    // Audio in modal
    const audioBtn = document.getElementById('modal-audio-btn');
    audioBtn.onclick = () => speakFinnish(concept.finnish);

    // Forms
    const formsBox = document.getElementById('modal-forms-container');
    const formsContent = document.getElementById('modal-forms-content');
    if (concept.forms && concept.forms.length > 0) {
      formsBox.style.display = 'block';
      formsContent.textContent = concept.forms.map(f => f.form).join(', ');
    } else {
      formsBox.style.display = 'none';
    }

    // Confusing words - FULL LIST (matching PC version)
    const confBox = document.getElementById('modal-confusing-container');
    const confContent = document.getElementById('modal-confusing-content');
    if (vocabData && vocabData.relations) {
      const rels = vocabData.relations.filter(r => 
        (r.from_id === concept.id || r.to_id === concept.id) && 
        (r.type === 'commonly_confused' || r.type === 'looks_similar')
      );
      const otherIds = Array.from(new Set(rels.map(r => r.from_id === concept.id ? r.to_id : r.from_id)));
      const confusingConcepts = otherIds.map(id => conceptsMap.get(id)).filter(Boolean);

      if (confusingConcepts.length > 0) {
        confBox.style.display = 'block';
        confContent.innerHTML = '';
        confusingConcepts.forEach(other => {
          const div = document.createElement('div');
          div.className = 'confusing-item-row';
          div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="confusing-click-target" style="cursor: pointer; flex: 1;">
                <strong>${other.finnish}</strong>
                <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">(${other.english})</span>
              </div>
              <button class="audio-btn-mini" title="Kuuntele">🔊</button>
            </div>
          `;
          div.querySelector('.confusing-click-target').addEventListener('click', () => {
            openWordModal(other);
          });
          div.querySelector('.audio-btn-mini').addEventListener('click', (e) => {
            e.stopPropagation();
            speakFinnish(other.finnish);
          });
          confContent.appendChild(div);
        });
      } else {
        confBox.style.display = 'none';
      }
    } else {
      confBox.style.display = 'none';
    }

    // Related words in same topic theme - FULL LIST
    const relatedBox = document.getElementById('modal-related-container');
    const relatedContent = document.getElementById('modal-related-content');
    if (concept.topics && concept.topics.length > 0 && vocabData) {
      const relatedList = vocabData.concepts.filter(c => 
        c.id !== concept.id && 
        c.topics && 
        c.topics.some(t => concept.topics.includes(t))
      );

      if (relatedList.length > 0) {
        relatedBox.style.display = 'block';
        relatedContent.innerHTML = '';
        relatedList.forEach(rw => {
          const chip = document.createElement('div');
          chip.className = 'related-chip';
          chip.innerHTML = `
            <span class="rw-fi">${rw.finnish}</span>
            <span class="rw-en">${rw.english}</span>
            <button class="audio-btn-mini" title="Kuuntele">🔊</button>
          `;
          chip.querySelector('.rw-fi').addEventListener('click', () => openWordModal(rw));
          chip.querySelector('.rw-en').addEventListener('click', () => openWordModal(rw));
          chip.querySelector('.audio-btn-mini').addEventListener('click', (e) => {
            e.stopPropagation();
            speakFinnish(rw.finnish);
          });
          relatedContent.appendChild(chip);
        });
      } else {
        relatedBox.style.display = 'none';
      }
    } else {
      relatedBox.style.display = 'none';
    }

    modal.classList.add('open');
  }

  function closeModal() {
    document.getElementById('word-modal').classList.remove('open');
  }

  // --- CONFUSING PAIRS BROWSER MODAL ---
  function initConfusingModal() {
    document.getElementById('confusing-modal-close-btn')?.addEventListener('click', closeConfusingModal);
    document.getElementById('btn-start-confusing-cards')?.addEventListener('click', startConfusingCardSession);
    document.getElementById('confusing-pairs-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'confusing-pairs-modal') closeConfusingModal();
    });
  }

  function openConfusingModal() {
    const modal = document.getElementById('confusing-pairs-modal');
    const container = document.getElementById('confusing-pairs-list');
    if (!modal || !container || !vocabData || !vocabData.relations) return;

    const confusingRelations = vocabData.relations.filter(r => r.type === 'commonly_confused' || r.type === 'looks_similar');
    
    // Deduplicate pair relations
    const pairKeys = new Set();
    const uniquePairs = [];

    confusingRelations.forEach(r => {
      const key = [r.from_id, r.to_id].sort().join('__');
      if (!pairKeys.has(key)) {
        pairKeys.add(key);
        const c1 = conceptsMap.get(r.from_id);
        const c2 = conceptsMap.get(r.to_id);
        if (c1 && c2) uniquePairs.push({ c1, c2, type: r.type });
      }
    });

    container.innerHTML = '';
    uniquePairs.forEach(p => {
      const card = document.createElement('div');
      card.className = 'confusing-pair-card';
      card.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div class="c1-target" style="cursor: pointer;">
              <strong style="color: #38bdf8;">${p.c1.finnish}</strong>
              <span style="color: var(--text-muted); font-size: 0.78rem;">(${p.c1.english})</span>
            </div>
            <button class="audio-btn-mini audio-c1">🔊</button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 4px;">
            <div class="c2-target" style="cursor: pointer;">
              <strong style="color: #fbbf24;">${p.c2.finnish}</strong>
              <span style="color: var(--text-muted); font-size: 0.78rem;">(${p.c2.english})</span>
            </div>
            <button class="audio-btn-mini audio-c2">🔊</button>
          </div>
        </div>
      `;

      card.querySelector('.c1-target').addEventListener('click', () => {
        closeConfusingModal();
        openWordModal(p.c1);
      });
      card.querySelector('.c2-target').addEventListener('click', () => {
        closeConfusingModal();
        openWordModal(p.c2);
      });
      card.querySelector('.audio-c1').addEventListener('click', (e) => {
        e.stopPropagation();
        speakFinnish(p.c1.finnish);
      });
      card.querySelector('.audio-c2').addEventListener('click', (e) => {
        e.stopPropagation();
        speakFinnish(p.c2.finnish);
      });

      container.appendChild(card);
    });

    modal.classList.add('open');
  }

  function closeConfusingModal() {
    document.getElementById('confusing-pairs-modal')?.classList.remove('open');
  }

  // --- STATS & SYNC LOGIC ---
  function renderStatsView() {
    if (!vocabData) return;
    const states = getLearningStates();
    const reviews = getReviewEvents();

    let mastered = 0;
    let learning = 0;
    let newWords = 0;

    vocabData.concepts.forEach(c => {
      const state = states[c.id];
      if (!state || state.status === 'new') newWords++;
      else if (state.status === 'mastered') mastered++;
      else learning++;
    });

    const total = vocabData.total_concepts;
    const masteredPct = ((mastered / total) * 100).toFixed(1);
    const learningPct = ((learning / total) * 100).toFixed(1);

    document.getElementById('mastery-percent-text').textContent = `${masteredPct}%`;
    document.getElementById('bar-mastered').style.width = `${masteredPct}%`;
    document.getElementById('bar-learning').style.width = `${learningPct}%`;
    document.getElementById('count-mastered').textContent = mastered;
    document.getElementById('count-learning').textContent = learning;
    document.getElementById('count-new').textContent = newWords;

    document.getElementById('stats-total-reviews').textContent = reviews.length;

    if (reviews.length > 0) {
      const correct = reviews.filter(r => r.result === 'good' || r.result === 'easy').length;
      const rate = Math.round((correct / reviews.length) * 100);
      document.getElementById('stats-retention-rate').textContent = `${rate}%`;
    }
  }

  function initSync() {
    // Export backup
    document.getElementById('btn-export-backup').addEventListener('click', () => {
      const backup = {
        app: 'Suomi Mestari 1 PWA',
        version: '1.0',
        exported_at: new Date().toISOString(),
        learning_states: getLearningStates(),
        review_events: getReviewEvents(),
        streak: JSON.parse(localStorage.getItem('suomi_pwa_streak')) || {}
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suomi_mestari_edistyminen_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import backup
    const importInput = document.getElementById('input-import-backup');
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed.learning_states) {
            saveLearningStates(parsed.learning_states);
            if (parsed.review_events) localStorage.setItem(STORAGE_REVIEWS, JSON.stringify(parsed.review_events));
            if (parsed.streak) localStorage.setItem('suomi_pwa_streak', JSON.stringify(parsed.streak));
            alert('Tiedot ladattu onnistuneesti!');
            updateTodayStats();
            renderStatsView();
            updateStreakDisplay();
          } else {
            alert('Virhe: Tiedostosta ei löytynyt oppimistietoja.');
          }
        } catch {
          alert('Tiedoston avaaminen epäonnistui.');
        }
      };
      reader.readAsText(file);
    });

    // Reset history
    document.getElementById('btn-reset-history').addEventListener('click', () => {
      if (confirm('Haluatko varmasti aloittaa alusta? Kaikki harjoitustiedot poistetaan.')) {
        localStorage.removeItem(STORAGE_STATES);
        localStorage.removeItem(STORAGE_REVIEWS);
        localStorage.removeItem('suomi_pwa_streak');
        alert('Tiedot poistettu. Voit aloittaa alusta.');
        updateTodayStats();
        renderStatsView();
        updateStreakDisplay();
      }
    });
  }

})();
