/** Client-side mirror of the server's Design-upload rules (CuttingEntryController.UploadDesign) --
 * only for fast feedback before the file leaves the browser. The server re-checks the file's real
 * bytes regardless of what this file's reported `.type` claims, so this is never authoritative. */
export const ALLOWED_DESIGN_TYPES = ['image/jpeg', 'image/png', 'image/gif']
export const MAX_DESIGN_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

/** Returns a human-readable problem, or null if the file looks fine to upload. */
export function validateDesignFile(file: File): string | null {
  if (!ALLOWED_DESIGN_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG or GIF images are allowed for the Design upload.'
  }
  if (file.size > MAX_DESIGN_FILE_BYTES) {
    return 'The design image must be 5 MB or smaller.'
  }
  return null
}
