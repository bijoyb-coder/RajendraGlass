import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  src: string
  alt?: string
  thumbnailClassName?: string
}

/** Click the thumbnail to view the image full-size in an overlay; click the overlay (or the close
 * button) to dismiss. Portalled to document.body like SearchableSelect's dropdown, so it's never
 * clipped by an ancestor's overflow-x-auto. The overlay itself is `no-print` -- printing the page
 * prints the plain thumbnail/image in place, not the lightbox chrome. */
export default function ImageLightbox({ src, alt = '', thumbnailClassName }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={thumbnailClassName ?? 'h-28 w-28 object-cover rounded-lg border border-slate-200 cursor-zoom-in'}
      />
      {open && createPortal(
        <div
          className="no-print fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition"
            aria-label="Close"
          >
            <X size={28} />
          </button>
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain rounded-lg" />
        </div>,
        document.body,
      )}
    </>
  )
}
