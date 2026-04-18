import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mfbpgdoaobafujvxnwmw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pM4M_hF_l-4Yw5_U0DixBw_BUNjnLc7";
const ADMIN_PIN = "1479";
const STORAGE_KEY = "kaneda_horse_club_v1";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const defaultHorses = [
  { id: 1, name: "흑룡", odds: 2.0 },
  { id: 2, name: "백야", odds: 3.0 },
  { id: 3, name: "적월", odds: 4.5 },
  { id: 4, name: "사신", odds: 6.0 },
  { id: 5, name: "청풍", odds: 7.5 },
  { id: 6, name: "황혼", odds: 9.0 },
];

function nowString() {
  return new Date().toLocaleString("ko-KR");
}

function pickWinner(horses) {
  const weights = horses.map((h) => 1 / Math.max(Number(h.odds || 1), 1.01));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < horses.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return horses[i];
  }
  return horses[horses.length - 1];
}

function currency(n) {
  return `$${Number(n || 0).toLocaleString()}`;
}

export default function App() {
  const [roomCode, setRoomCode] = useState("main-room");
  const [roomName, setRoomName] = useState("KANEDA 메인 룸");
  const [horses, setHorses] = useState(defaultHorses);
  const [raceNo, setRaceNo] = useState(1);
  const [raceHistory, setRaceHistory] = useState([]);
  const [betHorseId, setBetHorseId] = useState(1);
  const [betAmount, setBetAmount] = useState(5000);
  const [role, setRole] = useState("viewer");
  const [pinInput, setPinInput] = useState("");
  const [notice, setNotice] = useState("준비 완료");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [racing, setRacing] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const channelRef = useRef(null);
  const raceTimerRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.roomCode) setRoomCode(saved.roomCode);
      if (saved.roomName) setRoomName(saved.roomName);
      if (saved.horses) setHorses(saved.horses);
      if (saved.raceNo) setRaceNo(saved.raceNo);
      if (saved.raceHistory) setRaceHistory(saved.raceHistory);
      if (saved.role) setRole(saved.role);
      if (saved.lastUpdated) setLastUpdated(saved.lastUpdated);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        roomCode,
        roomName,
        horses,
        raceNo,
        raceHistory,
        role,
        lastUpdated,
      })
    );
  }, [roomCode, roomName, horses, raceNo, raceHistory, role, lastUpdated]);

  const isAdmin = role === "admin";

  const selectedHorse = useMemo(
    () => horses.find((h) => h.id === Number(betHorseId)) || horses[0],
    [horses, betHorseId]
  );

  const payout = useMemo(
    () => Number(betAmount || 0) * Number(selectedHorse?.odds || 0),
    [betAmount, selectedHorse]
  );

  const applyRemoteState = (row) => {
    if (!row) return;
    setRoomCode(row.room_code || "main-room");
    setRoomName(row.room_name || "KANEDA 메인 룸");
    setRaceNo(row.race_no || 1);
    setHorses(Array.isArray(row.horses) && row.horses.length ? row.horses : defaultHorses);
    setRaceHistory(Array.isArray(row.race_history) ? row.race_history : []);
    setLastUpdated(row.last_updated || null);
    setWinner(null);
    setRacing(false);
  };

  const saveRoomState = async (overrides = {}, customNotice) => {
    if (!supabase) {
      setNotice("Supabase 연결이 없습니다");
      return false;
    }
    try {
      setSyncing(true);
      const payload = {
        room_code: (overrides.roomCode ?? roomCode).trim(),
        room_name: overrides.roomName ?? roomName,
        race_no: overrides.raceNo ?? raceNo,
        horses: overrides.horses ?? horses,
        race_history: overrides.raceHistory ?? raceHistory,
        last_updated: overrides.lastUpdated ?? nowString(),
      };
      const { error } = await supabase
        .from("race_rooms")
        .upsert(payload, { onConflict: "room_code" });
      if (error) throw error;
      setNotice(customNotice || "실시간 저장 완료");
      setLastUpdated(payload.last_updated);
      return true;
    } catch (error) {
      console.error(error);
      setNotice(`저장 실패: ${error.message}`);
      return false;
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!supabase || !roomCode.trim()) return undefined;
    let alive = true;

    async function connect() {
      try {
        setNotice("룸 연결 중...");
        const code = roomCode.trim();
        const { data, error } = await supabase
          .from("race_rooms")
          .select("room_code, room_name, race_no, horses, race_history, last_updated")
          .eq("room_code", code)
          .maybeSingle();

        if (!alive) return;
        if (error) throw error;

        if (data) {
          applyRemoteState(data);
          setNotice(`룸 ${code} 연결 완료`);
        } else if (role === "admin") {
          await saveRoomState(
            {
              roomCode: code,
              roomName,
              raceNo,
              horses,
              raceHistory,
              lastUpdated: nowString(),
            },
            `새 룸 ${code} 생성 완료`
          );
        } else {
          setNotice("아직 룸이 없습니다. 운영자가 먼저 열어주세요.");
        }

        const channel = supabase
          .channel(`race-room-${code}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "race_rooms",
              filter: `room_code=eq.${code}`,
            },
            (payload) => {
              if (!payload.new) return;
              applyRemoteState(payload.new);
              setNotice(`실시간 갱신됨: ${code}`);
            }
          )
          .subscribe((status) => {
            if (!alive) return;
            setIsConnected(status === "SUBSCRIBED");
          });

        channelRef.current = channel;
      } catch (error) {
        console.error(error);
        setNotice(`연결 실패: ${error.message}`);
      }
    }

    connect();

    return () => {
      alive = false;
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [roomCode]);

  useEffect(() => () => {
    if (raceTimerRef.current) {
      clearTimeout(raceTimerRef.current);
    }
  }, []);

  const unlockAdmin = () => {
    if (pinInput === ADMIN_PIN) {
      setRole("admin");
      setPinInput("");
      setNotice("관리자 인증 완료");
      saveRoomState({}, "관리자 모드로 저장됨");
    } else {
      setNotice("PIN이 올바르지 않습니다");
    }
  };

  const switchViewer = () => {
    setRole("viewer");
    setPinInput("");
    setNotice("관전자 모드");
  };

  const changeHorse = (id, key, value) => {
    if (!isAdmin) return;
    const next = horses.map((h) =>
      h.id === id ? { ...h, [key]: key === "odds" ? Number(value || 0) : value } : h
    );
    setHorses(next);
  };

  const commitHorseSettings = async () => {
    if (!isAdmin) return;
    await saveRoomState({ horses, lastUpdated: nowString() }, "말 설정 저장 완료");
  };

  const startRace = () => {
    if (!isAdmin || racing) return;
    const picked = pickWinner(horses);
    setRacing(true);
    setWinner(null);
    setNotice("경기 진행 중...");

    raceTimerRef.current = setTimeout(async () => {
      const finishedAt = nowString();
      const record = {
        raceNo,
        winnerId: picked.id,
        winnerName: picked.name,
        odds: picked.odds,
        finishedAt,
        horses: horses.map((h) => ({ id: h.id, name: h.name, odds: h.odds })),
      };
      const nextHistory = [record, ...raceHistory].slice(0, 30);
      const nextRaceNo = raceNo + 1;

      setWinner(picked);
      setRaceHistory(nextHistory);
      setRaceNo(nextRaceNo);
      setLastUpdated(finishedAt);
      setRacing(false);
      await saveRoomState(
        {
          raceNo: nextRaceNo,
          raceHistory: nextHistory,
          lastUpdated: finishedAt,
        },
        `${record.raceNo}경기 결과 저장 완료`
      );
    }, 2000);
  };

  const resetHistory = async () => {
    if (!isAdmin) return;
    const stamp = nowString();
    setRaceNo(1);
    setRaceHistory([]);
    setWinner(null);
    setRacing(false);
    await saveRoomState(
      { raceNo: 1, raceHistory: [], lastUpdated: stamp },
      "경기 기록 초기화 완료"
    );
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>KANEDA HORSE CLUB</div>
            <h1 style={styles.title}>실시간 경마 사업 RP</h1>
            <p style={styles.subtitle}>
              같은 룸 코드에 접속한 사람끼리 말 정보, 회차, 경기 기록이 자동 동기화됩니다.
            </p>
          </div>
          <div style={styles.badges}>
            <span style={styles.badge}>룸: {roomCode}</span>
            <span style={styles.badge}>{isAdmin ? "관리자" : "관전자"}</span>
            <span style={styles.badge}>{isConnected ? "실시간 연결됨" : "연결 대기"}</span>
          </div>
        </div>

        <div style={styles.noticeBox}>
          <div>
            <div style={styles.noticeLabel}>상태</div>
            <div style={styles.noticeText}>{notice}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={styles.noticeLabel}>마지막 갱신</div>
            <div style={styles.noticeText}>{lastUpdated || "없음"}</div>
          </div>
        </div>

        <div style={styles.grid}>
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>운영</h2>

            <div style={styles.field}>
              <label style={styles.label}>룸 코드</label>
              <input
                style={styles.input}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="main-room"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>룸 이름</label>
              <input
                style={styles.input}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>관리자 PIN</label>
              <div style={styles.row}>
                <input
                  type="password"
                  style={styles.input}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="PIN 입력"
                />
                <button style={styles.primaryBtn} onClick={unlockAdmin}>
                  관리자 인증
                </button>
                <button style={styles.secondaryBtn} onClick={switchViewer}>
                  관전자
                </button>
              </div>
            </div>

            <div style={styles.row}>
              <button style={styles.primaryBtn} disabled={!isAdmin || racing} onClick={startRace}>
                {racing ? "경기 진행 중..." : "경기 시작"}
              </button>
              <button style={styles.secondaryBtn} disabled={!isAdmin} onClick={commitHorseSettings}>
                설정 저장
              </button>
              <button style={styles.secondaryBtn} disabled={!isAdmin} onClick={resetHistory}>
                기록 초기화
              </button>
            </div>

            <div style={styles.help}>
              기본 관리자 PIN은 <b>1479</b> 입니다. 원하면 <code>src/App.jsx</code>의
              <code> ADMIN_PIN </code> 값을 바꾸면 됩니다.
            </div>
          </section>

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>배팅 계산기</h2>
            <div style={styles.field}>
              <label style={styles.label}>말 번호</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="6"
                value={betHorseId}
                onChange={(e) => setBetHorseId(Number(e.target.value))}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>배팅 금액</label>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="500"
                value={betAmount}
                onChange={(e) => setBetAmount(Number(e.target.value))}
              />
            </div>
            <div style={styles.calcBox}>
              <div>선택한 말: <b>{selectedHorse?.name}</b></div>
              <div>현재 배당: <b>{selectedHorse?.odds?.toFixed(1)}배</b></div>
              <div>예상 지급액: <b>{currency(payout)}</b></div>
            </div>
          </section>
        </div>

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>말 설정</h2>
          <div style={styles.horseGrid}>
            {horses.map((horse) => (
              <div key={horse.id} style={styles.horseCard}>
                <div style={styles.horseTop}>
                  <span style={styles.horseId}>#{horse.id}</span>
                  {winner?.id === horse.id ? <span style={styles.winTag}>우승</span> : null}
                </div>
                <input
                  style={styles.input}
                  value={horse.name}
                  disabled={!isAdmin}
                  onChange={(e) => changeHorse(horse.id, "name", e.target.value)}
                />
                <input
                  style={styles.input}
                  type="number"
                  min="1.1"
                  step="0.1"
                  value={horse.odds}
                  disabled={!isAdmin}
                  onChange={(e) => changeHorse(horse.id, "odds", e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>경기 기록</h2>
          <div style={styles.historyWrap}>
            {raceHistory.length === 0 ? (
              <div style={styles.empty}>아직 경기 기록이 없습니다.</div>
            ) : (
              raceHistory.map((row) => (
                <div key={`${row.raceNo}-${row.finishedAt}`} style={styles.record}>
                  <div style={styles.recordTop}>
                    <strong>{row.raceNo}경기 우승: {row.winnerName}</strong>
                    <span>{row.finishedAt}</span>
                  </div>
                  <div>배당 {Number(row.odds).toFixed(1)}배</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0f1115 0%, #151922 100%)",
    color: "#f5f7fb",
    fontFamily: "Arial, sans-serif",
    padding: "24px",
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    display: "grid",
    gap: "20px",
  },
  hero: {
    background: "#1c2230",
    border: "1px solid #2f394d",
    borderRadius: "20px",
    padding: "24px",
    display: "flex",
    gap: "16px",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  eyebrow: {
    color: "#f87171",
    fontSize: "12px",
    letterSpacing: "0.25em",
    marginBottom: "8px",
    fontWeight: 700,
  },
  title: {
    margin: 0,
    fontSize: "36px",
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#c3cfdf",
    lineHeight: 1.5,
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "flex-start",
  },
  badge: {
    border: "1px solid #394661",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    background: "#131823",
  },
  noticeBox: {
    background: "#1c2230",
    border: "1px solid #2f394d",
    borderRadius: "16px",
    padding: "18px",
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  noticeLabel: {
    color: "#8ea0ba",
    fontSize: "12px",
    marginBottom: "4px",
  },
  noticeText: {
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: "20px",
  },
  panel: {
    background: "#1c2230",
    border: "1px solid #2f394d",
    borderRadius: "16px",
    padding: "20px",
  },
  panelTitle: {
    marginTop: 0,
    marginBottom: "16px",
  },
  field: {
    marginBottom: "14px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    color: "#9eb0c8",
    marginBottom: "6px",
  },
  row: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#111621",
    color: "#f5f7fb",
    border: "1px solid #34405a",
    borderRadius: "10px",
    padding: "12px 14px",
    outline: "none",
  },
  primaryBtn: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryBtn: {
    background: "#2e3a52",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
  calcBox: {
    background: "#111621",
    border: "1px solid #34405a",
    borderRadius: "12px",
    padding: "16px",
    display: "grid",
    gap: "8px",
  },
  help: {
    marginTop: "14px",
    color: "#b8c5d8",
    lineHeight: 1.6,
    fontSize: "14px",
  },
  horseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
  },
  horseCard: {
    background: "#111621",
    border: "1px solid #34405a",
    borderRadius: "14px",
    padding: "14px",
  },
  horseTop: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
  },
  horseId: {
    fontWeight: 700,
  },
  winTag: {
    background: "#dc2626",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "12px",
  },
  historyWrap: {
    display: "grid",
    gap: "10px",
  },
  empty: {
    color: "#9eb0c8",
  },
  record: {
    background: "#111621",
    border: "1px solid #34405a",
    borderRadius: "12px",
    padding: "14px",
  },
  recordTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "6px",
  },
};
