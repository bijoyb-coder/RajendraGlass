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

/** A brief, self-dismissing confirmation — doesn't demand a click. Pass `timer` to give a longer
 * (or shorter) read than the 2.2s default, e.g. when `text` carries several lines of figures the
 * user actually needs to read (a save summary), not just a one-word acknowledgement. */
export function alertSuccess(title: string, text?: string, timer = 2200) {
  return themedSwal().fire({
    icon: 'success',
    title,
    text,
    timer,
    showConfirmButton: false,
  })
}

/** Yes/No confirmation before an irreversible or consequential action. Resolves true on confirm.
 * `cancelButtonText` defaults to 'Cancel'; pass a different label (e.g. 'No') when the choice isn't
 * a literal cancel of the action just taken but a fork into a different next step. */
export async function confirmAction(title: string, text?: string, confirmButtonText = 'Yes, continue', cancelButtonText = 'Cancel') {
  const result = await themedSwal().fire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
  })
  return result.isConfirmed
}
