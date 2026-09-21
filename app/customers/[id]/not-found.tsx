import Link from "next/link";
import Icon from "@/components/Icons";

export default function CustomerNotFound() {
  return (
    <div className="card anim-rise mx-auto max-w-md px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-lead/10 text-lead">
        <Icon name="users" className="h-8 w-8" />
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold">Customer not found</h1>
      <p className="mt-2 text-lead">This customer may have been deleted, or the link is wrong.</p>
      <Link href="/customers" className="btn btn-primary mt-6">
        Back to customers
      </Link>
    </div>
  );
}
