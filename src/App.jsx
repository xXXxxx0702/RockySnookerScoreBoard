import { useState, useEffect, useRef, useMemo } from 'react';

// ============== BALL DEFINITIONS ==============
const BALLS = [
  { key: 'red',    value: 1, zh: '红', en: 'Red',    fill: '#C8322B', high: '#FF8B83', dark: '#5A0E0A', text: '#fff' },
  { key: 'yellow', value: 2, zh: '黄', en: 'Yellow', fill: '#E8B920', high: '#FFE779', dark: '#6F5400', text: '#3a2c00' },
  { key: 'green',  value: 3, zh: '绿', en: 'Green',  fill: '#1B7B3F', high: '#5BCB7E', dark: '#0A3B1C', text: '#fff' },
  { key: 'brown',  value: 4, zh: '棕', en: 'Brown',  fill: '#7A4B27', high: '#C28E5F', dark: '#2E1A0C', text: '#fff' },
  { key: 'blue',   value: 5, zh: '蓝', en: 'Blue',   fill: '#1F5BAA', high: '#6A95E0', dark: '#0A2454', text: '#fff' },
  { key: 'pink',   value: 6, zh: '粉', en: 'Pink',   fill: '#E89AAE', high: '#FFD5DF', dark: '#9A4A60', text: '#5a1f30' },
  { key: 'black',  value: 7, zh: '黑', en: 'Black',  fill: '#1A1A1A', high: '#555555', dark: '#000000', text: '#fff' }
];

const FOULS = [4, 5, 6, 7];

const INITIAL_STATE = {
  players: [
    { name: '张三', score: 0, frames: 0 },
    { name: '李四', score: 0, frames: 0 }
  ],
  active: 0,
  break: 0,
  redsLeft: 15,
  awaitingColor: false, // true after a red is potted in red phase
  colorsPhase: false,   // entered the final color sequence
  nextColor: 2,         // next color value in colors phase (2→7)
  bestOf: 7,
  frameNo: 1,
  freeBall: false,      // free ball mode: next pot scores the "ball on" value
};

// ============== PERSISTENCE ==============
// Bump the version suffix when the shape of `sb` changes incompatibly.
const STORAGE_KEY = 'snooker:sb:v1';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cheap shape check — reject anything that doesn't look like our state.
    if (
      !parsed ||
      !parsed.state ||
      !Array.isArray(parsed.state.players) ||
      parsed.state.players.length !== 2
    ) return null;
    return {
      state: parsed.state,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      future: Array.isArray(parsed.future) ? parsed.future : [],
    };
  } catch {
    return null;
  }
}

// ============== REDUCER ==============
function reduce(state, action) {
  // Only deep-copy players when an action actually mutates them.
  const TOUCHES_PLAYERS = new Set([
    'POT', 'FOUL', 'CUSTOM_POT', 'CUSTOM_FOUL', 'SET_NAME', 'END_FRAME'
  ]);
  const s = TOUCHES_PLAYERS.has(action.type)
    ? { ...state, players: state.players.map(p => ({ ...p })) }
    : { ...state };

  switch (action.type) {
    case 'POT': {
      const b = action.ball;
      if (s.freeBall) {
        // Free ball: scores the "ball on" value, not the tapped ball's value.
        // Reds are NOT decremented. Exit free-ball mode after the shot.
        let scoreValue;
        if (s.colorsPhase) {
          // Ball on = nextColor. The free ball stands in for that color.
          // The real color stays on table, so nextColor does NOT advance.
          scoreValue = s.nextColor;
        } else if (s.awaitingColor) {
          // Ball on = "any color after red". User nominates by which ball they tap.
          scoreValue = b.value;
          s.awaitingColor = false;
          if (s.redsLeft === 0) {
            s.colorsPhase = true;
            s.nextColor = 2;
          }
        } else {
          // Ball on = red. Free ball counts as red (value 1).
          // Reds count stays the same.
          scoreValue = 1;
          s.awaitingColor = true;
        }
        s.players[s.active].score += scoreValue;
        s.break += scoreValue;
        s.freeBall = false;
        return s;
      }

      // Normal pot
      s.players[s.active].score += b.value;
      s.break += b.value;
      if (b.key === 'red') {
        if (s.redsLeft > 0) {
          s.redsLeft -= 1;
          s.awaitingColor = true;
        }
      } else {
        if (s.colorsPhase) {
          s.nextColor = Math.max(s.nextColor, b.value) + 1;
        } else if (s.awaitingColor) {
          s.awaitingColor = false;
          if (s.redsLeft === 0) {
            s.colorsPhase = true;
            s.nextColor = 2;
          }
        } else if (s.redsLeft === 0 && !s.colorsPhase) {
          s.colorsPhase = true;
          s.nextColor = Math.max(2, b.value) + 1;
        }
      }
      return s;
    }
    case 'FOUL': {
      const other = 1 - s.active;
      s.players[other].score += action.value;
      if (s.redsLeft === 0 && s.awaitingColor) {
        s.colorsPhase = true;
        s.nextColor = 2;
      }
      s.break = 0;
      s.active = other;
      s.awaitingColor = false;
      s.freeBall = false;
      return s;
    }
    case 'CUSTOM_POT': {
      s.players[s.active].score += action.value;
      s.break += action.value;
      return s;
    }
    case 'CUSTOM_FOUL': {
      const other = 1 - s.active;
      s.players[other].score += action.value;
      if (s.redsLeft === 0 && s.awaitingColor) {
        s.colorsPhase = true;
        s.nextColor = 2;
      }
      s.break = 0;
      s.active = other;
      s.awaitingColor = false;
      s.freeBall = false;
      return s;
    }
    case 'SWITCH': {
      if (s.redsLeft === 0 && s.awaitingColor) {
        s.colorsPhase = true;
        s.nextColor = 2;
      }
      s.break = 0;
      s.active = 1 - s.active;
      s.awaitingColor = false;
      s.freeBall = false;
      return s;
    }
    case 'TOGGLE_FREEBALL': {
      s.freeBall = !s.freeBall;
      return s;
    }
    case 'SET_NAME': {
      s.players[action.idx].name = action.name;
      return s;
    }
    case 'END_FRAME': {
      // Explicit winner — caller decides (handles ties via UI picker).
      const winner = action.winner;
      s.players[winner].frames += 1;
      s.players[0].score = 0;
      s.players[1].score = 0;
      s.break = 0;
      s.redsLeft = 15;
      s.awaitingColor = false;
      s.colorsPhase = false;
      s.nextColor = 2;
      s.frameNo += 1;
      s.active = 1 - winner;
      s.freeBall = false;
      return s;
    }
    case 'RESET_FRAME': {
      s.players[0].score = 0;
      s.players[1].score = 0;
      s.break = 0;
      s.redsLeft = 15;
      s.awaitingColor = false;
      s.colorsPhase = false;
      s.nextColor = 2;
      s.freeBall = false;
      return s;
    }
    case 'RESET_ALL': {
      // Keep player names — those are part of the user's setup, not the score.
      return {
        ...INITIAL_STATE,
        players: state.players.map(p => ({ name: p.name, score: 0, frames: 0 })),
      };
    }
    case 'SET_BEST_OF': {
      s.bestOf = action.value;
      return s;
    }
    case 'ADJUST_REDS': {
      const next = Math.max(0, Math.min(15, s.redsLeft + action.delta));
      s.redsLeft = next;
      if (next > 0) s.colorsPhase = false;
      return s;
    }
    case 'ENTER_COLORS_PHASE': {
      s.redsLeft = 0;
      s.colorsPhase = true;
      s.nextColor = 2;
      s.awaitingColor = false;
      return s;
    }
    default:
      return state;
  }
}

// ============== DERIVED HELPERS ==============
function remainingPoints(s) {
  if (s.colorsPhase) {
    let sum = 0;
    for (let v = s.nextColor; v <= 7; v++) sum += v;
    return sum;
  }
  // reds remaining each worth 1 + up to 7 black
  return s.redsLeft * 8 + 27;
}

function snookersNeeded(s) {
  const me = s.players[s.active].score;
  const op = s.players[1 - s.active].score;
  const behind = op - me;
  const remain = remainingPoints(s);
  if (behind <= 0 || behind <= remain) return 0;
  return Math.ceil((behind - remain) / 4);
}

// Returns frame status: { kind: 'open' } | { kind: 'won', leader, trailer, over, snookers }
// `over` = lead - remaining, i.e. how many points the leader is already past the trailer's
// maximum possible total. Positive `over` means the frame is mathematically locked.
function frameStatus(s) {
  const a = s.players[0].score, b = s.players[1].score;
  if (a === b) return { kind: 'open' };
  const remain = remainingPoints(s);
  const leader = a > b ? 0 : 1;
  const diff = Math.abs(a - b);
  if (diff <= remain) return { kind: 'open' };
  const over = diff - remain;
  return {
    kind: 'won',
    leader,
    trailer: 1 - leader,
    over,
    snookers: Math.ceil(over / 4)
  };
}

// `colorsPhase && nextColor > 7` means the final black has been potted.
function isFrameOver(s) {
  return s.colorsPhase && s.nextColor > 7;
}

function matchTarget(bestOf) {
  return Math.floor(bestOf / 2) + 1;
}

function matchStatus(s) {
  const target = matchTarget(s.bestOf);
  const f0 = s.players[0].frames, f1 = s.players[1].frames;
  if (f0 >= target) return { over: true, winner: 0, target };
  if (f1 >= target) return { over: true, winner: 1, target };
  return { over: false, target };
}

// ============== COMPONENTS ==============

function Ball({ ball, onTap, size = 72, flashKey }) {
  const ref = useRef(null);
  useEffect(() => {
    if (flashKey == null) return;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }, [flashKey]);
  return (
    <button
      ref={ref}
      className="ball-btn"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle at 32% 26%, ${ball.high} 0%, ${ball.fill} 42%, ${ball.dark} 100%)`,
        boxShadow: `inset -3px -5px 10px rgba(0,0,0,0.4), inset 2px 3px 6px rgba(255,255,255,0.12), 0 4px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)`,
      }}
      onClick={() => onTap(ball)}
      aria-label={`${ball.zh} ${ball.en} +${ball.value}`}
    >
      <span className="ball-spot" aria-hidden="true">
        <span className="ball-spot-num">{ball.value}</span>
      </span>
    </button>
  );
}

function Header({ state, onMenu }) {
  const status = frameStatus(state);
  const remain = remainingPoints(state);
  const nextBall = state.colorsPhase && state.nextColor <= 7 ? BALLS[state.nextColor - 1] : null;
  // colorsPhase + nextColor>7 is handled by the FrameOverModal; in normal
  // play one of {nextBall, phaseHint} always renders.
  const phaseHint = state.colorsPhase
    ? null
    : state.awaitingColor
      ? { zh: '击红后取彩', en: 'On a colour' }
      : { zh: '击红球', en: 'On a red' };

  return (
    <header className="sb-header">
      <div className="hdr-left">
        <span className="hdr-label">BO</span>
        <span className="hdr-val">{state.bestOf}</span>
        <span className="hdr-sep">·</span>
        <span className="hdr-label">第</span>
        <span className="hdr-val">{state.frameNo}</span>
        <span className="hdr-label" style={{ marginLeft: -2 }}>局</span>
      </div>

      <div className="hdr-center">
        <div className="reds-row" data-empty={state.colorsPhase}>
          {Array.from({ length: 15 }, (_, i) => (
            <span key={i} className={`red-dot ${state.colorsPhase || i >= state.redsLeft ? 'off' : 'on'}`} />
          ))}
        </div>

        <div className="phase-hint">
          {state.freeBall ? (
            <span className="phase-label" style={{ color: 'var(--gold)' }}>🎯 自由球 · FREE BALL</span>
          ) : nextBall ? (
            <>
              <span className="phase-label">下一颗 NEXT</span>
              <span className="next-ball" style={{
                background: `radial-gradient(circle at 32% 26%, ${nextBall.high} 0%, ${nextBall.fill} 50%, ${nextBall.dark} 100%)`
              }}/>
              <span className="next-name">{nextBall.zh} · {nextBall.en}</span>
            </>
          ) : phaseHint && (
            <span className="phase-label">{phaseHint.zh} · {phaseHint.en}</span>
          )}
        </div>

        <div className="remain-pill" title="台面剩余分数 Points remaining on table">
          <span className="hdr-label">剩余</span>
          <span className="remain-val">{remain}</span>
          <span className="hdr-label" style={{ color: 'var(--brass-dim)' }}>分</span>
        </div>
      </div>

      <div className="hdr-right">
        {status.kind === 'won' && (
          <span className="won-badge" title={`${state.players[status.leader].name} 已超分 ${status.over} 分锁定胜局（对手需 ${status.snookers} 个斯诺克）`}>
            <span className="won-name">{state.players[status.leader].name}</span>
            <span className="won-sep">超</span>
            <span className="won-count">{status.over}</span>
            <span className="won-sep">分</span>
          </span>
        )}
        <button className="icon-btn" onClick={onMenu} aria-label="Menu">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

function PlayerPanel({ player, isActive, side, breakScore, onSwitch, onEditName }) {
  return (
    <div
      className={`player-panel side-${side} ${isActive ? 'active' : 'inactive'}`}
      onClick={isActive ? undefined : onSwitch}
    >
      <div className="pp-top">
        <button className="pp-name" onClick={(e) => { e.stopPropagation(); onEditName(); }}>
          <span>{player.name || '——'}</span>
          <svg className="edit-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M11 1.5l3.5 3.5-9 9H2v-3.5z"/>
          </svg>
        </button>
        <div className="pp-frames">
          <span className="frames-label">局 FR</span>
          <span className="frames-val">{player.frames}</span>
        </div>
      </div>

      <div className="pp-score" aria-live="polite">{player.score}</div>

      <div className="pp-bottom">
        {isActive ? (
          <div className="pp-break">
            <span className="break-label">单杆 BREAK</span>
            <span className={`break-val ${breakScore >= 100 ? 'century' : ''}`}>{breakScore}</span>
          </div>
        ) : (
          <span className="pp-tap-hint">轻触切换 · TAP TO SWITCH</span>
        )}
      </div>
    </div>
  );
}

function Keypad({ onClose, onCommit }) {
  const [val, setVal] = useState('');
  const press = (k) => {
    if (k === 'C') { setVal(''); return; }
    if (k === '⌫') { setVal(v => v.slice(0, -1)); return; }
    if (val.length >= 3) return;
    setVal(v => (v === '0' ? k : v + k));
  };
  const num = parseInt(val || '0', 10);
  const commit = (asFoul) => {
    if (num <= 0) return;
    onCommit(num, asFoul);
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal keypad" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">数字键盘 · CUSTOM POINTS</div>
        <div className="keypad-display">{val || '0'}</div>
        <div className="keypad-grid">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} className="keypad-btn" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="keypad-btn accent cancel" onClick={() => press('C')}>清空</button>
          <button className="keypad-btn" onClick={() => press('0')}>0</button>
          <button className="keypad-btn accent cancel" onClick={() => press('⌫')}>⌫</button>
        </div>
        <div className="keypad-actions">
          <button className="menu-btn" onClick={onClose}>取消<span className="menu-btn-en">Cancel</span></button>
          <button className="menu-btn danger" disabled={num <= 0} onClick={() => commit(true)} style={{ opacity: num <= 0 ? 0.4 : 1 }}>
            判罚 +{num || 0}<span className="menu-btn-en">As Foul</span>
          </button>
          <button className="menu-btn confirm" disabled={num <= 0} onClick={() => commit(false)} style={{ opacity: num <= 0 ? 0.4 : 1 }}>
            加分 +{num || 0}<span className="menu-btn-en">Add Points</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Menu({ state, onClose, dispatch, onEndFrame, onResetMatchRequest }) {
  const bestOfOpts = [3, 5, 7, 9, 11, 17, 19];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal menu" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">设置 · SETTINGS</div>

        <div className="menu-row">
          <div>
            <div className="menu-row-label">赛制 (Best of)</div>
            <div className="menu-row-en">FRAMES PER MATCH</div>
          </div>
          <div className="menu-segctl">
            {bestOfOpts.map(n => (
              <button key={n}
                className={`menu-seg ${state.bestOf === n ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_BEST_OF', value: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-row">
          <div>
            <div className="menu-row-label">桌上红球数</div>
            <div className="menu-row-en">REDS REMAINING · {state.redsLeft}</div>
          </div>
          <div className="reds-adjust">
            <button className="reds-adjust-btn" onClick={() => dispatch({ type: 'ADJUST_REDS', delta: -1 })}>−</button>
            <span className="reds-adjust-val">{state.redsLeft}</span>
            <button className="reds-adjust-btn" onClick={() => dispatch({ type: 'ADJUST_REDS', delta: 1 })}>+</button>
          </div>
        </div>

        <div className="menu-row">
          <div>
            <div className="menu-row-label">手动进入彩球阶段</div>
            <div className="menu-row-en">FORCE COLOURS PHASE</div>
          </div>
          <button
            className="menu-btn"
            style={{ padding: '6px 14px' }}
            onClick={() => dispatch({ type: 'ENTER_COLORS_PHASE' })}>
            {state.colorsPhase ? '已进入 ON' : '切换 SET'}
          </button>
        </div>

        <div className="menu-actions">
          <button className="menu-btn danger" onClick={() => { if (confirm('确定重置当前局？')) { dispatch({ type: 'RESET_FRAME' }); onClose(); } }}>
            重置当前局
            <span className="menu-btn-en">Reset Frame</span>
          </button>
          <button className="menu-btn confirm" onClick={() => { onEndFrame(); onClose(); }}>
            结束本局开下局
            <span className="menu-btn-en">End & Next Frame</span>
          </button>
          <button className="menu-btn danger" style={{ gridColumn: '1 / span 2' }} onClick={() => { onResetMatchRequest(); onClose(); }}>
            重置整场比赛
            <span className="menu-btn-en">Reset Match</span>
          </button>
        </div>

        <div className="menu-close-row">
          <button className="menu-close" onClick={onClose}>关闭 Close</button>
        </div>
      </div>
    </div>
  );
}

function NameEditor({ initial, onClose, onSave }) {
  const [v, setV] = useState(initial);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const save = () => {
    onSave(v.trim() || initial);
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal name-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">球员姓名 · PLAYER NAME</div>
        <input
          ref={inputRef}
          className="name-input"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
          maxLength={14}
        />
        <div className="name-actions">
          <button className="menu-btn" onClick={onClose}>取消<span className="menu-btn-en">Cancel</span></button>
          <button className="menu-btn confirm" onClick={save}>保存<span className="menu-btn-en">Save</span></button>
        </div>
      </div>
    </div>
  );
}

// ---------- Outcome modals: tie / frame-over / match-over ----------

function TiePickerModal({ state, onPick, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal outcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">平局 · TIED FRAME</div>
        <div className="outcome-headline">重摆黑球</div>
        <div className="outcome-sub">Re-spotted Black · 谁取胜本局</div>

        <div className="outcome-scoreline">
          <div className="outcome-pn">
            {state.players[0].name}
            <span className="outcome-score">{state.players[0].score}</span>
          </div>
          <div className="outcome-vs">VS</div>
          <div className="outcome-pn">
            {state.players[1].name}
            <span className="outcome-score">{state.players[1].score}</span>
          </div>
        </div>

        <div className="tie-picker">
          <button className="tie-pick-btn" onClick={() => onPick(0)}>
            {state.players[0].name}
            <span className="tie-pick-en">Wins Frame</span>
          </button>
          <button className="tie-pick-btn" onClick={() => onPick(1)}>
            {state.players[1].name}
            <span className="tie-pick-en">Wins Frame</span>
          </button>
        </div>

        <div className="menu-close-row">
          <button className="menu-close" onClick={onClose}>取消 Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FrameOverModal({ state, onConfirm, onClose }) {
  const a = state.players[0].score, b = state.players[1].score;
  const tied = a === b;
  const winner = tied ? null : (a > b ? 0 : 1);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal outcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">本局结束 · FRAME OVER</div>
        <div className="outcome-headline">
          {tied ? '平局' : `${state.players[winner].name} 胜`}
        </div>
        <div className="outcome-sub">
          {tied ? 'Tied — Re-spotted Black needed' : `第 ${state.frameNo} 局 · Frame ${state.frameNo}`}
        </div>

        <div className="outcome-scoreline">
          <div className={`outcome-pn ${winner === 0 ? 'winner' : ''}`}>
            {state.players[0].name}
            <span className="outcome-score">{a}</span>
          </div>
          <div className="outcome-vs">VS</div>
          <div className={`outcome-pn ${winner === 1 ? 'winner' : ''}`}>
            {state.players[1].name}
            <span className="outcome-score">{b}</span>
          </div>
        </div>

        <div className="outcome-actions">
          <button className="menu-btn" onClick={onClose}>
            稍后再说<span className="menu-btn-en">Not Yet</span>
          </button>
          <button className="menu-btn confirm" onClick={() => onConfirm()}>
            {tied ? '选择胜者' : '开始下一局'}
            <span className="menu-btn-en">{tied ? 'Pick Winner' : 'Next Frame'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchOverModal({ state, winner, onClose, onReset }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal outcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trophy" aria-hidden="true">🏆</div>
        <div className="modal-title">整场结束 · MATCH OVER</div>
        <div className="outcome-headline">{state.players[winner].name} 胜出</div>
        <div className="outcome-sub">BO {state.bestOf} · First to {matchTarget(state.bestOf)}</div>

        <div className="outcome-scoreline">
          <div className={`outcome-pn ${winner === 0 ? 'winner' : ''}`}>
            {state.players[0].name}
            <span className="outcome-score">{state.players[0].frames}</span>
          </div>
          <div className="outcome-vs">局 FR</div>
          <div className={`outcome-pn ${winner === 1 ? 'winner' : ''}`}>
            {state.players[1].name}
            <span className="outcome-score">{state.players[1].frames}</span>
          </div>
        </div>

        <div className="outcome-actions">
          <button className="menu-btn" onClick={onClose}>
            关闭<span className="menu-btn-en">Dismiss</span>
          </button>
          <button className="menu-btn confirm" onClick={() => onReset()}>
            重新开始一场
            <span className="menu-btn-en">New Match</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onClose, danger }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal outcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="outcome-headline" style={{ fontSize: 18 }}>{body}</div>
        <div className="outcome-actions" style={{ marginTop: 14 }}>
          <button className="menu-btn" onClick={onClose}>
            取消<span className="menu-btn-en">Cancel</span>
          </button>
          <button className={`menu-btn ${danger ? 'danger' : 'confirm'}`} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
            <span className="menu-btn-en">Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5h7.5a3.5 3.5 0 010 7H6.5"/>
      <path d="M4.5 2.5L2 5l2.5 2.5"/>
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5H6.5a3.5 3.5 0 100 7h3"/>
      <path d="M11.5 2.5L14 5l-2.5 2.5"/>
    </svg>
  );
}
function SwitchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h10"/><path d="M11 3l2 2-2 2"/>
      <path d="M13 11H3"/><path d="M5 9l-2 2 2 2"/>
    </svg>
  );
}
function KeypadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5"/>
      <circle cx="5" cy="6" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="6" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="6" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="9" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="9" r="0.6" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="9" r="0.6" fill="currentColor" stroke="none"/>
    </svg>
  );
}

// ============== APP ==============

export default function App() {
  // Single state container — state + history + future — avoids the
  // anti-pattern of calling setState inside another setState updater,
  // which React 18 may run multiple times and lose updates.
  // Lazy-init from localStorage so a refresh mid-frame doesn't lose progress.
  const [sb, setSb] = useState(() => loadPersisted() ?? {
    state: INITIAL_STATE,
    history: [],
    future: [],
  });
  const state = sb.state;
  const canUndo = sb.history.length > 0;
  const canRedo = sb.future.length > 0;

  // Persist on every change. Wrapped in try/catch — Safari private mode
  // throws on setItem when quota is 0.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sb));
    } catch {
      /* ignore */
    }
  }, [sb]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [floats, setFloats] = useState([]);
  const [flashKey, setFlashKey] = useState({});
  const floatId = useRef(0);

  // Frame-end / match-end / tie picker / reset-confirm UI flags.
  const [frameOverOpen, setFrameOverOpen] = useState(false);
  const [frameOverAck, setFrameOverAck] = useState(false); // once user dismisses, don't reopen until state changes back-and-forward
  const [tieOpen, setTieOpen] = useState(false);
  const [matchOverOpen, setMatchOverOpen] = useState(false);
  const [matchOverAck, setMatchOverAck] = useState(false);
  const [resetMatchOpen, setResetMatchOpen] = useState(false);

  const dispatch = (action) => {
    setSb(cur => ({
      state: reduce(cur.state, action),
      history: [...cur.history, cur.state].slice(-50),
      future: [],
    }));
  };

  const undo = () => {
    setSb(cur => {
      if (!cur.history.length) return cur;
      return {
        state: cur.history[cur.history.length - 1],
        history: cur.history.slice(0, -1),
        future: [cur.state, ...cur.future].slice(0, 50),
      };
    });
  };
  const redo = () => {
    setSb(cur => {
      if (!cur.future.length) return cur;
      return {
        state: cur.future[0],
        history: [...cur.history, cur.state].slice(-50),
        future: cur.future.slice(1),
      };
    });
  };

  const popFloat = (text, side, kind = 'pos') => {
    const id = ++floatId.current;
    setFloats(f => [...f, { id, text, side, kind }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 900);
  };

  // What value will a pot score given the current state (handles free ball)?
  const scoreValueFor = (st, ball) => {
    if (st.freeBall) {
      if (st.colorsPhase) return st.nextColor;
      if (st.awaitingColor) return ball.value;
      return 1;
    }
    return ball.value;
  };

  const handlePot = (ball) => {
    setFlashKey(k => ({ ...k, [ball.key]: (k[ball.key] || 0) + 1 }));
    const sv = scoreValueFor(state, ball);
    popFloat(`+${sv}`, state.active, 'pos');
    dispatch({ type: 'POT', ball });
  };
  const handleFoul = (val) => {
    popFloat(`+${val}`, 1 - state.active, 'neg');
    dispatch({ type: 'FOUL', value: val });
  };
  const handleCustom = (val, asFoul) => {
    if (asFoul) {
      popFloat(`+${val}`, 1 - state.active, 'neg');
      dispatch({ type: 'CUSTOM_FOUL', value: val });
    } else {
      popFloat(`+${val}`, state.active, 'pos');
      dispatch({ type: 'CUSTOM_POT', value: val });
    }
  };

  // ----- Frame / Match end detection -----
  // Auto-open the Frame-Over prompt the first time the final black drops.
  // `frameOverAck` lets the user dismiss it (to undo etc.) without it
  // popping back on every render — it resets when the frame state moves away.
  const frameOver = isFrameOver(state);
  useEffect(() => {
    if (frameOver && !frameOverAck) setFrameOverOpen(true);
    if (!frameOver && frameOverAck) setFrameOverAck(false);
  }, [frameOver, frameOverAck]);

  const ms = useMemo(() => matchStatus(state), [state]);
  useEffect(() => {
    if (ms.over && !matchOverAck) setMatchOverOpen(true);
    if (!ms.over && matchOverAck) setMatchOverAck(false);
  }, [ms.over, matchOverAck]);

  // ----- End-frame flow (handles ties correctly) -----
  const requestEndFrame = () => {
    const a = state.players[0].score, b = state.players[1].score;
    if (a === b) {
      // Tied: must explicitly pick the winner of the re-spotted black.
      setTieOpen(true);
      return;
    }
    const winner = a > b ? 0 : 1;
    dispatch({ type: 'END_FRAME', winner });
    setFrameOverOpen(false);
    setFrameOverAck(true);
  };
  const pickTieWinner = (winner) => {
    dispatch({ type: 'END_FRAME', winner });
    setTieOpen(false);
    setFrameOverOpen(false);
    setFrameOverAck(true);
  };

  const handleFrameOverConfirm = () => {
    // If tied, route through the tie-picker; otherwise just end the frame.
    if (state.players[0].score === state.players[1].score) {
      setFrameOverOpen(false);
      setTieOpen(true);
      return;
    }
    requestEndFrame();
  };

  const handleResetMatch = () => {
    dispatch({ type: 'RESET_ALL' });
    setMatchOverOpen(false);
    setMatchOverAck(true);
  };

  // Scale to viewport, respecting iPhone notch / dynamic-island safe areas.
  // In landscape on a notched iPhone the camera cutout sits on one side of
  // the screen — we both shrink the frame to fit inside the safe area AND
  // shift its centre so it isn't covered.
  const frameRef = useRef(null);
  useEffect(() => {
    // Read the resolved `env(safe-area-inset-*)` values via a hidden probe.
    // env() isn't readable directly from JS, but it resolves inside padding.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);

    const readInsets = () => {
      const cs = getComputedStyle(probe);
      return {
        t: parseFloat(cs.paddingTop)    || 0,
        r: parseFloat(cs.paddingRight)  || 0,
        b: parseFloat(cs.paddingBottom) || 0,
        l: parseFloat(cs.paddingLeft)   || 0,
      };
    };

    const fit = () => {
      if (!frameRef.current) return;
      const ins = readInsets();
      const availW = Math.max(0, window.innerWidth  - ins.l - ins.r);
      const availH = Math.max(0, window.innerHeight - ins.t - ins.b);
      const sx = availW / 852;
      const sy = availH / 393;
      const s = Math.min(sx, sy, 1.2);
      // Shift the frame centre toward the side with the larger inset
      // so it ends up centred *within* the safe area, not the viewport.
      const offsetX = (ins.l - ins.r) / 2;
      const offsetY = (ins.t - ins.b) / 2;
      frameRef.current.style.transform =
        `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${s})`;
    };

    // Some iOS versions update safe-area insets a frame or two after
    // orientationchange fires — re-run after a short delay to catch them.
    const fitTwice = () => { fit(); setTimeout(fit, 250); };

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fitTwice);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fitTwice);
      probe.remove();
    };
  }, []);

  return (
    <div className="stage">
      <div className={`sb-frame ${state.freeBall ? 'freeball-on' : ''}`} ref={frameRef}>
        <Header
          state={state}
          onMenu={() => setMenuOpen(true)}
        />

        <div className="players-row">
          <PlayerPanel
            player={state.players[0]}
            isActive={state.active === 0}
            side="left"
            breakScore={state.break}
            onSwitch={() => dispatch({ type: 'SWITCH' })}
            onEditName={() => setEditingName(0)}
          />
          <div className="divider" />
          <PlayerPanel
            player={state.players[1]}
            isActive={state.active === 1}
            side="right"
            breakScore={state.break}
            onSwitch={() => dispatch({ type: 'SWITCH' })}
            onEditName={() => setEditingName(1)}
          />

          {floats.map(f => (
            <div
              key={f.id}
              className={`score-float ${f.kind}`}
              style={{
                left: f.side === 0 ? '25%' : '75%',
                top: '52%',
              }}
            >{f.text}</div>
          ))}
        </div>

        <div className="ball-row">
          {BALLS.map(b => (
            <Ball
              key={b.key}
              ball={b}
              onTap={handlePot}
              size={76}
              flashKey={flashKey[b.key]}
            />
          ))}
        </div>

        <div className="util-row">
          <div className="util-group">
            <span className="util-label">罚分 Foul</span>
            {FOULS.map(v => (
              <button key={v} className="foul-btn" onClick={() => handleFoul(v)}>
                <span className="foul-prefix">+</span>{v}
              </button>
            ))}
            <button
              className={`freeball-btn ${state.freeBall ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_FREEBALL' })}
              title="自由球 Free Ball — 下一击任选一颗，按目标球计分">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6"/>
                <circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none"/>
              </svg>
              <span className="btn-zh">自由球</span>
            </button>
          </div>

          <div className="util-group">
            <button className="tool-btn" disabled={!canUndo} onClick={undo} title="撤销 Undo">
              <UndoIcon/><span className="btn-zh">撤销</span>
            </button>
            <button className="tool-btn" disabled={!canRedo} onClick={redo} title="重做 Redo">
              <RedoIcon/><span className="btn-zh">重做</span>
            </button>
            <button className="tool-btn primary" onClick={() => dispatch({ type: 'SWITCH' })} title="换人 Miss / Safety">
              <SwitchIcon/><span className="btn-zh">换人</span>
            </button>
            <button className="tool-btn" onClick={() => setKeypadOpen(true)} title="数字键盘 Keypad">
              <KeypadIcon/><span className="btn-zh">键盘</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <Menu
            state={state}
            dispatch={dispatch}
            onEndFrame={requestEndFrame}
            onResetMatchRequest={() => setResetMatchOpen(true)}
            onClose={() => setMenuOpen(false)}
          />
        )}
        {keypadOpen && (
          <Keypad onClose={() => setKeypadOpen(false)} onCommit={handleCustom} />
        )}
        {editingName !== null && (
          <NameEditor
            initial={state.players[editingName].name}
            onClose={() => setEditingName(null)}
            onSave={(name) => dispatch({ type: 'SET_NAME', idx: editingName, name })}
          />
        )}

        {frameOverOpen && !tieOpen && (
          <FrameOverModal
            state={state}
            onConfirm={handleFrameOverConfirm}
            onClose={() => { setFrameOverOpen(false); setFrameOverAck(true); }}
          />
        )}
        {tieOpen && (
          <TiePickerModal
            state={state}
            onPick={pickTieWinner}
            onClose={() => setTieOpen(false)}
          />
        )}
        {matchOverOpen && (
          <MatchOverModal
            state={state}
            winner={ms.winner}
            onClose={() => { setMatchOverOpen(false); setMatchOverAck(true); }}
            onReset={handleResetMatch}
          />
        )}
        {resetMatchOpen && (
          <ConfirmModal
            title="重置整场比赛 · RESET MATCH"
            body="所有比分和局数将清零（球员姓名保留）"
            confirmLabel="确定重置"
            danger
            onConfirm={() => dispatch({ type: 'RESET_ALL' })}
            onClose={() => setResetMatchOpen(false)}
          />
        )}
      </div>

      <div className="rotate-hint">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="20" y="6" width="24" height="40" rx="4"/>
          <path d="M30 42h4"/>
          <path d="M48 32a16 16 0 01-16 16M52 28l-4 4-4-4"/>
        </svg>
        <div className="rh-zh">请将设备旋转至横屏使用</div>
        <div className="rh-en">Rotate device to landscape</div>
      </div>
    </div>
  );
}
