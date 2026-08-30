import Image from "next/image";

interface ThemeAppIconProps {
  size: number;
  className?: string;
  priority?: boolean;
}

export function ThemeAppIcon({ size, className = "", priority = false }: ThemeAppIconProps) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <Image
        src="/icons/icon-light-192.png"
        alt="Penthouse Drift"
        fill
        sizes={`${size}px`}
        priority={priority}
        className="object-cover dark:hidden"
      />
      <Image
        src="/icons/icon-dark-192.png"
        alt=""
        fill
        sizes={`${size}px`}
        priority={priority}
        aria-hidden="true"
        className="hidden object-cover dark:block"
      />
    </span>
  );
}