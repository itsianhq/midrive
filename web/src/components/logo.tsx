import { cn } from "@/lib/utils"

/**
 * The MiDrive mark (from /midrive.svg), cropped to the artwork, in the brand color
 * (primary; a lighter indigo in dark mode where the dark primary lacks contrast).
 * Sized in em and baseline-aligned in <Logo> so the folder body (not its tab) lines up with the text.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="3.5 6.5 41 35"
      fill="currentColor"
      aria-hidden="true"
      className={cn(
        "h-[1.15em] w-auto shrink-0 text-primary dark:text-indigo-400",
        className
      )}
    >
      <path d="M 7 7 C 5.3550302 7 4 8.3550302 4 10 L 4 15 A 1.0001 1.0001 0 1 0 6 15 L 6 10 C 6 9.4349698 6.4349698 9 7 9 L 14.296875 9 C 15.000397 9 15.649926 9.3666518 16.011719 9.96875 L 17.560547 12.544922 C 18.102234 13.445738 19.079382 14 20.130859 14 L 39 14 C 40.668484 14 42 15.331516 42 17 L 42 36 C 42 37.668484 40.668484 39 39 39 L 9 39 C 7.3315161 39 6 37.668484 6 36 L 6 21 C 6 20.43497 6.4349698 20 7 20 L 38 20 A 1.0001 1.0001 0 1 0 38 18 L 7 18 C 5.3550302 18 4 19.35503 4 21 L 4 36 C 4 38.749516 6.2504839 41 9 41 L 39 41 C 41.749516 41 44 38.749516 44 36 L 44 17 C 44 14.250484 41.749516 12 39 12 L 20.130859 12 C 19.778337 12 19.45575 11.818809 19.273438 11.515625 L 17.724609 8.9394531 C 17.002402 7.7375514 15.699353 7 14.296875 7 L 7 7 z M 15.5 25 A 1.5 2 0 0 0 15.5 29 A 1.5 2 0 0 0 15.5 25 z M 32.5 25 A 1.5 2 0 0 0 32.5 29 A 1.5 2 0 0 0 32.5 25 z M 19.958984 29.988281 A 1.0001 1.0001 0 0 0 19.130859 31.496094 C 19.130859 31.496094 20.67631 34 24 34 C 27.32369 34 28.869141 31.496094 28.869141 31.496094 A 1.0007574 1.0007574 0 1 0 27.130859 30.503906 C 27.130859 30.503906 26.39031 32 24 32 C 21.60969 32 20.869141 30.503906 20.869141 30.503906 A 1.0001 1.0001 0 0 0 19.958984 29.988281 z" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 font-semibold tracking-tight",
        className
      )}
    >
      <LogoMark />
      <span>MiDrive</span>
    </div>
  )
}
