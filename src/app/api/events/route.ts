// Server-Sent Events: pushes the full snapshot after every poller tick.
import { bus, SNAPSHOT_EVENT } from "@/lib/bus";
import { ensurePoller, lastSnapshot } from "@/lib/state";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  ensurePoller();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (snap: Snapshot) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`));
        } catch {
          // stream already closed
        }
      };
      const onSnap = (snap: Snapshot) => send(snap);
      bus().on(SNAPSHOT_EVENT, onSnap);
      const last = lastSnapshot();
      if (last) send(last);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // closed
        }
      }, 25000);
      request.signal.addEventListener("abort", () => {
        bus().off(SNAPSHOT_EVENT, onSnap);
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
