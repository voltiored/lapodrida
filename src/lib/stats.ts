import type { MatchRecord, MatchResult } from '../../shared/types'

export interface MatchView {
  id: string
  endedAt: string
  result: MatchResult
  rank: number
  score: number
  players: number
  rounds: number
  abandoned: boolean // abandoné yo
  winnerNames: string[]
  others: { id: string; name: string; rank: number; score: number }[]
  durationMs: number
}
export interface RivalStat { id: string; name: string; games: number; ahead: number; behind: number; tied: number }
export interface Stats {
  played: number; wins: number; draws: number; losses: number; abandons: number
  winRate: number | null // 0-100
  currentStreak: { type: MatchResult | null; count: number }
  bestWinStreak: number
  bestScore: number | null
  avgScore: number | null
  rivals: RivalStat[]
  history: MatchView[] // más recientes primero
}

export function toMatchView(m: MatchRecord, me: string): MatchView | null {
  const mine = m.players.find(p => p.id === me)
  if (!mine) return null
  return {
    id: m.id ?? `${m.room_code}-${m.game_number}`,
    endedAt: m.ended_at,
    result: mine.result,
    rank: mine.rank,
    score: mine.score,
    players: m.players.length,
    rounds: m.rounds,
    abandoned: mine.abandoned,
    winnerNames: m.players.filter(p => p.rank === 1 && !p.abandoned).map(p => p.name),
    others: m.players.filter(p => p.id !== me).map(p => ({ id: p.id, name: p.name, rank: p.rank, score: p.score })),
    durationMs: Math.max(0, Date.parse(m.ended_at) - Date.parse(m.started_at)),
  }
}

export function computeStats(matches: MatchRecord[], me: string): Stats {
  const views = matches.map(m => toMatchView(m, me)).filter((v): v is MatchView => v !== null)
    .sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt))
  let wins = 0, draws = 0, losses = 0, abandons = 0, scoreSum = 0
  let streakType: MatchResult | null = null, streak = 0, best = 0, run = 0
  let bestScore: number | null = null
  const rivals = new Map<string, RivalStat>()
  for (const v of views) {
    if (v.result === 'WIN') wins++; else if (v.result === 'DRAW') draws++; else losses++
    if (v.abandoned) abandons++
    scoreSum += v.score
    bestScore = bestScore === null ? v.score : Math.max(bestScore, v.score)
    if (v.result === streakType) streak++; else { streakType = v.result; streak = 1 }
    run = v.result === 'WIN' ? run + 1 : 0
    best = Math.max(best, run)
    for (const o of v.others) {
      const r = rivals.get(o.id) ?? { id: o.id, name: o.name, games: 0, ahead: 0, behind: 0, tied: 0 }
      r.name = o.name
      r.games++
      if (v.rank < o.rank) r.ahead++; else if (v.rank > o.rank) r.behind++; else r.tied++
      rivals.set(o.id, r)
    }
  }
  const played = views.length
  return {
    played, wins, draws, losses, abandons,
    winRate: played ? Math.round((wins / played) * 1000) / 10 : null,
    currentStreak: { type: streakType, count: streak },
    bestWinStreak: best,
    bestScore,
    avgScore: played ? Math.round((scoreSum / played) * 10) / 10 : null,
    rivals: [...rivals.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
    history: views.reverse(),
  }
}
