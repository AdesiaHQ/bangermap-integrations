# n8n-nodes-bangermap

Find YouTube outliers in n8n, running on your own free YouTube Data API key.

An outlier is a video that beat its own channel's normal performance. A 10x on a small channel is a stronger signal than a million views on a channel that always gets a million, because it is proof an idea worked without an audience behind it. This node measures that, and hands the result to the rest of your workflow as plain rows.

No account, no credits, no meter. The data comes from Google's public API on your key, so the only quota is the free 10,000 units a day Google already gives you, which is roughly 1,100 channel scans.

## Install

In n8n, open Settings, then Community nodes, then Install, and enter `n8n-nodes-bangermap`.

Self-hosted installs can also run `npm install n8n-nodes-bangermap` in the n8n custom nodes directory.

## Credential

Create a free key in the Google Cloud console and enable YouTube Data API v3 on its project. In n8n, add a Bangermap YouTube Data API credential and paste the key. Requests go from your n8n instance straight to googleapis.com, so no Bangermap account is involved and nothing is metered.

## Operations

| Operation | What it answers | Cost |
| --- | --- | --- |
| Find Outliers | Which of this channel's recent uploads beat its own baseline, and by how much | ~5 units |
| Get Channel Baseline | What normal looks like for this channel, so a view count can be judged | ~5 units |
| Compare Channels | What is working across a set of competitors, each measured against itself | ~5 units per channel |
| Sweep Niche | Which channels a seed channel is connected to, and what is overperforming on them | ~5 units per channel |

Channels can be given as a URL, an @handle, a channel id, or the URL of any video on the channel.

Discovery runs through the channel graph rather than keyword search on purpose. Google caps search at 100 calls a day on a free key while channel reads cost a single unit, so seeding from a channel you already know is both cheaper and deeper.

## Output

One item per outlier, ready to filter, branch on, or write somewhere.

```json
{
  "channelId": "UCBJycsmduvYEL83R_U4JriQ",
  "channelTitle": "Marques Brownlee",
  "channelHandle": "@mkbhd",
  "channelSubscribers": 20100000,
  "videoId": "dQw4w9WgXcQ",
  "title": "The thing nobody expected",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  "views": 4200000,
  "multiple": 3.41,
  "baseline": 1232000,
  "format": "long",
  "duration": "14:22",
  "durationSeconds": 862,
  "publishedAt": "2026-07-19T15:00:04.000Z",
  "ageDays": 18.2,
  "likes": 184000,
  "comments": 9100
}
```

Get Channel Baseline returns a single item instead, carrying separate long-form and Shorts baselines, the typical range around each, how many settled uploads each was drawn from, and the best recent multiple.

## Filters

Every ranking operation takes an optional Min Multiple, Max Age and Format, applied before the limit. Min Multiple 5 with Max Age 7 is the useful shape, since it turns a scheduled run into an alert that only fires when something in the niche actually popped.

## Use as an AI tool

The node is available to AI Agent nodes, so an agent can research a niche on your key and reason about what it finds.

## How the baseline works

For each channel, the baseline is the median views of its recent uploads of the same format, counting only uploads old enough to have settled. Shorts and long-form get separate baselines, since comparing a 40-second Short against a 20-minute upload would flatter one and punish the other. A video's multiple is its views divided by that baseline.

The outlier multiple and the baseline are computed by this node, not by YouTube. View and channel data comes from the YouTube Data API. YouTube is a trademark of Google LLC.

## The app

This node shares its scoring engine with [Bangermap](https://bangermap.com), a Mac app for the same research when you want it to persist. The app keeps a watchlist that re-scans and flags what is new since your last visit, shows outliers in a thumbnail wall for pattern study, exports to CSV, and caches locally so repeat research does not re-spend quota. One payment, no subscription, same free key.

There is also a browser version of the measurement at [bangermap.com/tools/outlier-finder](https://bangermap.com/tools/outlier-finder), and an MCP server, `bangermap-mcp`, for AI clients.

## Compatibility

Tested against n8n 1.120. Needs Node 20 or later, which n8n already requires.

## License

MIT
