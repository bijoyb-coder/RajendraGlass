import { api } from '../../app/api'

export interface NotificationDto {
  notificationId: number
  type: string
  title: string
  message?: string | null
  link?: string | null
  isRead: boolean
  createdOn: string
  /** Nothing is ever generated against a notification, so this is always true. */
  canDelete: boolean
}

export const notificationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listNotifications: builder.query<{ items: NotificationDto[]; unreadCount: number }, void>({
      query: () => '/notifications',
      providesTags: ['Notification'],
    }),
    markNotificationRead: builder.mutation<void, number>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
    deleteNotification: builder.mutation<void, number>({
      query: (id) => ({ url: `/notifications/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Notification'],
    }),
  }),
})

export const {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
} = notificationsApi
