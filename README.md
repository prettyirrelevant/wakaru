<p align="center">
  <img src="apps/ui/public/logo.png" alt="Wakaru" width="200" />
</p>

# wakaru

know where your money went. privately.

wakaru is a bank statement analyzer that runs entirely in your browser. upload your statement, see where your money goes, ask questions about your spending. your data never leaves your device.

## why wakaru?

most finance apps want your bank login or upload your data to their servers. wakaru doesn't.

your statement is parsed and stored locally in your browser. when you use the ai chat, the model writes a query, your browser runs it against your own data, and only the rows that answer the question are sent back. we see what you ask about and the answer, never your full statement. you can also point it at a local model and send nothing at all.

## features

- **local parsing**: drop your bank statement, get instant insights
- **balance checked**: we walk your statement's own running balance and tell you if it doesn't add up, so a misread row doesn't quietly skew your totals
- **multiple accounts**: each statement belongs to an account, and money moved between your own accounts stops counting as spending
- **real insights**: where it went by category, who you pay most, what recurs monthly, and what your bank charged you
- **ai chat**: ask questions like "how much did i spend on food in december?" — via our proxy, or your own local model
- **export**: take your parsed data anywhere

## supported banks

every bank formats statements differently. support for some of these wouldn't be possible without help from contributors:

| bank | contributors |
|------|--------------|
| access | ifihan |
| fcmb | mojola |
| gtb | bukunmi, ayomikun, desire |
| kuda | eniola |
| opay | eniola |
| palmpay | mofeoluwa |
| standard chartered | ayomikun |
| uba | phebean, ayomikun |
| wema | eniola |
| zenith | ifihan |
| sterling | feyisara |

## getting started

```bash
pnpm install
pnpm dev
```

## tech stack

- react + typescript
- pglite (postgres in wasm) for in-browser storage and queries
- vercel ai gateway with ling for hosted chat, or any openai-compatible local server
- tailwind with a terminal-inspired ui

## license

mit
