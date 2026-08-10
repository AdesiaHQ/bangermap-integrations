# Bangermap integrations

YouTube outlier research as installable pieces, each running on your own free YouTube Data API key.

An outlier is a video that beat its own channel's normal performance. A 10x on a small channel is a stronger signal than a million views on a channel that always gets a million, because it is proof an idea worked without an audience behind it. Everything here measures that, and nothing here meters you.

## Quick start

Get a free YouTube Data API key from the Google Cloud console, which is two screens and no billing details. Enable YouTube Data API v3, create an API key, and keep it to hand.

Claude Code, one command.

```sh
claude mcp add bangermap --env YOUTUBE_API_KEY=your-key -- npx -y bangermap-mcp
```

Claude Desktop, in `claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "bangermap": {
      "command": "npx",
      "args": ["-y", "bangermap-mcp"],
      "env": { "YOUTUBE_API_KEY": "your-key" }
    }
  }
}
```

Any other MCP client works the same way. The server speaks stdio, needs only `YOUTUBE_API_KEY` in its environment, and starts with no key at all if you just want to inspect its tools.

## Then ask for what you want

The tools are written to be picked by an agent from a plain request, so these all work as typed.

- Which of MrBeast's recent uploads overperformed?
- Is this video an outlier? https://www.youtube.com/watch?v=...
- What is a normal view count for @veritasium?
- Compare @mkbhd and @mrwhosetheboss, who is having the better month?
- Find channels like @mkbhd and show me what is working across them right now.

## The four tools

Every `channel` argument takes a channel URL, an `@handle`, a channel id, or the URL of any video on that channel.

| Tool | Arguments | What it returns | Quota |
| --- | --- | --- | --- |
| `find_outliers` | `channel`, `depth` (light 50, standard 100, deep 200), `limit` | One channel's recent uploads ranked by multiple against its own baseline | ~5 units |
| `channel_baseline` | `channel` | What normal looks like, baseline views, subscribers, uploads in the last 90 days, best recent multiple | ~5 units |
| `compare_channels` | `channels` (separated by spaces, commas or newlines), `depth`, `limit` | The strongest outliers across several channels, each scored against its own baseline | ~5 units per channel |
| `sweep_niche` | `seed`, `max_channels`, `limit` | Channels featured by the seed channel, then the strongest outliers across all of them | ~5 units per channel found |

A free key carries 10,000 units a day, so roughly 1,100 channel scans.

## The skill

The server does the arithmetic. The [skill](skills/youtube-outlier-research) teaches the method, what a baseline is, how to read a multiple, why age changes the answer, and when one outlier is noise. It follows the open [Agent Skills](https://agentskills.io) format, so it works in any client that reads skills.

In Claude Code, this repo is a plugin marketplace.

```sh
/plugin marketplace add AdesiaHQ/bangermap-integrations
/plugin install youtube-outlier-research@bangermap
```

## Also here

| Package | What it is |
| --- | --- |
| [`bangermap-mcp`](mcp) | The MCP server above |
| [`n8n-nodes-bangermap`](https://github.com/AdesiaHQ/n8n-nodes-bangermap) | An n8n community node, the same four operations, one output item per outlier, in its own repo |

The server reads `src/lib`, the scoring engine and YouTube client it shares with the [Bangermap](https://bangermap.com) app, its free browser tools and the n8n node. One definition of an outlier, four places it runs, so they cannot disagree.

## Why bring your own key

Google gives every account a free YouTube Data API key with 10,000 units a day. Reading a channel costs one unit. Tools that resell those calls as credits are charging for something that is free on your own key, and metering it is the only way that business works.

So there is no account here, no credits, and no server of ours in the middle. Requests go from your machine to googleapis.com.

## How the baseline works

For each channel, the baseline is the median views of its 30 most recent uploads of the same format, counting only uploads at least 7 days old, since younger ones are still climbing. Shorts and long-form get separate baselines, split at 180 seconds, since comparing a 40-second Short against a 20-minute upload would flatter one and punish the other. A video's multiple is its views divided by that baseline. Under 5 settled uploads in a format, there is no baseline and nothing is scored.

Discovery runs through the channel graph rather than keyword search. Google caps search at 100 units a call while channel reads cost a single unit, so seeding from a channel you already know is both cheaper and deeper.

The outlier multiple and the baseline are computed here, not by YouTube. View and channel data comes from the YouTube Data API. YouTube is a trademark of Google LLC.

## Build and test

```sh
cd mcp && npm install && npm run build
```

The shared engine's tests run from the root.

```sh
npm install && npm test
```

## This repo is generated

It is a path-preserving subset of the Bangermap monorepo, synced by a script. Pull requests are welcome as discussion, but the fix lands upstream and arrives here on the next sync, so nothing committed directly here survives.

## The app

[Bangermap](https://bangermap.com) is a macOS and Windows app for the same research when you want it to persist. It keeps a watchlist that re-scans and flags what is new since your last visit, shows outliers in a thumbnail wall for pattern study, exports to CSV, and caches locally so repeat research does not re-spend quota. One payment, no subscription, same free key.

## License

MIT
