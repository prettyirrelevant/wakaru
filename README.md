# wakaru

know where your money went. privately.

wakaru is a bank statement analyzer that runs entirely in your browser. upload your statement, see where your money goes, ask questions about your spending — your bank statement never leaves your device.

## why

most finance apps want your bank login or upload your data to their servers. wakaru doesn't. your statement is parsed and stored locally in your browser. when you use the ai chat, we only see what you ask about — your full statement stays private.

## features

- **local parsing** — drop your bank statement, get instant insights
- **visual analytics** — see inflows, outflows, and trends at a glance  
- **ai chat** — ask questions like "how much did i spend on food in december?"
- **export** — take your parsed data anywhere

## supported banks

- kuda (more coming soon)

## tech

- react + typescript
- sql.js for in-browser queries
- dexie for local storage
- tailwind with a terminal-inspired ui

## development

```bash
pnpm install
pnpm dev
```

## privacy

your bank statement never leaves your browser. when you ask the ai a question, we run the query locally and send the results to generate a response. we only see what you ask about — your full statement stays private.

## thanks

every bank does statements differently. support for these wouldn't be possible without:

- gtb: bukunmi, damola
- palmpay: mofeoluwa
- access: ifihan
- zenith: ifihan
- standard chartered: damola
- fcmb: mojola

## license

mit
