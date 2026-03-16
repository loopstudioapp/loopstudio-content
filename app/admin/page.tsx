"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/owner/accounts"); }, [router]);
  return null;
}
