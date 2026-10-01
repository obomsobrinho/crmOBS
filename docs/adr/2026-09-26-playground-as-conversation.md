# The test bench becomes a conversation (shared by /agente and the assembly)
- Date: 2026-09-26
- Status: Accepted (owner requests for first impression; same `components/Playground.tsx` in `/agente` and `/montagem`)
- Area: agent-ai

## Decision
- Dressed like Conversas: `FundoRede`, the `Thread` bubble skins (tester is the client, `--bubble-in-*`; agent is the AI, `--bubble-ia-*`) and the `MessageComposer` frame. The tester sits on the RIGHT (it is the client phone), unlike the inbox.
- "Digitando…" (`.digitando` in `globals.css`) while the model thinks, and ONE bubble per item of `messages`, revealed one by one with a pause (`partes` in the turn). ⚠️ `content` stays the join: the history the agent reads treats the turn as ONE block, as in `chat_messages`.
- Audio: recorded in the browser (`MediaRecorder`, up to 2 min), transcribed by `POST /api/playground/transcrever` (owner-only, `whisper-1`, no `language`), and the TEXT goes to the agent, which is what the n8n "Whisper" node does with WhatsApp audio. Sending sound to a model that listens would show an agent that does not exist. The transcript shows under the bubble ("Transcrição: …").
- `diagnostico={false}` removes the diagnostics panel (assembly only: the 672px column cannot hold both and the person wants to see the answer).

## Evidence
- ⚠️ Real transcription not yet proven with a voice; the e2e uses the fake Chromium microphone and a fake response.
