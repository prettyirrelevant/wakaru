# wakaru

understand your spending. privately.

wakaru is a bank statement analyzer that runs entirely in your browser. upload your statement, see where your money goes, ask questions about your spending — all without your data ever leaving your device.

## why

most finance apps want your bank login or upload your data to their servers. wakaru doesn't. your transactions stay on your device, processed locally, stored locally. the only thing that leaves is your question when you use the chat feature — and even then, we send the question, not your data.

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

your data never leaves your browser. when you ask the ai a question, we generate a sql query from your question, run it locally against your data, then send only the question and query results to get a natural language response. your raw transactions are never transmitted.

## license

mit
