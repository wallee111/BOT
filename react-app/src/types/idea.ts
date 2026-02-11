export type Priority = '' | 'urgent' | 'high' | 'medium' | 'low'

export interface Idea {
  id: string
  text: string
  category: string
  categories: string[]
  tags: string[]
  priority: Priority
  createdAt: number
  archived: boolean
  hidden: boolean
  pinned: boolean
  userId: string
  pinnedAt?: number
}

export interface ThreadNote {
  id: string
  text: string
  userId: string
  createdAt: number
}

export interface CategorySettings {
  userId: string
  name: string
  color: string
  visible: boolean
}

export interface UserSettings {
  userId: string
  shortcuts: KeyboardShortcuts
}

export interface KeyboardShortcuts {
  save: string
  focusInput: string
  search: string
  nextIdea: string
  prevIdea: string
  hideUnhide: string
}

export type IdeaStatus = 'all' | 'active' | 'archived'

export interface IdeaFilters {
  status: IdeaStatus
  categories: string[]
  searchQuery: string
  tags: string[]
  sortBy: 'date' | 'priority'
}
