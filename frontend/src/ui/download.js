/** Propose le téléchargement d'un Blob sous le nom donné, via un lien
 * temporaire. L'URL est libérée après un délai, le temps que le navigateur
 * démarre le téléchargement. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
