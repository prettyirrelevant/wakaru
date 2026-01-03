<p align="center">
  <img src="apps/ui/public/logo.png" alt="Wakaru" width="200" />
</p>

# wakaru

know where your money went. privately.

wakaru is a bank statement analyzer that runs entirely in your browser. upload your statement, see where your money goes, ask questions about your spending. your data never leaves your device.

## why wakaru?

most finance apps want your bank login or upload your data to their servers. wakaru doesn't.

your statement is parsed and stored locally in your browser. when you use the ai chat, we run your query locally and only send the results to generate a response. we see what you ask about, not your full statement.

## features

- **local parsing**: drop your bank statement, get instant insights
- **visual analytics**: see inflows, outflows, and trends at a glance
- **ai chat**: ask questions like "how much did i spend on food in december?"
- **export**: take your parsed data anywhere

## supported banks

every bank formats statements differently. support for some of these wouldn't be possible without help from contributors:

| bank | contributors |
|------|--------------|
| access | ifihan |
| fcmb | mojola |
| gtb | bukunmi, ayomikun, desire |
| kuda | |
| opay | |
| palmpay | mofeoluwa |
| standard chartered | ayomikun |
| uba | phebean, ayomikun |
| wema | |
| zenith | ifihan |

## getting started

```bash
pnpm install
pnpm dev
```

## tech stack

- react + typescript
- sql.js for in-browser queries
- dexie for local storage
- tailwind with a terminal-inspired ui

## license

mit
