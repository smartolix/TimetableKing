import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Lesson, type Room, type SchoolClass, type Settings, type Subject, type Teacher } from './api'

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') })
export const useSubjects = () => useQuery({ queryKey: ['subjects'], queryFn: () => api.get<Subject[]>('/subjects') })
export const useTeachers = () => useQuery({ queryKey: ['teachers'], queryFn: () => api.get<Teacher[]>('/teachers') })
export const useRooms = () => useQuery({ queryKey: ['rooms'], queryFn: () => api.get<Room[]>('/rooms') })
export const useClasses = () => useQuery({ queryKey: ['classes'], queryFn: () => api.get<SchoolClass[]>('/classes') })
export const useLessons = () => useQuery({ queryKey: ['lessons'], queryFn: () => api.get<Lesson[]>('/lessons') })

function byId<T extends { id: number }>(items: T[] | undefined): Map<number, T> {
  return new Map((items ?? []).map((x) => [x.id, x]))
}

/** Alle Stammdaten auf einmal, mit Nachschlage-Tabellen. */
export function useMasterData() {
  const settings = useSettings()
  const subjects = useSubjects()
  const teachers = useTeachers()
  const rooms = useRooms()
  const classes = useClasses()
  const lessons = useLessons()
  const all = [settings, subjects, teachers, rooms, classes, lessons]
  return {
    loading: all.some((q) => q.isPending),
    error: all.find((q) => q.error)?.error ?? null,
    settings: settings.data,
    subjects: subjects.data ?? [],
    teachers: teachers.data ?? [],
    rooms: rooms.data ?? [],
    classes: classes.data ?? [],
    lessons: lessons.data ?? [],
    subjectById: byId(subjects.data),
    teacherById: byId(teachers.data),
    roomById: byId(rooms.data),
    classById: byId(classes.data),
    lessonById: byId(lessons.data),
  }
}
export type MasterData = ReturnType<typeof useMasterData>

/** Speichern/Löschen eines Eintrags; danach betroffene Listen neu laden. */
export function useSave<T extends { id: number }, In>(path: string, invalidate: string[]) {
  const qc = useQueryClient()
  const done = () => invalidate.forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
  const save = useMutation({
    mutationFn: ({ id, data }: { id?: number; data: In }) =>
      id ? api.put<T>(`/${path}/${id}`, data) : api.post<T>(`/${path}`, data),
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/${path}/${id}`), onSuccess: done })
  return { save, remove }
}
