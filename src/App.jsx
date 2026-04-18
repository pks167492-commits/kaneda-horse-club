import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { motion } from 'framer-motion'
import {
  Crown,
  Eye,
  History,
  Play,
  RotateCcw,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  Copy,
  Download,
  Upload,
  Coins,
} from 'lucide-react'

const STORAGE_KEY = 'kaneda_horse_club_state_v1'
const SUPABASE_URL = 'https://mfbpgdoaobafujvxnwmw.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_pM4M_hF_l-4Yw5_U0DixBw_BUNjnLc7'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const initialHorses = [
  { id: 1, name: '흑룡', odds: 2.0 },
  { id: 2, name: '백야', odds: 3.0 },
  { id: 3, name: '적월', odds: 4.5 },
  { id: 4, name: '사신', odds: 6.0 },
  { id: 5, name: '청풍', odds: 7.5 },
  { id: 6, name: '황혼', odds: 9.0 },
]

const toMoney = (n) => `$${Number(n || 0).toLocaleString()}`

function weightedWinner(horses) {
  const weights = horses.map((h) => 1 / Math.max(Number(h.odds || 1), 1.01))
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < horses.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return horses[i]
  }
  return horses[horses.length - 1]
}

function makeDurations(horses, winnerId) {
  return horses.reduce((acc, horse) => {
    const base = 6 + Math.random() * 3
    acc[horse.id] = horse.id === winnerId ? 5.1 + Math.random() * 0.5 : base
    return acc
  }, {})
}

function makeSharePayload({ horses, raceNo, raceHistory, roomName, roomCode, lastUpdated }) {
  return JSON.stringify(
    { version: 1, horses, raceNo, raceHistory, roomName, roomCode, lastUpdated },
    null,
    2,
  )
}

function App() {
  const [horses, setHorses] = useState(initialHorses)
  const [betHorseId, setBetHorseId] = useState(1)
  const [betAmount, setBetAmount] = useState(5000)
  const [isRacing, setIsRacing] = useState(false)
  const [winner, setWinner] = useState(null)
  const [durations, setDurations] = useState({})
  const [raceNo, setRaceNo] = useState(1)
  const [raceHistory, setRaceHistory] = useState([])
  const [roomName, setRoomName] = useState('KANEDA 메인 룸')
  const [roomCode, setRoomCode] = useState('main-room')
  const [role, setRole] = useState('host')
  const [syncMode, setSyncMode] = useState('realtime')
  const [notice, setNotice] = useState('실시간 동기화 준비 완료')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [shareData, setShareData] = useState('')

  const timerRef = useRef(null)
  const channelRef = useRef(null)

  const isHost = role === 'host'
  const isRealtime = syncMode === 'realtime'

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw)
      if (saved.horses) setHorses(saved.horses)
      if (saved.raceNo) setRaceNo(saved.raceNo)
      if (saved.raceHistory) setRaceHistory(saved.raceHistory)
      if (saved.roomName) setRoomName(saved.roomName)
      if (saved.roomCode) setRoomCode(saved.roomCode)
      if (saved.role) setRole(saved.role)
      if (saved.syncMode) setSyncMode(saved.syncMode)
      if (saved.lastUpdated) setLastUpdated(saved.lastUpdated)
    } catch {
      setNotice('저장 데이터 로딩에 실패했습니다')
    }
  }, [])

  useEffect(() => {
    if (isRacing) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ horses, raceNo, raceHistory, roomName, roomCode, role, syncMode, lastUpdated }),
    )
  }, [horses, raceNo, raceHistory, roomName, roomCode, role, syncMode, lastUpdated, isRacing])

  const selectedHorse = useMemo(
    () => horses.find((h) => h.id === Number(betHorseId)) || horses[0],
    [horses, betHorseId],
  )

  const expectedPayout = useMemo(
    () => Number(betAmount || 0) * Number(selectedHorse?.odds || 0),
    [betAmount, selectedHorse],
  )

  const applyRemoteState = (next) => {
    setRoomName(next.room_name || 'KANEDA 메인 룸')
    setRaceNo(next.race_no || 1)
    setHorses(Array.isArray(next.horses) && next.horses.length ? next.horses : initialHorses)
    setRaceHistory(Array.isArray(next.race_history) ? next.race_history : [])
    setLastUpdated(next.last_updated || null)
    setWinner(null)
    setDurations({})
    setIsRacing(false)
  }

  const pushRoomState = async (override = {}, message = '실시간 룸 상태를 저장했습니다') => {
    if (!isRealtime || !roomCode.trim()) return
    setSyncing(true)
    const payload = {
      room_code: roomCode.trim(),
      room_name: override.roomName ?? roomName,
      race_no: override.raceNo ?? raceNo,
      horses: override.horses ?? horses,
      race_history: override.raceHistory ?? raceHistory,
      last_updated: override.lastUpdated ?? lastUpdated ?? new Date().toLocaleString('ko-KR'),
    }
    const { error } = await supabase.from('race_rooms').upsert(payload, { onConflict: 'room_code' })
    setSyncing(false)
    if (error) {
      setNotice('실시간 저장에 실패했습니다')
      return
    }
    setNotice(message)
  }

  useEffect(() => {
    if (!isRealtime || !roomCode.trim()) {
      setConnected(false)
      return undefined
    }

    let alive = true

    const connect = async () => {
      setNotice('실시간 룸에 연결 중입니다')
      const { data, error } = await supabase
        .from('race_rooms')
        .select('room_code, room_name, race_no, horses, race_history, last_updated')
        .eq('room_code', roomCode.trim())
        .maybeSingle()

      if (!alive) return
      if (error) {
        setNotice('실시간 룸 조회 실패')
        return
      }

      if (data) {
        applyRemoteState(data)
        setNotice(`실시간 룸 ${data.room_code}에 연결되었습니다`)
      } else if (isHost) {
        await pushRoomState(
          {
            roomName,
            raceNo,
            horses,
            raceHistory,
            lastUpdated: new Date().toLocaleString('ko-KR'),
          },
          `새 룸 ${roomCode.trim()} 생성 완료`,
        )
      } else {
        setNotice('운영자가 먼저 룸을 만들어야 합니다')
      }

      const channel = supabase
        .channel(`race-room-${roomCode.trim()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'race_rooms', filter: `room_code=eq.${roomCode.trim()}` },
          (payload) => {
            if (!payload.new) return
            applyRemoteState(payload.new)
            setNotice(`실시간으로 ${payload.new.room_code} 기록이 갱신되었습니다`)
          },
        )
        .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

      channelRef.current = channel
    }

    connect()

    return () => {
      alive = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomCode, role, syncMode])

  const startRace = () => {
    if (!isHost || isRacing) return
    const picked = weightedWinner(horses)
    const nextDurations = makeDurations(horses, picked.id)
    setWinner(null)
    setDurations(nextDurations)
    setIsRacing(true)
    setNotice('레이스 진행 중입니다')

    const longest = Math.max(...Object.values(nextDurations))
    timerRef.current = setTimeout(async () => {
      const finishedAt = new Date().toLocaleString('ko-KR')
      const row = {
        raceNo,
        winnerId: picked.id,
        winnerName: picked.name,
        odds: picked.odds,
        horses: horses.map((h) => ({ id: h.id, name: h.name, odds: h.odds })),
        finishedAt,
      }
      const nextHistory = [row, ...raceHistory].slice(0, 30)
      const nextRaceNo = raceNo + 1
      setWinner(picked)
      setRaceHistory(nextHistory)
      setRaceNo(nextRaceNo)
      setLastUpdated(finishedAt)
      setIsRacing(false)
      await pushRoomState(
        { raceNo: nextRaceNo, raceHistory: nextHistory, lastUpdated: finishedAt },
        `${row.raceNo}경기 결과가 공유되었습니다`,
      )
    }, (longest + 0.3) * 1000)
  }

  const resetRace = () => {
    if (!isHost) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsRacing(false)
    setWinner(null)
    setDurations({})
    setNotice('현재 경기만 초기화했습니다')
  }

  const resetAll = async () => {
    if (!isHost) return
    if (timerRef.current) clearTimeout(timerRef.current)
    const now = new Date().toLocaleString('ko-KR')
    setWinner(null)
    setDurations({})
    setIsRacing(false)
    setRaceNo(1)
    setRaceHistory([])
    setLastUpdated(now)
    await pushRoomState({ raceNo: 1, raceHistory: [], lastUpdated: now }, '전체 기록 초기화 완료')
  }

  const updateHorse = async (id, key, value) => {
    const next = horses.map((h) => (h.id === id ? { ...h, [key]: key === 'odds' ? Number(value || 0) : value } : h))
    setHorses(next)
    if (isHost && isRealtime) {
      await pushRoomState({ horses: next, lastUpdated: new Date().toLocaleString('ko-KR') }, '말 설정 반영 완료')
    }
  }

  const copyShareCode = async () => {
    const text = makeSharePayload({ horses, raceNo, raceHistory, roomName, roomCode, lastUpdated })
    setShareData(text)
    try {
      await navigator.clipboard.writeText(text)
      setNotice('공유 코드가 복사되었습니다')
    } catch {
      setNotice('공유 코드를 직접 복사해주세요')
    }
  }

  const importShareCode = async () => {
    try {
      const parsed = JSON.parse(shareData)
      setHorses(parsed.horses || initialHorses)
      setRaceNo(parsed.raceNo || 1)
      setRaceHistory(parsed.raceHistory || [])
      setRoomName(parsed.roomName || 'KANEDA 메인 룸')
      setRoomCode(parsed.roomCode || 'main-room')
      setLastUpdated(parsed.lastUpdated || new Date().toLocaleString('ko-KR'))
      setNotice('공유 코드를 적용했습니다')
    } catch {
      setNotice('JSON 형식이 아닙니다')
    }
  }

  const downloadShareFile = () => {
    const text = makeSharePayload({ horses, raceNo, raceHistory, roomName, roomCode, lastUpdated })
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kaneda-race-${roomCode}-${raceNo - 1}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="wrap">
        <section className="hero card">
          <div>
            <div className="eyebrow">KANEDA HORSE CLUB</div>
            <h1>브라우저 경마 시뮬레이터</h1>
            <p className="subtext">
              운영자는 레이스를 시작하고, 관전자는 같은 룸 코드로 접속하면 같은 결과와 기록을 자동으로 봅니다.
            </p>
          </div>
          <div className="top-actions">
            <button className="btn primary" onClick={startRace} disabled={!isHost || isRacing}>
              <Play size={16} /> {isRacing ? '경기 진행 중' : '경기 시작'}
            </button>
            <button className="btn" onClick={resetRace} disabled={!isHost}> <RotateCcw size={16} /> 현재 경기 초기화</button>
            <button className="btn danger" onClick={resetAll} disabled={!isHost}>전체 기록 초기화</button>
          </div>
          <div className="badges">
            <span className="badge">현재 경기 {raceNo}</span>
            <span className="badge">룸 {roomName}</span>
            <span className="badge">코드 {roomCode}</span>
            <span className="badge icon-badge">{isRealtime ? <Wifi size={14} /> : <WifiOff size={14} />} {isRealtime ? '실시간' : '로컬'}</span>
            <span className="badge icon-badge">{isHost ? <Crown size={14} /> : <Eye size={14} />} {isHost ? '운영자' : '관전자'}</span>
          </div>
          <div className="status-box">
            <div>
              <div className="muted">상태</div>
              <strong>{notice}</strong>
            </div>
            <div className="status-right muted">
              <div>마지막 갱신: {lastUpdated || '없음'}</div>
              <div>연결 상태: {isRealtime ? (connected ? '연결됨' : '연결 대기') : '로컬'}{syncing ? ' / 저장 중' : ''}</div>
            </div>
          </div>
        </section>

        <div className="grid-main">
          <section className="card">
            <h2>실시간 레이스 트랙</h2>
            <div className="track-list">
              {horses.map((horse) => (
                <div key={horse.id} className="lane">
                  <div className="lane-head">
                    <div className="horse-meta">
                      <span className="horse-id">#{horse.id}</span>
                      <div>
                        <div className="horse-name">{horse.name}</div>
                        <div className="muted">배당 {horse.odds.toFixed(1)}배</div>
                      </div>
                    </div>
                    {winner?.id === horse.id && <span className="badge icon-badge"><Trophy size={14} /> 우승</span>}
                  </div>
                  <div className="lane-track">
                    <div className="finish">FINISH</div>
                    <motion.div
                      className="runner"
                      animate={{ x: isRacing ? 'calc(100% - 84px)' : 0 }}
                      transition={{ duration: durations[horse.id] || 0, ease: 'linear' }}
                    >
                      🐎
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
            <div className="result-box">
              {winner ? (
                <div className="winner-line"><Trophy size={18} /> {raceNo - 1}경기 우승마: {winner.name} ({winner.odds.toFixed(1)}배)</div>
              ) : isRacing ? (
                <div>레이스 진행 중... 결승선 통과 대기</div>
              ) : (
                <div>배팅 마감 후 경기 시작 버튼을 눌러주세요.</div>
              )}
            </div>
          </section>

          <div className="side-col">
            <section className="card">
              <h2>배팅 계산기</h2>
              <label>배팅 말 번호</label>
              <input type="number" min="1" max="6" value={betHorseId} onChange={(e) => setBetHorseId(Number(e.target.value))} />
              <label>배팅 금액</label>
              <input type="number" min="0" step="500" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} />
              <div className="summary-box">
                <div><span className="muted">선택한 말</span><strong>{selectedHorse?.name || '-'}</strong></div>
                <div><span className="muted">현재 배당</span><strong>{selectedHorse?.odds?.toFixed(1) || '0.0'}배</strong></div>
                <div><span className="muted">예상 지급액</span><strong className="money"><Coins size={16} /> {toMoney(expectedPayout)}</strong></div>
              </div>
            </section>

            <section className="card">
              <h2>운영 설정</h2>
              <div className="split-buttons">
                <button className={`btn ${syncMode === 'local' ? 'primary' : ''}`} onClick={() => setSyncMode('local')}>로컬</button>
                <button className={`btn ${syncMode === 'realtime' ? 'primary' : ''}`} onClick={() => setSyncMode('realtime')}>실시간</button>
              </div>
              <div className="split-buttons">
                <button className={`btn ${role === 'host' ? 'primary' : ''}`} onClick={() => setRole('host')}>운영자</button>
                <button className={`btn ${role === 'viewer' ? 'primary' : ''}`} onClick={() => setRole('viewer')}>관전자</button>
              </div>
              <label>룸 이름</label>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
              <label>룸 코드</label>
              <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
              <div className="tip-box">
                같은 URL + 같은 룸 코드면 결과가 자동으로 통일됩니다.
              </div>
              <div className="horse-edit-list">
                {horses.map((horse) => (
                  <div key={horse.id} className="horse-edit-row">
                    <span className="muted">#{horse.id}</span>
                    <input value={horse.name} onChange={(e) => updateHorse(horse.id, 'name', e.target.value)} disabled={!isHost} />
                    <input type="number" step="0.1" min="1.1" value={horse.odds} onChange={(e) => updateHorse(horse.id, 'odds', e.target.value)} disabled={!isHost} />
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2><Users size={18} /> 공유용 기록 코드</h2>
              <div className="button-row">
                <button className="btn" onClick={copyShareCode}><Copy size={16} /> 기록 코드 생성</button>
                <button className="btn" onClick={downloadShareFile}><Download size={16} /> 파일 저장</button>
                <button className="btn" onClick={importShareCode}><Upload size={16} /> 코드 적용</button>
              </div>
              <textarea value={shareData} onChange={(e) => setShareData(e.target.value)} placeholder="공유 코드를 여기에 붙여넣으세요" />
            </section>
          </div>
        </div>

        <div className="grid-bottom">
          <section className="card">
            <h2>RP 진행 멘트 예시</h2>
            <div className="rp-box">
              {roomName} {raceNo}경기 접수 시작.<br />
              1번 {horses[0].name} {horses[0].odds.toFixed(1)}배 / 2번 {horses[1].name} {horses[1].odds.toFixed(1)}배 / 3번 {horses[2].name} {horses[2].odds.toFixed(1)}배<br />
              4번 {horses[3].name} {horses[3].odds.toFixed(1)}배 / 5번 {horses[4].name} {horses[4].odds.toFixed(1)}배 / 6번 {horses[5].name} {horses[5].odds.toFixed(1)}배<br />
              배팅 마감 후 즉시 출주합니다.
            </div>
          </section>

          <section className="card">
            <h2><History size={18} /> 경기 기록</h2>
            {raceHistory.length === 0 ? (
              <div className="empty-box">아직 저장된 경기 기록이 없습니다.</div>
            ) : (
              <div className="history-list">
                {raceHistory.map((row) => (
                  <div key={`${row.raceNo}-${row.finishedAt}`} className="history-item">
                    <div className="history-top">
                      <strong><Trophy size={16} /> {row.raceNo}경기 우승: {row.winnerName}</strong>
                      <span className="muted">{row.finishedAt}</span>
                    </div>
                    <div className="muted">우승 배당 {Number(row.odds).toFixed(1)}배</div>
                    <div className="chip-list">
                      {row.horses.map((horse) => (
                        <span key={`${row.raceNo}-${horse.id}`} className="badge">#{horse.id} {horse.name} {Number(horse.odds).toFixed(1)}배</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
