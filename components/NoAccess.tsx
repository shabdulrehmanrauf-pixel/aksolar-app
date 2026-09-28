import LogoMark from "./LogoMark";
import SignOutButton from "./SignOutButton";

/** Shown instead of the app when a login has no role yet, or has been turned off. */
export default function NoAccess({ email, turnedOff }: { email: string; turnedOff: boolean }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md p-7 text-center">
        <LogoMark className="mx-auto h-10 w-10" />
        <h1 className="mt-4 font-display text-3xl font-bold">
          {turnedOff ? "This account is turned off" : "Waiting for access"}
        </h1>
        <p className="mt-3 text-lead">
          {turnedOff
            ? "The shop owner has turned off this login. Ask the owner if you think this is a mistake."
            : "You are signed in, but the shop owner has not given this login a role yet. Ask the owner to open Team and set one up for you."}
        </p>
        <p className="mt-3 truncate text-sm text-lead" title={email}>
          Signed in as {email}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
