# Bangermap integrations

YouTube outlier research as installable pieces, each running on your own free YouTube Data API key.

An outlier is a video that beat its own channel's normal performance. A 10x on a small channel is a stronger signal than a million views on a channel that always gets a million, because it is proof an idea worked without an audience behind it. Everything here measures that, and nothing here meters you.

| Package | What it is |
| --- | --- |
| [`bangermap-mcp`](mcp) | An MCP server, four tools over stdio, for Claude Code, Claude Desktop and any other MCP client |
| [`n8n-nodes-bangermap`](n8n) | An n8n community node, the same four operations, one output item per outlier |

Both read `src/lib`, which is the scoring engine and the YouTube client they share with the [Bangermap](https://bangermap.com) app and its free browser tool. One definition of an outlier, four places it runs, so they cannot disagree.

## Why bring your own key

Google gives every account a free YouTube Data API key with 10,000 units a day, which is roughly 1,100 channel scans. Reading a channel costs one unit. Tools that resell those calls as credits are charging for something that is free on your own key, and metering it is the only way that business works.

So there is no account here, no credits, and no server of ours in the middle. Requests go from your machine to googleapis.com.

## How the baseline works

For each channel, the baseline is the median views of its recent uploads of the same format, counting only uploads old enough to have settled. Shorts and long-form get separate baselines, since comparing a 40-second Short against a 20-minute upload would flatter one and punish the other. A video's multiple is its views divided by that baseline.

Discovery runs through the channel graph rather than keyword search. Google caps search at 100 calls a day on a free key while channel reads cost a single unit, so seeding from a channel you already know is both cheaper and deeper.

The outlier multiple and the baseline are computed here, not by YouTube. View and channel data comes from the YouTube Data API. YouTube is a trademark of Google LLC.

## Build and test

Each package installs and builds on its own.

```sh
cd mcp && npm install && npm run build
cd n8n && npm install && npm run build
```

The shared engine's tests run from the root.

```sh
npm install && npm test
```

## This repo is generated

It is a path-preserving subset of the Bangermap monorepo, synced by a script. Pull requests are welcome as discussion, but the fix lands upstream and arrives here on the next sync, so nothing committed directly here survives.

## The app

[Bangermap](https://bangermap.com) is a Mac app for the same research when you want it to persist. It keeps a watchlist that re-scans and flags what is new since your last visit, shows outliers in a thumbnail wall for pattern study, exports to CSV, and caches locally so repeat research does not re-spend quota. One payment, no subscription, same free key.

## License

MIT
