import Link from "next/link";

type BrandLogoProps = {
  href?: string;
};

export function BrandLogo({ href = "/" }: BrandLogoProps) {
  return (
    <Link className="brand-logo" href={href}>
      <span aria-hidden="true" className="brand-logo-mark">
        <svg viewBox="0 0 64 64" role="img">
          <circle className="brand-orbit brand-orbit-teal" cx="24" cy="25" r="13" />
          <circle className="brand-orbit brand-orbit-amber" cx="40" cy="25" r="13" />
          <circle className="brand-orbit brand-orbit-rose" cx="32" cy="39" r="13" />
          <path
            className="brand-thread"
            d="M24 25c5.9-6.4 10.1-6.4 16 0M24 25c2.4 8.5 5.1 11.4 8 14M40 25c-2.4 8.5-5.1 11.4-8 14"
          />
          <circle className="brand-core" cx="24" cy="25" r="4" />
          <circle className="brand-core" cx="40" cy="25" r="4" />
          <circle className="brand-core" cx="32" cy="39" r="4" />
        </svg>
      </span>
      <span className="brand-logo-text">ConnectCircle</span>
    </Link>
  );
}
