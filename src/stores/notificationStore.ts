import { create } from 'zustand';
import { notificationService } from '@/services/notificationService';
import type { AppNotification } from '@/types';

interface NotificationState {
  items: AppNotification[];
  unread: number;
  refresh(): Promise<void>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,

  async refresh() {
    const [items, unread] = await Promise.all([notificationService.list(60), notificationService.unreadCount()]);
    set({ items, unread });
  },

  async markRead(id) {
    await notificationService.markRead(id);
    await get().refresh();
  },

  async markAllRead() {
    await notificationService.markAllRead();
    await get().refresh();
  },
}));
