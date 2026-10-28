import { ICONS, type IconName } from './icon-paths'

type Props = { name: IconName; size?: number; className?: string }

/** Stroke icon from the shared set. Decorative: label the button around it, not the icon. */
export function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
      // Paths are constants from icon-paths.ts, never user input.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}

export type { IconName }
