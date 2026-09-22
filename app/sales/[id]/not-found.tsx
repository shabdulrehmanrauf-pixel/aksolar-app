import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-8 max-w-md p-8 text-center">
      <h1 className="font-display text-3xl font-bold">Bill not found</h1>
      <p className="mt-2 text-lead">This bill does not exist, or the link is wrong. Open Sales to find it.</p>
      <Link href="/sales" className="btn btn-primary mt-5">
        Go to Sales
      </Link>
    </div>
  );
}
