export type Slot = [number, number]

export interface Period { id: number; index: number; label: string; start: string; end: string; break_after: boolean }
export interface Settings {
  school_name: string
  days: number
  weight_class_gap: number
  weight_teacher_gap: number
  weight_late: number
  weight_undesired: number
  late_from_period: number
  periods: Period[]
}
export interface Subject { id: number; short: string; name: string; color: string }
export interface Teacher {
  id: number
  short: string
  name: string
  target_hours: number | null
  max_per_day: number | null
  unavailable: Slot[]
  undesired: Slot[]
}
export interface Room { id: number; short: string; name: string; capacity: number | null; unavailable: Slot[] }
export interface Group { id: number | null; name: string }
export interface Division { id: number | null; name: string; groups: Group[] }
export interface SchoolClass {
  id: number
  name: string
  home_room_id: number | null
  unavailable: Slot[]
  undesired: Slot[]
  divisions: Division[]
}
export interface LessonPart {
  id: number | null
  subject_id: number
  teacher_ids: number[]
  class_ids: number[]
  group_ids: number[]
  room_ids: number[]
}
export interface Lesson {
  id: number
  periods_per_week: number
  double_periods: number
  note: string
  parts: LessonPart[]
}
export type TimetableStatus = 'draft' | 'queued' | 'running' | 'done' | 'failed'
export interface TimetableSummary {
  id: number
  name: string
  status: TimetableStatus
  message: string
  score: number | null
  solve_seconds: number | null
  created_at: string
  updated_at: string
}
export interface Placement { id: number; lesson_id: number; day: number; period: number; length: number; rooms: Record<string, number>; locked: boolean }
export interface ReportEntry { constraint_id: number; violations: number }
export interface Timetable extends TimetableSummary { placements: Placement[]; report: ReportEntry[] }

export type ParamKind = 'int' | 'period' | 'days' | 'slots' | 'bool' | 'teachers' | 'classes' | 'subjects' | 'rooms' | 'subject'
export interface ConstraintParam {
  name: string
  kind: ParamKind
  label: string
  default: unknown
  min: number | null
  max: number | null
  hint: string
  required: boolean
}
export interface ConstraintType { key: string; category: string; title: string; description: string; params: ConstraintParam[] }
export type Importance = 'off' | 'low' | 'normal' | 'high' | 'must'
export interface Catalog { categories: string[]; importance: Record<Importance, string>; types: ConstraintType[] }
export interface Constraint {
  id: number
  type: string
  importance: Importance
  active: boolean
  params: Record<string, unknown>
  note: string
  position: number
}
export interface Conflict { kind: string; message: string; placement_ids: number[]; day: number; period: number }

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(errorText(detail) || `Fehler ${status}`)
    this.status = status
    this.detail = detail
  }
  get conflicts(): Conflict[] {
    const d = this.detail as { conflicts?: Conflict[] } | undefined
    return d?.conflicts ?? []
  }
  get errors(): string[] {
    const d = this.detail as { errors?: string[] } | undefined
    return d?.errors ?? []
  }
}

function errorText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI-Validierungsfehler
    return detail.map((e: { loc?: unknown[]; msg?: string }) => `${(e.loc ?? []).slice(1).join('.')}: ${e.msg}`).join('; ')
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: string }).message)
  return ''
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    let detail: unknown = res.statusText
    try {
      detail = (await res.json()).detail
    } catch {
      /* kein JSON */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
}

export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
