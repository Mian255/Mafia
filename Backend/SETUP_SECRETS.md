# Edge Functions Setup — AI Bot Chat & Voice (owner only)

All credentials live in Supabase secrets / Vault — never in git, never in the app bundle.

## 1. AI bot chat (`ai-bot-chat`)

Bots banter in `day` and `mafia` chat via OpenRouter. Set the key once:

```bash
cd Backend
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-XXXXXXXXXXXXXXXX
# Optional (defaults to openai/gpt-oss-20b:free):
npx supabase secrets set OPENROUTER_MODEL=openai/gpt-oss-20b:free
```

The narrator triggers (migration `20260927000004`) call the function with the
**service role key**, which the function verifies. On hosted Supabase that key
must be stored once in Vault:

```sql
SELECT vault.create_secret('<service_role_key>', 'service_role_key');
```

The function URL is in `app_config.ai_bot_chat.functions_base_url` (already set
to this project). Deploy:

```bash
npx supabase functions deploy ai-bot-chat
```

Note: the OpenRouter key that was shared in chat should be **rotated** at
openrouter.ai since it sat in plaintext conversation history; only the
replacement ever goes into `supabase secrets set`.

## 2. Voice comms (`voice-token`) — LiveKit

Create a free project at cloud.livekit.io, then:

```bash
npx supabase secrets set LIVEKIT_URL=wss://your-project.livekit.cloud
npx supabase secrets set LIVEKIT_API_KEY=APIxxxxxxxxxxxx
npx supabase secrets set LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxx
npx supabase functions deploy voice-token
```

Voice rooms follow MAF-074 phase rules: living players talk by day, everyone is
muted at night/role_reveal, mafia get a private night channel, dead players get
a ghost room.

## 3. Apply the migration

Migrations deploy automatically on push to `dev`/`main` via CI, or manually:

```bash
npx supabase db push
```

## 4. Frontend

No new env vars. Voice UI degrades gracefully: without LiveKit configured the
`voice-token` function returns 503 and `VoiceBar` shows "Voice unavailable";
bot chat silently pauses if OpenRouter errors. AI bot chat needs no client
change — bots write regular `messages` rows that flow through existing realtime.

Native permissions (mic) are added by `@config-plugins/react-native-webrtc` in
`app.json`; run a development build (`npx expo run:android`) — Expo Go does not
include the WebRTC native module.
