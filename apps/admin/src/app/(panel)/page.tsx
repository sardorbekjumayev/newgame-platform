"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { HOME, panelOf } from "@/lib/roles";
import { useAuth } from "@/lib/session";

/** Bosh sahifa: rolga qarab o'z paneliga. */
export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const panel = panelOf(me);
  useEffect(() => {
    if (panel) router.replace(HOME[panel]);
  }, [panel, router]);
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Spinner />
    </div>
  );
}
