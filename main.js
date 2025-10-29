"use strict";

(() => {
  const STATES = {
    START: "start",
    PLAY: "play",
    RESULT: "result",
  };

  const appEl = document.querySelector(".app");
  const startBtn = document.querySelector('[data-action="start"]');
  const restartBtn = document.querySelector('[data-action="restart"]');
  const inputEl = document.querySelector(".typing-input");

  const timeEl = document.querySelector('[data-bind="time"]');
  const scoreEl = document.querySelector('[data-bind="score"]');
  const comboEl = document.querySelector('[data-bind="combo"]');
  const promptOriginalEl = document.querySelector('[data-bind="promptOriginal"]');
  const promptFuriganaEl = document.querySelector('[data-bind="promptFurigana"]');
  const promptRomanizedEl = document.querySelector('[data-bind="promptRomanized"]');
  const finalScoreEl = document.querySelector('[data-bind="finalScore"]');

  const TYPING_SOUND_PATH = "タイピング-メカニカル単3.mp3";
  const BONUS_SOUND_PATH = "クイズ正解5.mp3";
  const MISS_SOUND_PATH = "クイズ不正解2.mp3";
  const BUTTON_SOUND_PATH = "スイッチを押す.wav";
  const TIMEUP_SOUND_PATH = "試合終了のゴング.mp3";

  function createAudioPool(src, options = {}) {
    const { volume = 1, poolSize = 1 } = options;
    const pool = Array.from({ length: poolSize }, () => {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.preload = "auto";
      return audio;
    });
    let cursor = 0;
    return {
      play() {
        const audio = pool[cursor];
        cursor = (cursor + 1) % pool.length;
        try {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        } catch (error) {
          // Ignore playback failures caused by browser policies.
        }
      },
    };
  }

  const typingSoundPlayer = createAudioPool(TYPING_SOUND_PATH, { volume: 0.55, poolSize: 6 });
  const bonusSoundPlayer = createAudioPool(BONUS_SOUND_PATH, { volume: 0.8, poolSize: 3 });
  const missSoundPlayer = createAudioPool(MISS_SOUND_PATH, { volume: 0.7, poolSize: 3 });
  const buttonSoundPlayer = createAudioPool(BUTTON_SOUND_PATH, { volume: 0.6, poolSize: 2 });
  const timeupSoundPlayer = createAudioPool(TIMEUP_SOUND_PATH, { volume: 0.8, poolSize: 2 });
  let lastCanonicalLength = 0;

  const INITIAL_TIME = 60;
  const BONUS_TIME = 3;
  const COMBO_TARGET = 5;
  const MAX_PHRASES = 30;

  let phrases = [];
  let timerId = null;
  let resultTransitionTimer = null;
  let isResultPending = false;
  let missFeedbackTimer = null;
  let state = STATES.START;
  let timeLeft = INITIAL_TIME;
  let score = 0;
  let combo = 0;
  let index = 0;
  let currentPrompt = null;
  let mistypedCurrent = false;

  const ROMAJI_ALIASES = [
    { typed: "sho", canonical: "syo" },
    { typed: "shu", canonical: "syu" },
    { typed: "sha", canonical: "sya" },
    { typed: "cho", canonical: "tyo" },
    { typed: "chu", canonical: "tyu" },
    { typed: "cha", canonical: "tya" },
    { typed: "tyo", canonical: "cho" },
    { typed: "tyu", canonical: "chu" },
    { typed: "tya", canonical: "cha" },
    { typed: "shi", canonical: "si" },
    { typed: "ji", canonical: "zi" },
    { typed: "ja", canonical: "zya" },
    { typed: "ja", canonical: "zya" },
    { typed: "ju", canonical: "zyu" },
    { typed: "jyo", canonical: "zyo" },
    { typed: "jo", canonical: "zyo" },
    { typed: "ti", canonical: "chi" },
    { typed: "tsu", canonical: "tu" },
    { typed: "hu", canonical: "fu" },
    { typed: "o", canonical: "wo" },
  ];

  const basePhrases = [
    { original: "地球の引力", kana: "ちきゅうのいんりょく", romanized: "chikyuunoinnryoku" },
    { original: "ハビタブルゾーン", romanized: "habitaburuzo-nn" },
    { original: "天の川銀河", kana: "あまのがわぎんが", romanized: "amanogawaginnga" },
    { original: "宇宙ステーション", romanized: "utyuusute-syonn" },
    { original: "宇宙飛行士", kana: "うちゅうひこうし", romanized: "uchuuhikousi" },
    { original: "ダークエネルギー", romanized: "da-kuenerugi-" },
    { original: "超新星爆発", kana: "ちょうしんせいばくはつ", romanized: "tyousinnseibakuhatu" },
    { original: "時空の歪み", kana: "じくうのゆがみ", romanized: "jikuunoyugami" },
    { original: "超銀河団", kana: "ちょうぎんがだん", romanized: "tyouginngadann" },
    { original: "宇宙の進化", kana: "うちゅうのしんか", romanized: "utyuunosinnka" },
    { original: "人工衛星", kana: "じんこうえいせい", romanized: "jinnkoueisei" },
    { original: "プロミネンス", romanized: "purominennsu" },
    { original: "地動説", kana: "ちどうせつ", romanized: "chidousetu" },
    { original: "スーパームーン", romanized: "su-pa-mu-nn" },
    { original: "流星群", kana: "りゅうせいぐん", romanized: "ryuuseigunn" },
    { original: "隕石の衝突", kana: "いんせきのしょうとつ", romanized: "innsekinosyoutotu" },
    { original: "夏の大三角形", kana: "なつのだいさんかくけい", romanized: "natunodaisannkakukei" },
    { original: "一光年", kana: "いっこうねん", romanized: "ichikounenn" },
    { original: "宇宙生命体", kana: "うちゅうせいめいたい", romanized: "utyuuseimeitai" },
    { original: "スペースシャトル", romanized: "supe-susyatoru" },
    { original: "ビッグバン", romanized: "biggubann" },
    { original: "月面着陸", kana: "げつめんちゃくりく", romanized: "getumenntyakuriku" },
    { original: "相対性理論", kana: "そうたいせいりろん", romanized: "soutaiseirironn" },
    { original: "シンギュラリティ", romanized: "sinngyurarithi" },
    { original: "無限の彼方", kana: "むげんのかなた", romanized: "mugennnokanata" },
    { original: "宇宙放射線", kana: "うちゅうほうしゃせん", romanized: "utyuuhousyasenn" },
    { original: "大気圏突入", kana: "たいきけんとつにゅう", romanized: "taikikenntotunyuu" },
    { original: "アポロ計画", kana: "あぽろけいかく", romanized: "aporokeikaku" },
    { original: "火星探査機", kana: "かせいたんさき", romanized: "kaseitannsaki" },
    { original: "衛星通信", kana: "えいせいつうしん", romanized: "eiseituusinn" },
  ];

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function setState(nextState) {
    state = nextState;
    appEl.setAttribute("data-state", nextState);
    const isPlaying = nextState === STATES.PLAY;
    inputEl.disabled = !isPlaying;
    if (!isPlaying) {
      inputEl.blur();
    }
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function clearResultTransitionTimer() {
    if (resultTransitionTimer) {
      clearTimeout(resultTransitionTimer);
      resultTransitionTimer = null;
    }
    isResultPending = false;
  }

  function clearMissFeedback() {
    if (missFeedbackTimer) {
      clearTimeout(missFeedbackTimer);
      missFeedbackTimer = null;
    }
    promptRomanizedEl.classList.remove("is-miss");
  }

  function resetStats() {
    timeLeft = INITIAL_TIME;
    score = 0;
    combo = 0;
    index = 0;
    mistypedCurrent = false;
    lastCanonicalLength = 0;
    clearMissFeedback();
  }

  function updateStatusBar() {
    timeEl.textContent = String(timeLeft);
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
  }

  function processInput(rawValue, target) {
    if (!rawValue) {
      return {
        value: "",
        canonical: "",
        completed: false,
        truncated: false,
      };
    }

    const lowerValue = rawValue.toLowerCase();
    let typedIndex = 0;
    let targetIndex = 0;
    let canonical = "";
    let lastValidIndex = 0;
    let invalid = false;
    let pendingAlias = false;

    const tryPartialAlias = (typedSlice, targetSlice) =>
      ROMAJI_ALIASES.some(
        ({ typed, canonical: aliasCanonical }) =>
          typed.startsWith(typedSlice) && targetSlice.startsWith(aliasCanonical),
      );

    while (typedIndex < lowerValue.length && targetIndex < target.length) {
      const remainingTyped = lowerValue.slice(typedIndex);
      const remainingTarget = target.slice(targetIndex);
      let matched = false;

      for (const { typed, canonical: aliasCanonical } of ROMAJI_ALIASES) {
        if (
          remainingTyped.startsWith(typed) &&
          remainingTarget.startsWith(aliasCanonical)
        ) {
          canonical += aliasCanonical;
          typedIndex += typed.length;
          targetIndex += aliasCanonical.length;
          lastValidIndex = typedIndex;
          matched = true;
          break;
        }
      }

      if (matched) {
        continue;
      }

      if (tryPartialAlias(remainingTyped, remainingTarget)) {
        pendingAlias = true;
        break;
      }

      const typedChar = lowerValue[typedIndex];
      const targetChar = remainingTarget[0];
      if (typedChar === targetChar) {
        canonical += targetChar;
        typedIndex += 1;
        targetIndex += 1;
        lastValidIndex = typedIndex;
        continue;
      }

      invalid = true;
      break;
    }

    if (!invalid && typedIndex < lowerValue.length) {
      const remainingTyped = lowerValue.slice(typedIndex);
      const remainingTarget = target.slice(targetIndex);
      if (!tryPartialAlias(remainingTyped, remainingTarget)) {
        invalid = true;
      } else {
        pendingAlias = true;
      }
    }

    const truncated = invalid && lastValidIndex < lowerValue.length;
    const sanitizedValue = truncated ? lowerValue.slice(0, lastValidIndex) : lowerValue;

    return {
      value: sanitizedValue,
      canonical,
      completed: canonical === target && !pendingAlias,
      truncated,
    };
  }

  function renderPromptProgress(typedValue = "") {
    if (!currentPrompt) {
      promptRomanizedEl.textContent = "";
      return;
    }

    const target = currentPrompt.romanized;
    const safeLength = Math.max(0, Math.min(typedValue.length, target.length));
    const typedPart = target.slice(0, safeLength);
    const pendingPart = target.slice(safeLength);

    promptRomanizedEl.innerHTML = "";

    const typedSpan = document.createElement("span");
    typedSpan.className = "prompt__segment prompt__segment--typed";
    typedSpan.textContent = typedPart;
    promptRomanizedEl.appendChild(typedSpan);

    const pendingSpan = document.createElement("span");
    pendingSpan.className = "prompt__segment prompt__segment--pending";
    pendingSpan.textContent = pendingPart;
    promptRomanizedEl.appendChild(pendingSpan);
  }

  function loadPrompt() {
    currentPrompt = phrases[index];
    if (!currentPrompt) {
      endGame();
      return;
    }
    promptOriginalEl.textContent = currentPrompt.original;
    const furigana = currentPrompt.kana || "";
    promptFuriganaEl.textContent = furigana;
    promptFuriganaEl.classList.toggle("is-empty", furigana.length === 0);
    renderPromptProgress("");
    inputEl.value = "";
    inputEl.classList.remove("is-error");
    mistypedCurrent = false;
    lastCanonicalLength = 0;
    clearMissFeedback();
    inputEl.focus();
  }

  function handleInput() {
    if (!currentPrompt) {
      return;
    }
    const target = currentPrompt.romanized;
    const rawValue = inputEl.value;
    const result = processInput(rawValue, target);

    if (inputEl.value !== result.value) {
      inputEl.value = result.value;
    }

    const hasMistake = result.truncated;
    inputEl.classList.toggle("is-error", hasMistake);

    if (hasMistake) {
      mistypedCurrent = true;
      combo = 0;
      updateStatusBar();
      missSoundPlayer.play();
      clearMissFeedback();
      promptRomanizedEl.classList.add("is-miss");
      missFeedbackTimer = setTimeout(() => {
        promptRomanizedEl.classList.remove("is-miss");
        missFeedbackTimer = null;
      }, 280);
      lastCanonicalLength = result.canonical.length;
    }

    renderPromptProgress(result.canonical);

    if (!hasMistake && result.canonical.length > lastCanonicalLength) {
      const gained = result.canonical.length - lastCanonicalLength;
      if (gained > 0) {
        score += gained;
        updateStatusBar();
      }
      typingSoundPlayer.play();
    }

    lastCanonicalLength = result.canonical.length;

    if (result.completed) {
      onCorrect();
    }
  }

  function onCorrect() {
    if (mistypedCurrent) {
      combo = 0;
    } else {
      combo += 1;
      if (combo > 0 && combo % COMBO_TARGET === 0) {
        timeLeft += BONUS_TIME;
        bonusSoundPlayer.play();
        combo = 0;
      }
    }

    updateStatusBar();

    index += 1;
    if (index >= phrases.length) {
      endGame();
      return;
    }

    loadPrompt();
  }

  function tick() {
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateStatusBar();
      endGame();
      return;
    }

    timeLeft -= 1;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateStatusBar();
      endGame();
      return;
    }
    updateStatusBar();
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 1000);
  }

  function endGame() {
    stopTimer();
    finalScoreEl.textContent = String(score);
    timeupSoundPlayer.play();
    clearResultTransitionTimer();
    isResultPending = true;
    setState(STATES.PLAY);
    inputEl.disabled = true;
    resultTransitionTimer = setTimeout(() => {
      setState(STATES.RESULT);
      resultTransitionTimer = null;
      isResultPending = false;
    }, 2500);
  }

  function startGame() {
    if (isResultPending) {
      return;
    }
    resetStats();
    const limit = Math.min(MAX_PHRASES, basePhrases.length);
    phrases = shuffle(basePhrases).slice(0, limit);
    updateStatusBar();
    clearResultTransitionTimer();
    setState(STATES.PLAY);
    loadPrompt();
    inputEl.disabled = false;
    startTimer();
  }

  function returnToStart() {
    if (isResultPending) {
      return;
    }
    stopTimer();
    resetStats();
    updateStatusBar();
    clearResultTransitionTimer();
    phrases = [];
    currentPrompt = null;
    promptOriginalEl.textContent = "";
    promptFuriganaEl.textContent = "";
    promptFuriganaEl.classList.add("is-empty");
    promptRomanizedEl.textContent = "";
    inputEl.value = "";
    inputEl.classList.remove("is-error");
    lastCanonicalLength = 0;
    inputEl.disabled = false;
    setState(STATES.START);
  }

  startBtn.addEventListener("click", () => {
    if (isResultPending) {
      return;
    }
    buttonSoundPlayer.play();
    startGame();
  });

  restartBtn.addEventListener("click", () => {
    if (isResultPending) {
      return;
    }
    buttonSoundPlayer.play();
    returnToStart();
  });

  inputEl.addEventListener("input", handleInput);

  // For accessibility, enter key on start/restart should trigger buttons.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (state === STATES.START) {
      startBtn.focus();
      startBtn.click();
    } else if (state === STATES.RESULT && !isResultPending) {
      restartBtn.focus();
      restartBtn.click();
    }
  });

  returnToStart();
})();
