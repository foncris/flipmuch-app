import Link from "next/link";
import Logo from "./Logo";
import { getProfile } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Nav() {
  const profile = await getProfile();

  return (
    <header className="flipmuch-nav">
      <Link href="/" className="brand">
        <Logo size={26} />
        GoingFlip
      </Link>
      <nav>
        {profile ? (
          <>
            <Link href="/app" className="nav-link">Calculator</Link>
            {profile.role === "admin" && (
              <Link href="/admin/params" className="nav-link">Admin</Link>
            )}
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="nav-link">Log in</Link>
            <Link href="/signup" className="btn primary">Start free trial</Link>
          </>
        )}
      </nav>
    </header>
  );
}
