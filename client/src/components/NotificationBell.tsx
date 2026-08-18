import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useListNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation, useDeleteNotificationMutation } from '../features/notifications/notificationsApi'
import { DeleteRowAction } from './DataGrid'

const typeIcon: Record<string, string> = {
  InvoiceCreated: '🧾',
  EInvoiceGenerated: '✅',
  EwayBillGenerated: '🚚',
  OfflineSaleSynced: '📶',
  ComplaintCreated: '⚠️',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data } = useListNotificationsQuery(undefined, { pollingInterval: 60000 })
  const [markRead] = useMarkNotificationReadMutation()
  const [markAllRead] = useMarkAllNotificationsReadMutation()
  const [deleteNotification] = useDeleteNotificationMutation()
  const navigate = useNavigate()

  const unread = data?.unreadCount ?? 0

  function handleClick(id: number, link?: string | null) {
    markRead(id)
    setOpen(false)
    if (link) navigate(link)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative p-2 rounded-full hover:bg-slate-100 transition text-slate-500">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-100 py-2 animate-fade-in max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              {unread > 0 && (
                <button onClick={() => markAllRead()} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </div>
            {(data?.items.length ?? 0) === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</div>
            )}
            {data?.items.map((n) => (
              <div
                key={n.notificationId}
                className={`group flex items-center gap-2 hover:bg-slate-50 transition ${!n.isRead ? 'bg-brand-50/50' : ''}`}
              >
                <button
                  onClick={() => handleClick(n.notificationId, n.link)}
                  className="min-w-0 flex-1 text-left px-4 py-2.5 flex gap-2.5"
                >
                  <span className="text-base leading-none mt-0.5">{typeIcon[n.type] ?? '🔔'}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">{n.title}</span>
                    {n.message && <span className="block text-xs text-slate-500 truncate">{n.message}</span>}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{new Date(n.createdOn).toLocaleString('en-IN')}</span>
                  </span>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                </button>
                <div className="pr-3 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <DeleteRowAction
                    canDelete={n.canDelete}
                    itemLabel={`notification "${n.title}"`}
                    onDelete={() => deleteNotification(n.notificationId).unwrap()}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
