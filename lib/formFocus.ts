/** After a failed Save: scroll to the first field marked in red and put the cursor there (matters on phones). */
export function focusFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, 0);
}
