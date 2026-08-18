import Swal from 'sweetalert2'

/**
 * One SweetAlert2 instance for the whole app, themed to match the brand palette and the current
 * light/dark mode (see lib/theme.tsx — dark mode toggles a `dark` class on <html>). Every
 * alert/error/confirm popup in the app should go through these, not a bespoke inline banner, so
 * they look and behave the same everywhere.
 */
function isDark() {
  return document.documentElement.classList.contains('dark')
}

function themedSwal() {
  const dark = isDark()
  return Swal.mixin({
    background: dark ? '#0b2942' : '#ffffff',
    color: dark ? '#e2f3f9' : '#1e293b',
    confirmButtonColor: '#164e78',
    cancelButtonColor: '#64748b',
    buttonsStyling: true,
    customClass: {
      popup: 'rounded-xl',
      confirmButton: 'rounded-lg',
      cancelButton: 'rounded-lg',
    },
  })
}

/** A blocking error — something the user must fix before they can continue. */
export function alertError(title: string, text?: string) {
  return themedSwal().fire({ icon: 'error', title, text, confirmButtonText: 'OK' })
}

/** A softer heads-up that doesn't necessarily block the action. */
export function alertWarning(title: string, text?: string) {
  return themedSwal().fire({ icon: 'warning', title, text, confirmButtonText: 'OK' })
}

/** A brief, self-dismissing confirmation — doesn't demand a click. */
export function alertSuccess(title: string, text?: string) {
  return themedSwal().fire({
    icon: 'success',
    title,
    text,
    timer: 2200,
    showConfirmButton: false,
  })
}

/** Yes/No confirmation before an irreversible or consequential action. Resolves true on confirm. */
export async function confirmAction(title: string, text?: string, confirmButtonText = 'Yes, continue') {
  const result = await themedSwal().fire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancel',
  })
  return result.isConfirmed
}
