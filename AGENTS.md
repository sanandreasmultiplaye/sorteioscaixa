<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Push uses payload-less Web Push (VAPID via WebCrypto in src/lib/push.server.ts); the service worker fetches queued messages from /api/public/push/inbox — avoids payload encryption on the Worker runtime.
- public/sw.js is notification-only (no fetch/caching handlers) — keeps previews and deploys free of stale caches.
- Scheduled checker /api/public/hooks/check-draws is idempotent (tracks last concurso and last reminder per lottery in lottery_state) so replays never resend.
