# bangermap-mcp

YouTube outlier research over MCP, running on your own free YouTube Data API key.

An outlier is a video that beat its own channel's normal performance. A 10x on a small channel is a stronger signal than a million views on a channel that always gets a million, because it is proof an idea worked without an audience behind it. This server measures that, from any MCP client.

No account, no credits, no meter. The data comes from Google's public API on your key, so the only quota is the free 10,000 units a day Google already gives you, which is roughly 1,100 channel scans.

## Setup

Create a free key in the Google Cloud console, enable YouTube Data API v3 on its project, then point your client at the server.

Claude Code:

```sh
claude mcp add bangermap --env YOUTUBE_API_KEY=your-key -- npx -y bangermap-mcp
```

Claude Desktop, in `claude_desktop_config.json`:

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

Any other MCP client works the same way. The server speaks stdio and needs only `YOUTUBE_API_KEY` in its environment.

## Tools

| Tool | What it answers | Cost |
| --- | --- | --- |
| `find_outliers` | Which of this channel's recent uploads beat its own baseline, and by how much | ~5 units |
| `channel_baseline` | What normal looks like for this channel, so a view count can be judged | ~5 units |
| `compare_channels` | What is working across a set of competitors, each measured against itself | ~5 units per channel |
| `sweep_niche` | Which channels a seed channel is connected to, and what is overperforming on them | ~5 units per channel |

Channels can be given as a URL, an @handle, a channel id, or the URL of any video on the channel.

Discovery runs through the channel graph rather than keyword search on purpose. Google caps search at 100 calls a day on a free key while channel reads cost a single unit, so seeding from a channel you already know is both cheaper and deeper.

## How the baseline works

For each channel, the baseline is the median views of its recent uploads of the same format, counting only uploads old enough to have settled. Shorts and long-form get separate baselines, since comparing a 40-second Short against a 20-minute upload would flatter one and punish the other. A video's multiple is its views divided by that baseline.

The outlier multiple and the baseline are computed by this server, not by YouTube. View and channel data comes from the YouTube Data API. YouTube is a trademark of Google LLC.

## The app

This server shares its scoring engine with [Bangermap](https://bangermap.com), a Mac app for the same research when you want it to persist. The app keeps a watchlist that re-scans and flags what is new since your last visit, shows outliers in a thumbnail wall for pattern study, exports to CSV, and caches locally so repeat research does not re-spend quota. One payment, no subscription, same free key.

There is also a free browser version at [bangermap.com/tools/outlier-finder](https://bangermap.com/tools/outlier-finder) if you want to try the measurement without installing anything, and an n8n community node, `n8n-nodes-bangermap`, for the same operations inside a workflow.
