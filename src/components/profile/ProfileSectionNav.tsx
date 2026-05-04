import Link from "next/link";

type ProfileSection = "identity" | "preferences";

const profileLinks: Array<{
  href: string;
  label: string;
  section: ProfileSection;
}> = [
  {
    href: "/profile",
    label: "Identity",
    section: "identity",
  },
  {
    href: "/profile/preferences",
    label: "Preferences",
    section: "preferences",
  },
];

export function ProfileSectionNav({
  activeSection,
}: {
  activeSection: ProfileSection;
}) {
  return (
    <nav
      aria-label="Profile sections"
      className="mb-6 flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white/75 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 dark:shadow-black/20"
    >
      {profileLinks.map((link) => (
        <Link
          className={`rounded-md px-4 py-2 text-sm font-bold transition ${
            activeSection === link.section
              ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          }`}
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
