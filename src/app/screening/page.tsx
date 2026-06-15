import { Suspense } from "react";
import ScreeningClient from "./ScreeningClient";

export const dynamic = "force-dynamic";

export default function ScreeningPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">로딩 중...</div>}>
      <ScreeningClient />
    </Suspense>
  );
}
